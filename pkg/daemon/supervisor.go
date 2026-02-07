package daemon

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/modoterra/stasium/pkg/core"
)

// SupervisedProcess tracks a running child process.
type SupervisedProcess struct {
	Name      string
	Command   string
	Dir       string
	Env       map[string]string
	Restart   core.RestartPolicy
	cmd       *exec.Cmd
	cancel    context.CancelFunc
	status    core.Status
	pid       int
	startedAt time.Time
	failures  int
	mu        sync.Mutex
	stdout    *logBuffer
	stderr    *logBuffer
}

// logBuffer is a simple ring buffer for recent log lines.
type logBuffer struct {
	lines []core.LogLine
	mu    sync.Mutex
	subs  []chan core.LogLine
}

func newLogBuffer() *logBuffer {
	return &logBuffer{}
}

func (b *logBuffer) write(itemID, stream, line string) {
	entry := core.LogLine{
		ItemID:   itemID,
		TsUnixMs: time.Now().UnixMilli(),
		Stream:   stream,
		Line:     line,
	}
	b.mu.Lock()
	b.lines = append(b.lines, entry)
	if len(b.lines) > 1000 {
		b.lines = b.lines[len(b.lines)-1000:]
	}
	for _, ch := range b.subs {
		select {
		case ch <- entry:
		default:
		}
	}
	b.mu.Unlock()
}

func (b *logBuffer) subscribe() <-chan core.LogLine {
	ch := make(chan core.LogLine, 100)
	b.mu.Lock()
	b.subs = append(b.subs, ch)
	b.mu.Unlock()
	return ch
}

func (b *logBuffer) unsubscribe(ch <-chan core.LogLine) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i, s := range b.subs {
		if s == ch {
			b.subs = append(b.subs[:i], b.subs[i+1:]...)
			return
		}
	}
}

// Supervisor manages the lifecycle of exec processes.
type Supervisor struct {
	processes map[string]*SupervisedProcess
	mu        sync.RWMutex
	logger    *slog.Logger
	ctx       context.Context
	cancel    context.CancelFunc
}

// NewSupervisor creates a new process supervisor.
func NewSupervisor(ctx context.Context, logger *slog.Logger) *Supervisor {
	sctx, cancel := context.WithCancel(ctx)
	return &Supervisor{
		processes: make(map[string]*SupervisedProcess),
		logger:    logger,
		ctx:       sctx,
		cancel:    cancel,
	}
}

// Register adds a process to be supervised but doesn't start it yet.
func (s *Supervisor) Register(name, command, dir string, env map[string]string, restart core.RestartPolicy) {
	if restart == "" {
		restart = core.RestartOnFailure
	}
	s.mu.Lock()
	s.processes[name] = &SupervisedProcess{
		Name:    name,
		Command: command,
		Dir:     dir,
		Env:     env,
		Restart: restart,
		status:  core.StatusStopped,
		stdout:  newLogBuffer(),
		stderr:  newLogBuffer(),
	}
	s.mu.Unlock()
}

// Start starts a registered process.
func (s *Supervisor) Start(name string) error {
	s.mu.RLock()
	p, ok := s.processes[name]
	s.mu.RUnlock()
	if !ok {
		return fmt.Errorf("unknown process: %s", name)
	}
	return s.startProcess(p)
}

// Stop stops a running process.
func (s *Supervisor) Stop(name string) error {
	s.mu.RLock()
	p, ok := s.processes[name]
	s.mu.RUnlock()
	if !ok {
		return fmt.Errorf("unknown process: %s", name)
	}
	return s.stopProcess(p)
}

// Restart stops and restarts a process.
func (s *Supervisor) Restart(name string) error {
	if err := s.Stop(name); err != nil {
		s.logger.Warn("stop before restart", "name", name, "err", err)
	}
	time.Sleep(100 * time.Millisecond)
	return s.Start(name)
}

// StartAll starts all registered processes.
func (s *Supervisor) StartAll() {
	s.mu.RLock()
	names := make([]string, 0, len(s.processes))
	for name := range s.processes {
		names = append(names, name)
	}
	s.mu.RUnlock()

	for _, name := range names {
		if err := s.Start(name); err != nil {
			s.logger.Error("start process", "name", name, "err", err)
		}
	}
}

// StopAll sends SIGTERM to all processes and waits.
func (s *Supervisor) StopAll() {
	s.cancel()
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.processes {
		s.stopProcess(p)
	}
}

// Status returns the current status of a process.
func (s *Supervisor) Status(name string) (core.Status, int, time.Time) {
	s.mu.RLock()
	p, ok := s.processes[name]
	s.mu.RUnlock()
	if !ok {
		return core.StatusUnknown, 0, time.Time{}
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.status, p.pid, p.startedAt
}

// LogChannel returns a channel for streaming stdout/stderr.
func (s *Supervisor) LogChannel(name string) (<-chan core.LogLine, error) {
	s.mu.RLock()
	p, ok := s.processes[name]
	s.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("unknown process: %s", name)
	}
	// Merge stdout and stderr into one channel
	merged := make(chan core.LogLine, 100)
	outCh := p.stdout.subscribe()
	errCh := p.stderr.subscribe()
	go func() {
		for {
			select {
			case l, ok := <-outCh:
				if !ok {
					return
				}
				merged <- l
			case l, ok := <-errCh:
				if !ok {
					return
				}
				merged <- l
			case <-s.ctx.Done():
				return
			}
		}
	}()
	return merged, nil
}

func (s *Supervisor) startProcess(p *SupervisedProcess) error {
	p.mu.Lock()
	if p.status == core.StatusRunning {
		p.mu.Unlock()
		return nil
	}
	p.mu.Unlock()

	return s.spawn(p)
}

func (s *Supervisor) spawn(p *SupervisedProcess) error {
	ctx, cancel := context.WithCancel(s.ctx)
	parts := strings.Fields(p.Command)
	if len(parts) == 0 {
		cancel()
		return fmt.Errorf("empty command")
	}

	cmd := exec.CommandContext(ctx, parts[0], parts[1:]...)
	cmd.Dir = p.Dir
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	// Build env
	cmd.Env = os.Environ()
	for k, v := range p.Env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}

	itemID := core.ItemID(core.KindExec, "supervisor", p.Name)

	// Capture stdout/stderr via pipes
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("stdout pipe: %w", err)
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("start %q: %w", p.Command, err)
	}

	p.mu.Lock()
	p.cmd = cmd
	p.cancel = cancel
	p.pid = cmd.Process.Pid
	p.status = core.StatusRunning
	p.startedAt = time.Now()
	p.mu.Unlock()

	s.logger.Info("process started", "name", p.Name, "pid", p.pid, "command", p.Command)

	// Stream stdout/stderr
	go scanLines(stdoutPipe, func(line string) { p.stdout.write(itemID, "stdout", line) })
	go scanLines(stderrPipe, func(line string) { p.stderr.write(itemID, "stderr", line) })

	// Wait for exit and handle restart
	go s.waitAndRestart(p, cmd, cancel)

	return nil
}

func (s *Supervisor) waitAndRestart(p *SupervisedProcess, cmd *exec.Cmd, cancel context.CancelFunc) {
	err := cmd.Wait()
	cancel()

	p.mu.Lock()
	p.pid = 0
	exitCode := -1
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	if s.ctx.Err() != nil {
		p.status = core.StatusStopped
		p.mu.Unlock()
		return
	}

	if exitCode == 0 {
		p.status = core.StatusStopped
	} else {
		p.status = core.StatusFailed
	}
	p.failures++
	failures := p.failures
	restart := p.Restart
	p.mu.Unlock()

	s.logger.Info("process exited", "name", p.Name, "exit_code", exitCode, "err", err)

	shouldRestart := false
	switch restart {
	case core.RestartAlways:
		shouldRestart = true
	case core.RestartOnFailure:
		shouldRestart = exitCode != 0
	case core.RestartNever:
		shouldRestart = false
	}

	if shouldRestart {
		delay := backoff(failures)
		s.logger.Info("restarting process", "name", p.Name, "delay", delay, "attempt", failures)

		p.mu.Lock()
		p.status = core.StatusRestarting
		p.mu.Unlock()

		select {
		case <-time.After(delay):
			if err := s.spawn(p); err != nil {
				s.logger.Error("restart failed", "name", p.Name, "err", err)
			}
		case <-s.ctx.Done():
			return
		}
	}
}

func (s *Supervisor) stopProcess(p *SupervisedProcess) error {
	p.mu.Lock()
	if p.status != core.StatusRunning || p.cmd == nil || p.cmd.Process == nil {
		p.mu.Unlock()
		return nil
	}
	cmd := p.cmd
	cancel := p.cancel
	p.Restart = core.RestartNever // prevent auto-restart
	p.mu.Unlock()

	// Send SIGTERM to process group
	syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)

	done := make(chan struct{})
	go func() {
		cmd.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		<-done
	}

	if cancel != nil {
		cancel()
	}

	p.mu.Lock()
	p.status = core.StatusStopped
	p.pid = 0
	p.mu.Unlock()

	return nil
}

// backoff returns exponential backoff delay: 1s, 2s, 4s, 8s, 16s, 30s max.
func backoff(failures int) time.Duration {
	d := time.Duration(1<<uint(failures-1)) * time.Second
	if d > 30*time.Second {
		d = 30 * time.Second
	}
	return d
}
