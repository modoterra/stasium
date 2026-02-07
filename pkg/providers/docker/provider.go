package docker

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/moby/moby/api/types/container"
	dockerclient "github.com/moby/moby/client"

	"github.com/modoterra/stasium/pkg/core"
)

// DockerClient abstracts the Docker API for testing.
type DockerClient interface {
	ContainerList(ctx context.Context, options dockerclient.ContainerListOptions) (dockerclient.ContainerListResult, error)
	ContainerStart(ctx context.Context, containerID string, options dockerclient.ContainerStartOptions) (dockerclient.ContainerStartResult, error)
	ContainerStop(ctx context.Context, containerID string, options dockerclient.ContainerStopOptions) (dockerclient.ContainerStopResult, error)
	ContainerRestart(ctx context.Context, containerID string, options dockerclient.ContainerRestartOptions) (dockerclient.ContainerRestartResult, error)
	ContainerLogs(ctx context.Context, containerID string, options dockerclient.ContainerLogsOptions) (dockerclient.ContainerLogsResult, error)
	ContainerStats(ctx context.Context, containerID string, options dockerclient.ContainerStatsOptions) (dockerclient.ContainerStatsResult, error)
	Ping(ctx context.Context, options dockerclient.PingOptions) (dockerclient.PingResult, error)
	Close() error
}

// Provider manages Docker containers via the Docker API.
type Provider struct {
	client     DockerClient
	defs       []containerDef
	available  bool
	subs       map[string]*logSub
	mu         sync.Mutex
	logger     *slog.Logger
}

type containerDef struct {
	Name      string
	Container string
	Service   string
	Compose   string
}

type logSub struct {
	cancel context.CancelFunc
	ch     chan core.LogLine
}

// New creates a new Docker provider. Connects to Docker socket; if unavailable,
// the provider is inert (List returns empty, actions return errors).
func New(logger *slog.Logger) *Provider {
	p := &Provider{
		subs:   make(map[string]*logSub),
		logger: logger,
	}

	cli, err := dockerclient.New(dockerclient.FromEnv)
	if err != nil {
		logger.Warn("docker client init failed, provider disabled", "err", err)
		return p
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if _, err := cli.Ping(ctx, dockerclient.PingOptions{}); err != nil {
		logger.Warn("docker not available, provider disabled", "err", err)
		cli.Close()
		return p
	}

	p.client = cli
	p.available = true
	logger.Info("docker provider enabled")
	return p
}

// NewWithClient creates a provider with an injected client (for testing).
func NewWithClient(client DockerClient, logger *slog.Logger) *Provider {
	return &Provider{
		client:    client,
		available: true,
		subs:      make(map[string]*logSub),
		logger:    logger,
	}
}

// AddContainer registers a container to monitor.
func (p *Provider) AddContainer(name, containerName, service, compose string) {
	p.defs = append(p.defs, containerDef{
		Name:      name,
		Container: containerName,
		Service:   service,
		Compose:   compose,
	})
}

func (p *Provider) Name() string { return "docker" }

func (p *Provider) List(ctx context.Context) ([]core.Item, error) {
	if !p.available {
		return nil, nil
	}

	result, err := p.client.ContainerList(ctx, dockerclient.ContainerListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("docker list: %w", err)
	}

	// Index containers by name and compose service label
	byName := make(map[string]container.Summary)
	byService := make(map[string]container.Summary)
	for _, c := range result.Items {
		for _, name := range c.Names {
			byName[strings.TrimPrefix(name, "/")] = c
		}
		if svc, ok := c.Labels["com.docker.compose.service"]; ok {
			byService[svc] = c
		}
	}

	items := make([]core.Item, 0, len(p.defs))
	for _, def := range p.defs {
		c, found := p.resolveContainer(def, byName, byService)

		item := core.Item{
			ID:   core.ItemID(core.KindDocker, "docker", def.Name),
			Kind: core.KindDocker,
			Name: def.Name,
			Source: map[string]string{
				"container": def.Container,
				"service":   def.Service,
				"compose":   def.Compose,
			},
		}

		if !found {
			item.Status = core.StatusStopped
		} else {
			item.Status = mapContainerState(c.State)
			item.Source["container_id"] = c.ID[:12]
			item.Source["image"] = c.Image

			// Get stats (single-shot)
			if c.State == "running" {
				p.populateStats(ctx, c.ID, &item)
			}
		}

		items = append(items, item)
	}
	return items, nil
}

func (p *Provider) Action(ctx context.Context, itemID string, action string) error {
	if !p.available {
		return fmt.Errorf("docker not available")
	}

	_, _, name, err := core.ParseItemID(itemID)
	if err != nil {
		return err
	}

	containerID, err := p.findContainerID(ctx, name)
	if err != nil {
		return err
	}

	timeout := 10
	switch action {
	case "start":
		_, err = p.client.ContainerStart(ctx, containerID, dockerclient.ContainerStartOptions{})
		return err
	case "stop":
		_, err = p.client.ContainerStop(ctx, containerID, dockerclient.ContainerStopOptions{Timeout: &timeout})
		return err
	case "restart":
		_, err = p.client.ContainerRestart(ctx, containerID, dockerclient.ContainerRestartOptions{Timeout: &timeout})
		return err
	default:
		return fmt.Errorf("unsupported action %q for docker container", action)
	}
}

// Subscribe starts streaming logs for a Docker container.
func (p *Provider) Subscribe(ctx context.Context, itemID string) (<-chan core.LogLine, error) {
	if !p.available {
		return nil, fmt.Errorf("docker not available")
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if sub, ok := p.subs[itemID]; ok {
		return sub.ch, nil
	}

	_, _, name, err := core.ParseItemID(itemID)
	if err != nil {
		return nil, err
	}

	containerID, err := p.findContainerID(ctx, name)
	if err != nil {
		return nil, err
	}

	subCtx, cancel := context.WithCancel(ctx)
	result, err := p.client.ContainerLogs(subCtx, containerID, dockerclient.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Tail:       "50",
	})
	if err != nil {
		cancel()
		return nil, fmt.Errorf("docker logs: %w", err)
	}

	ch := make(chan core.LogLine, 100)
	go func() {
		defer result.Close()
		defer close(ch)
		scanner := bufio.NewScanner(result)
		for scanner.Scan() {
			line := scanner.Text()
			if len(line) > 8 {
				line = stripDockerHeader(line)
			}
			entry := core.LogLine{
				ItemID:   itemID,
				TsUnixMs: time.Now().UnixMilli(),
				Stream:   "docker",
				Line:     line,
			}
			select {
			case ch <- entry:
			default:
			}
		}
	}()

	p.subs[itemID] = &logSub{cancel: cancel, ch: ch}
	return ch, nil
}

// Unsubscribe stops log streaming for the given item.
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

func (p *Provider) resolveContainer(def containerDef, byName, byService map[string]container.Summary) (container.Summary, bool) {
	if def.Container != "" {
		if c, ok := byName[def.Container]; ok {
			return c, true
		}
	}
	if def.Service != "" {
		if c, ok := byService[def.Service]; ok {
			return c, true
		}
	}
	if c, ok := byName[def.Name]; ok {
		return c, true
	}
	return container.Summary{}, false
}

func (p *Provider) findContainerID(ctx context.Context, name string) (string, error) {
	for _, def := range p.defs {
		if def.Name != name {
			continue
		}

		result, err := p.client.ContainerList(ctx, dockerclient.ContainerListOptions{All: true})
		if err != nil {
			return "", err
		}

		byName := make(map[string]container.Summary)
		byService := make(map[string]container.Summary)
		for _, c := range result.Items {
			for _, n := range c.Names {
				byName[strings.TrimPrefix(n, "/")] = c
			}
			if svc, ok := c.Labels["com.docker.compose.service"]; ok {
				byService[svc] = c
			}
		}

		c, found := p.resolveContainer(def, byName, byService)
		if !found {
			return "", fmt.Errorf("container not found for %q", name)
		}
		return c.ID, nil
	}
	return "", fmt.Errorf("no docker item named %q", name)
}

func (p *Provider) populateStats(ctx context.Context, containerID string, item *core.Item) {
	statsCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	resp, err := p.client.ContainerStats(statsCtx, containerID, dockerclient.ContainerStatsOptions{Stream: false})
	if err != nil {
		return
	}
	defer resp.Body.Close()

	var stats container.StatsResponse
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return
	}

	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage - stats.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(stats.CPUStats.SystemUsage - stats.PreCPUStats.SystemUsage)
	if systemDelta > 0 && cpuDelta > 0 {
		cpuCount := float64(stats.CPUStats.OnlineCPUs)
		if cpuCount == 0 {
			cpuCount = float64(len(stats.CPUStats.CPUUsage.PercpuUsage))
		}
		item.CPUPct = (cpuDelta / systemDelta) * cpuCount * 100.0
	}

	item.MemBytes = stats.MemoryStats.Usage
}

func mapContainerState(state container.ContainerState) core.Status {
	switch state {
	case container.StateRunning:
		return core.StatusRunning
	case container.StateExited, container.StateDead:
		return core.StatusStopped
	case container.StateRestarting:
		return core.StatusRestarting
	case container.StateCreated, container.StatePaused:
		return core.StatusStopped
	default:
		return core.StatusUnknown
	}
}

func stripDockerHeader(line string) string {
	if len(line) >= 8 && (line[0] == 1 || line[0] == 2) {
		return line[8:]
	}
	return line
}
