package daemon

import (
	"context"
	"log/slog"

	"github.com/modoterra/stasium/pkg/core"
	"github.com/modoterra/stasium/pkg/manifest"
	"github.com/modoterra/stasium/pkg/transport/uds"
)

// Daemon is the main stasiumd process that manages providers, state, and transport.
type Daemon struct {
	server    *uds.Server
	manifest  *manifest.Manifest
	providers []core.Provider
	logger    *slog.Logger
}

// New creates a new daemon instance.
func New(socketPath string, logger *slog.Logger) *Daemon {
	srv := uds.NewServer(socketPath, logger)
	d := &Daemon{
		server: srv,
		logger: logger,
	}
	d.registerHandlers()
	return d
}

// Run starts the daemon and blocks until the context is cancelled.
func (d *Daemon) Run(ctx context.Context) error {
	return d.server.Start(ctx)
}

// Shutdown cleans up resources.
func (d *Daemon) Shutdown() {
	d.server.Shutdown()
}

func (d *Daemon) registerHandlers() {
	d.server.Handle(uds.MethodPing, func(_ context.Context, _ uds.Message) (any, error) {
		return uds.PingResponse{Pong: true}, nil
	})
}
