package journald

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"os/exec"
	"sync"
	"time"

	"github.com/modoterra/stasium/pkg/core"
)

// Provider streams logs from journald for systemd units.
type Provider struct {
	subs   map[string]*subscription
	mu     sync.Mutex
	logger *slog.Logger
}

type subscription struct {
	cancel context.CancelFunc
	ch     chan core.LogLine
}

// New creates a new journald log provider.
func New(logger *slog.Logger) *Provider {
	return &Provider{
		subs:   make(map[string]*subscription),
		logger: logger,
	}
}

// Subscribe starts tailing journald for the given systemd unit.
func (p *Provider) Subscribe(ctx context.Context, itemID string) (<-chan core.LogLine, error) {
	_, _, unitName, err := core.ParseItemID(itemID)
	if err != nil {
		return nil, err
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if sub, ok := p.subs[itemID]; ok {
		return sub.ch, nil
	}

	subCtx, cancel := context.WithCancel(ctx)
	ch := make(chan core.LogLine, 100)

	cmd := exec.CommandContext(subCtx, "journalctl", "-f", "-u", unitName, "-o", "cat", "-n", "50")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("journalctl pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("journalctl start: %w", err)
	}

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := core.LogLine{
				ItemID:   itemID,
				TsUnixMs: time.Now().UnixMilli(),
				Stream:   "journal",
				Line:     scanner.Text(),
			}
			select {
			case ch <- line:
			default:
			}
		}
		_ = cmd.Wait()
		close(ch)
		p.mu.Lock()
		delete(p.subs, itemID)
		p.mu.Unlock()
	}()

	p.subs[itemID] = &subscription{cancel: cancel, ch: ch}
	p.logger.Info("subscribed to journal", "unit", unitName)
	return ch, nil
}

// Unsubscribe stops tailing journald for the given item.
func (p *Provider) Unsubscribe(itemID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	sub, ok := p.subs[itemID]
	if !ok {
		return nil
	}
	sub.cancel()
	delete(p.subs, itemID)
	return nil
}
