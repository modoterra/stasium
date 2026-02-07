package procfs

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/modoterra/stasium/pkg/core"
)

// Provider discovers processes from /proc.
type Provider struct {
	logger *slog.Logger
}

// New creates a new procfs provider.
func New(logger *slog.Logger) *Provider {
	return &Provider{logger: logger}
}

func (p *Provider) Name() string { return "procfs" }

func (p *Provider) List(_ context.Context) ([]core.Item, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, fmt.Errorf("read /proc: %w", err)
	}

	var items []core.Item
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(e.Name())
		if err != nil {
			continue
		}

		cmdline, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
		if err != nil {
			continue
		}
		cmd := strings.ReplaceAll(string(cmdline), "\x00", " ")
		cmd = strings.TrimSpace(cmd)
		if cmd == "" {
			continue
		}

		// Only include "interesting" processes (heuristic)
		if !isInteresting(cmd, pid) {
			continue
		}

		name := strings.Fields(cmd)[0]
		items = append(items, core.Item{
			ID:     core.ItemID(core.KindProcess, "procfs", strconv.Itoa(pid)),
			Kind:   core.KindProcess,
			Name:   name,
			Status: core.StatusRunning,
			PIDs:   []int{pid},
			Source: map[string]string{"cmdline": cmd},
		})
	}
	return items, nil
}

func (p *Provider) Action(_ context.Context, itemID string, action string) error {
	_, _, pidStr, err := core.ParseItemID(itemID)
	if err != nil {
		return err
	}
	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return fmt.Errorf("invalid PID: %s", pidStr)
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}

	switch action {
	case "term":
		return proc.Signal(os.Interrupt)
	case "kill":
		return proc.Kill()
	default:
		return fmt.Errorf("unsupported action %q for process", action)
	}
}

// isInteresting returns true if the process is worth showing.
func isInteresting(cmdline string, pid int) bool {
	interesting := []string{
		"nginx", "php-fpm", "php", "node", "npm", "redis", "mysql", "mariadbd",
		"postgres", "docker", "artisan", "queue:work", "schedule:",
		"python", "gunicorn", "uvicorn", "java", "reverb",
	}
	lower := strings.ToLower(cmdline)
	for _, kw := range interesting {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}
