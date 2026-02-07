package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/modoterra/stasium/pkg/core"
	"github.com/modoterra/stasium/pkg/manifest"
	"github.com/modoterra/stasium/pkg/transport/uds"
)

// Daemon is the main stasiumd process that manages providers, state, and transport.
type Daemon struct {
	server    *uds.Server
	manifest  *manifest.Manifest
	providers []core.Provider
	items     map[string]core.Item
	mu        sync.RWMutex
	logger    *slog.Logger
}

// New creates a new daemon instance.
func New(socketPath string, logger *slog.Logger) *Daemon {
	srv := uds.NewServer(socketPath, logger)
	d := &Daemon{
		server: srv,
		items:  make(map[string]core.Item),
		logger: logger,
	}
	d.registerHandlers()
	return d
}

// AddProvider registers a provider with the daemon.
func (d *Daemon) AddProvider(p core.Provider) {
	d.providers = append(d.providers, p)
}

// Manifest returns the currently loaded manifest (may be nil).
func (d *Daemon) Manifest() *manifest.Manifest {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.manifest
}

// Run starts the daemon and blocks until the context is cancelled.
func (d *Daemon) Run(ctx context.Context) error {
	return d.server.Start(ctx)
}

// Shutdown cleans up resources.
func (d *Daemon) Shutdown() {
	d.server.Shutdown()
}

// Server returns the underlying UDS server (for broadcasting events).
func (d *Daemon) Server() *uds.Server {
	return d.server
}

func (d *Daemon) registerHandlers() {
	d.server.Handle(uds.MethodPing, d.handlePing)
	d.server.Handle(uds.MethodLoadManifest, d.handleLoadManifest)
	d.server.Handle(uds.MethodListItems, d.handleListItems)
	d.server.Handle(uds.MethodGetItem, d.handleGetItem)
	d.server.Handle(uds.MethodAction, d.handleAction)
}

func (d *Daemon) handlePing(_ context.Context, _ uds.Message) (any, error) {
	return uds.PingResponse{Pong: true}, nil
}

// LoadManifestRequest is the payload for LoadManifest.
type LoadManifestRequest struct {
	Path string `json:"path"`
}

// LoadManifestResponse is the response for LoadManifest.
type LoadManifestResponse struct {
	OK     bool     `json:"ok"`
	Errors []string `json:"errors,omitempty"`
}

func (d *Daemon) handleLoadManifest(_ context.Context, msg uds.Message) (any, error) {
	var req LoadManifestRequest
	if err := json.Unmarshal(msg.Data, &req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	m, err := manifest.Load(req.Path)
	if err != nil {
		return LoadManifestResponse{OK: false, Errors: []string{err.Error()}}, nil
	}

	errs := manifest.Validate(m)
	if len(errs) > 0 {
		strs := make([]string, len(errs))
		for i, e := range errs {
			strs[i] = e.Error()
		}
		return LoadManifestResponse{OK: false, Errors: strs}, nil
	}

	d.mu.Lock()
	d.manifest = m
	d.mu.Unlock()

	d.logger.Info("manifest loaded", "path", req.Path, "items", len(m.Items))
	return LoadManifestResponse{OK: true}, nil
}

func (d *Daemon) handleListItems(_ context.Context, _ uds.Message) (any, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	items := make([]core.Item, 0, len(d.items))
	for _, item := range d.items {
		items = append(items, item)
	}
	return items, nil
}

// GetItemRequest is the payload for GetItem.
type GetItemRequest struct {
	ID string `json:"id"`
}

func (d *Daemon) handleGetItem(_ context.Context, msg uds.Message) (any, error) {
	var req GetItemRequest
	if err := json.Unmarshal(msg.Data, &req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	d.mu.RLock()
	item, ok := d.items[req.ID]
	d.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("item not found: %s", req.ID)
	}
	return item, nil
}

func (d *Daemon) handleAction(ctx context.Context, msg uds.Message) (any, error) {
	var req uds.ActionRequest
	if err := json.Unmarshal(msg.Data, &req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	kind, _, _, err := core.ParseItemID(req.ItemID)
	if err != nil {
		return nil, err
	}

	for _, p := range d.providers {
		if p.Name() == string(kind) {
			if err := p.Action(ctx, req.ItemID, req.Action); err != nil {
				return nil, err
			}
			return map[string]bool{"ok": true}, nil
		}
	}

	return nil, fmt.Errorf("no provider for kind %q", kind)
}
