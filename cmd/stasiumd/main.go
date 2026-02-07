package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/modoterra/stasium/internal/buildinfo"
	"github.com/modoterra/stasium/pkg/core"
	"github.com/modoterra/stasium/pkg/daemon"
	"github.com/modoterra/stasium/pkg/manifest"
	"github.com/modoterra/stasium/pkg/providers/docker"
	execprov "github.com/modoterra/stasium/pkg/providers/exec"
	"github.com/modoterra/stasium/pkg/providers/procfs"
	"github.com/modoterra/stasium/pkg/providers/systemd"
	"time"
)

const defaultSocket = "/tmp/stasium.sock"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "version" {
		fmt.Printf("stasiumd %s (%s) built %s\n", buildinfo.Version, buildinfo.Commit, buildinfo.Date)
		return
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		logger.Info("shutting down")
		cancel()
	}()

	d := daemon.New(defaultSocket, logger)
	defer d.Shutdown()

	// Initialize supervisor for exec processes
	supervisor := daemon.NewSupervisor(ctx, logger)
	d.SetSupervisor(supervisor)
	execProvider := execprov.New(supervisor, logger)

	// Try to load manifest from CWD
	manifestPath := "stasium.yaml"
	if len(os.Args) > 2 && os.Args[1] == "--manifest" {
		manifestPath = os.Args[2]
	}

	var systemdUnits []string
	dockerProvider := docker.New(logger)

	if m, err := manifest.Load(manifestPath); err == nil {
		if errs := manifest.Validate(m); len(errs) == 0 {
			logger.Info("manifest loaded", "path", manifestPath, "items", len(m.Items))

			// Register items by kind
			for name, item := range m.Items {
				switch item.Kind {
				case "systemd":
					systemdUnits = append(systemdUnits, item.Unit)
				case "exec":
					restart := core.RestartPolicy(item.Restart)
					if restart == "" {
						restart = core.RestartOnFailure
					}
					execProvider.AddProcess(name, item.Command, item.Dir, item.Env, restart)
				case "docker":
					dockerProvider.AddContainer(name, item.Container, item.Service, item.ComposeFile)
				}
			}

			// Auto-import compose services
			if m.Compose != nil && m.Compose.File != "" {
				cf, err := docker.ParseComposeFile(m.Compose.File)
				if err == nil {
					existing := make(map[string]bool)
					for name, item := range m.Items {
						if item.Kind == "docker" {
							existing[name] = true
						}
					}
					for _, def := range docker.AutoImport(cf, existing, m.Project) {
						dockerProvider.AddContainer(def.Name, def.Container, def.Service, m.Compose.File)
					}
				} else {
					logger.Warn("compose parse failed", "file", m.Compose.File, "err", err)
				}
			}
		} else {
			for _, e := range errs {
				logger.Warn("manifest validation", "err", e)
			}
		}
	} else {
		logger.Info("no manifest loaded", "path", manifestPath, "err", err)
	}

	// Register providers
	if len(systemdUnits) > 0 {
		d.AddProvider(systemd.New(systemdUnits, logger))
	}
	d.AddProvider(execProvider)
	d.AddProvider(dockerProvider)
	d.AddProvider(procfs.New(logger))

	// Start supervised processes
	supervisor.StartAll()
	defer supervisor.StopAll()

	// Start poll loop
	pollLoop := daemon.NewPollLoop(d, 1*time.Second, logger)
	go pollLoop.Run(ctx)

	logger.Info("starting stasiumd", "version", buildinfo.Version)
	if err := d.Run(ctx); err != nil {
		logger.Error("daemon error", "err", err)
		os.Exit(1)
	}
}
