package docker

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/modoterra/stasium/pkg/core"
)

// Provider manages Docker containers via the Docker API.
// This is a stub — full implementation requires github.com/docker/docker/client.
type Provider struct {
	containers []containerDef
	logger     *slog.Logger
}

type containerDef struct {
	Name      string
	Container string
	Service   string
	Compose   string
}

// New creates a new Docker provider.
func New(logger *slog.Logger) *Provider {
	return &Provider{
		logger: logger,
	}
}

// AddContainer registers a container to monitor.
func (p *Provider) AddContainer(name, container, service, compose string) {
	p.containers = append(p.containers, containerDef{
		Name:      name,
		Container: container,
		Service:   service,
		Compose:   compose,
	})
}

func (p *Provider) Name() string { return "docker" }

func (p *Provider) List(_ context.Context) ([]core.Item, error) {
	// TODO: connect to Docker API socket and query container status
	items := make([]core.Item, 0, len(p.containers))
	for _, c := range p.containers {
		items = append(items, core.Item{
			ID:     core.ItemID(core.KindDocker, "docker", c.Name),
			Kind:   core.KindDocker,
			Name:   c.Name,
			Status: core.StatusUnknown,
			Source: map[string]string{
				"container": c.Container,
				"service":   c.Service,
				"compose":   c.Compose,
			},
		})
	}
	return items, nil
}

func (p *Provider) Action(_ context.Context, itemID string, action string) error {
	// TODO: implement via Docker API
	return fmt.Errorf("docker actions not yet implemented")
}
