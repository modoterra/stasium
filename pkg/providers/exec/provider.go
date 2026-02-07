package exec

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/modoterra/stasium/pkg/core"
	"github.com/modoterra/stasium/pkg/daemon"
)

// Provider manages exec-type items via the process supervisor.
type Provider struct {
	supervisor *daemon.Supervisor
	names      []string // registered process names
	logger     *slog.Logger
}

// New creates an exec provider backed by the given supervisor.
func New(supervisor *daemon.Supervisor, logger *slog.Logger) *Provider {
	return &Provider{
		supervisor: supervisor,
		logger:     logger,
	}
}

// AddProcess registers a process with the supervisor and tracks it.
func (p *Provider) AddProcess(name, command, dir string, env map[string]string, restart core.RestartPolicy) {
	p.supervisor.Register(name, command, dir, env, restart)
	p.names = append(p.names, name)
}

func (p *Provider) Name() string { return "exec" }

func (p *Provider) List(_ context.Context) ([]core.Item, error) {
	items := make([]core.Item, 0, len(p.names))
	for _, name := range p.names {
		status, pid, startedAt := p.supervisor.Status(name)
		item := core.Item{
			ID:     core.ItemID(core.KindExec, "supervisor", name),
			Kind:   core.KindExec,
			Name:   name,
			Status: status,
		}
		if pid > 0 {
			item.PIDs = []int{pid}
		}
		if !startedAt.IsZero() && status == core.StatusRunning {
			item.UptimeSec = uint64(time.Since(startedAt).Seconds())
		}
		items = append(items, item)
	}
	return items, nil
}

func (p *Provider) Action(_ context.Context, itemID string, action string) error {
	_, _, name, err := core.ParseItemID(itemID)
	if err != nil {
		return err
	}

	switch action {
	case "start":
		return p.supervisor.Start(name)
	case "stop":
		return p.supervisor.Stop(name)
	case "restart":
		return p.supervisor.Restart(name)
	default:
		return fmt.Errorf("unsupported action %q for exec process", action)
	}
}

// Subscribe implements LogProvider for exec processes.
func (p *Provider) Subscribe(_ context.Context, itemID string) (<-chan core.LogLine, error) {
	_, _, name, err := core.ParseItemID(itemID)
	if err != nil {
		return nil, err
	}
	return p.supervisor.LogChannel(name)
}

// Unsubscribe is a no-op for now (channels are cleaned up on supervisor stop).
func (p *Provider) Unsubscribe(_ string) error {
	return nil
}
