package systemd

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/coreos/go-systemd/v22/dbus"

	"github.com/modoterra/stasium/pkg/core"
)

// Provider manages systemd units via D-Bus.
type Provider struct {
	units  []string // unit names to monitor (from manifest)
	logger *slog.Logger
}

// New creates a new systemd provider for the given unit names.
func New(units []string, logger *slog.Logger) *Provider {
	return &Provider{units: units, logger: logger}
}

func (p *Provider) Name() string { return "systemd" }

func (p *Provider) List(ctx context.Context) ([]core.Item, error) {
	conn, err := dbus.NewWithContext(ctx)
	if err != nil {
		return nil, fmt.Errorf("dbus connect: %w", err)
	}
	defer conn.Close()

	allUnits, err := conn.ListUnitsByNamesContext(ctx, p.units)
	if err != nil {
		return nil, fmt.Errorf("list units: %w", err)
	}

	items := make([]core.Item, 0, len(allUnits))
	for _, u := range allUnits {
		item := core.Item{
			ID:     core.ItemID(core.KindSystemd, "system", u.Name),
			Kind:   core.KindSystemd,
			Name:   strings.TrimSuffix(u.Name, ".service"),
			Status: mapStatus(u.ActiveState, u.SubState),
			Source: map[string]string{
				"unit":        u.Name,
				"activeState": u.ActiveState,
				"subState":    u.SubState,
				"loadState":   u.LoadState,
			},
		}
		if u.ActiveState == "active" {
			props, err := conn.GetUnitTypePropertiesContext(ctx, u.Name, "Service")
			if err == nil {
				if pid, ok := props["MainPID"].(uint32); ok && pid > 0 {
					item.PIDs = []int{int(pid)}
				}
				if mem, ok := props["MemoryCurrent"].(uint64); ok {
					item.MemBytes = mem
				}
			}
		}
		items = append(items, item)
	}
	return items, nil
}

func (p *Provider) Action(ctx context.Context, itemID string, action string) error {
	_, _, nativeID, err := core.ParseItemID(itemID)
	if err != nil {
		return err
	}

	conn, err := dbus.NewWithContext(ctx)
	if err != nil {
		return fmt.Errorf("dbus connect: %w", err)
	}
	defer conn.Close()

	ch := make(chan string, 1)
	switch action {
	case "start":
		_, err = conn.StartUnitContext(ctx, nativeID, "replace", ch)
	case "stop":
		_, err = conn.StopUnitContext(ctx, nativeID, "replace", ch)
	case "restart":
		_, err = conn.RestartUnitContext(ctx, nativeID, "replace", ch)
	default:
		return fmt.Errorf("unsupported action %q for systemd unit", action)
	}
	if err != nil {
		return fmt.Errorf("systemd %s %s: %w", action, nativeID, err)
	}

	result := <-ch
	if result != "done" {
		return fmt.Errorf("systemd %s %s: job result %q", action, nativeID, result)
	}
	return nil
}

func mapStatus(active, sub string) core.Status {
	switch {
	case active == "active" && sub == "running":
		return core.StatusRunning
	case active == "active":
		return core.StatusRunning
	case active == "inactive", active == "deactivating":
		return core.StatusStopped
	case active == "failed":
		return core.StatusFailed
	default:
		return core.StatusUnknown
	}
}
