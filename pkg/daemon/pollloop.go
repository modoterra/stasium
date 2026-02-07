package daemon

import (
	"context"
	"log/slog"
	"time"

	"github.com/modoterra/stasium/pkg/core"
	"github.com/modoterra/stasium/pkg/manifest"
	"github.com/modoterra/stasium/pkg/transport/uds"
)

// PollLoop refreshes all providers every interval and emits delta events.
type PollLoop struct {
	daemon   *Daemon
	interval time.Duration
	logger   *slog.Logger
}

// NewPollLoop creates a poll loop for the given daemon.
func NewPollLoop(d *Daemon, interval time.Duration, logger *slog.Logger) *PollLoop {
	return &PollLoop{daemon: d, interval: interval, logger: logger}
}

// Run starts the poll loop. Blocks until ctx is cancelled.
func (pl *PollLoop) Run(ctx context.Context) {
	ticker := time.NewTicker(pl.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pl.tick(ctx)
		}
	}
}

func (pl *PollLoop) tick(ctx context.Context) {
	newItems := make(map[string]core.Item)

	for _, p := range pl.daemon.providers {
		items, err := p.List(ctx)
		if err != nil {
			pl.logger.Error("provider list error", "provider", p.Name(), "err", err)
			continue
		}
		for _, item := range items {
			newItems[item.ID] = item
		}
	}

	// Apply scoring
	m := pl.daemon.Manifest()
	for id, item := range newItems {
		item.Score = computeScore(item, m)
		newItems[id] = item
	}

	// Compute delta
	pl.daemon.mu.Lock()
	oldItems := pl.daemon.items
	pl.daemon.items = newItems
	pl.daemon.mu.Unlock()

	delta := computeDelta(oldItems, newItems)
	if delta.HasChanges() {
		evt, err := uds.NewEvent(uds.EventItemsDelta, delta)
		if err == nil {
			pl.daemon.Server().Broadcast(evt)
		}
	}
}

// Delta represents changes between poll cycles.
type Delta struct {
	Added   []core.Item `json:"added,omitempty"`
	Updated []core.Item `json:"updated,omitempty"`
	Removed []string    `json:"removed,omitempty"`
}

// HasChanges returns true if the delta contains any changes.
func (d Delta) HasChanges() bool {
	return len(d.Added) > 0 || len(d.Updated) > 0 || len(d.Removed) > 0
}

func computeDelta(old, new map[string]core.Item) Delta {
	var d Delta

	for id, item := range new {
		prev, existed := old[id]
		if !existed {
			d.Added = append(d.Added, item)
		} else if itemChanged(prev, item) {
			d.Updated = append(d.Updated, item)
		}
	}

	for id := range old {
		if _, exists := new[id]; !exists {
			d.Removed = append(d.Removed, id)
		}
	}

	return d
}

func itemChanged(a, b core.Item) bool {
	return a.Status != b.Status ||
		a.CPUPct != b.CPUPct ||
		a.MemBytes != b.MemBytes ||
		a.Score != b.Score
}

func computeScore(item core.Item, m *manifest.Manifest) int {
	score := 0

	// Manifest membership bonus
	if m != nil {
		for _, mi := range m.Items {
			if matchesManifestItem(item, mi) {
				score += 60
				break
			}
		}

		// Rules scoring
		for _, rule := range m.Rules {
			if matchesRule(item, rule) {
				score += rule.Score
			}
		}
	}

	// Heuristic scoring
	if item.CPUPct > 5.0 {
		score += 10
	}
	if item.MemBytes > 100*1024*1024 {
		score += 5
	}

	return score
}

func matchesManifestItem(item core.Item, mi manifest.Item) bool {
	return string(item.Kind) == mi.Kind
}

func matchesRule(item core.Item, rule manifest.Rule) bool {
	for k, v := range rule.Match {
		switch k {
		case "kind":
			if string(item.Kind) != v {
				return false
			}
		case "group":
			if item.Group != v {
				return false
			}
		}
	}
	return true
}
