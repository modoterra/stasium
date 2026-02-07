# Copilot Instructions for Stasium

## Build, Test, and Lint

```bash
make build                    # Build both binaries to bin/
make test                     # Run all tests (30s timeout)
go test ./pkg/manifest/...    # Run tests for a single package
go test -run TestValidate ./pkg/manifest/...  # Run a single test by name
make lint                     # go vet ./...
```

CI also runs `golangci-lint` (v2.1, config in `.golangci.yml`) and `go test -race`.

## Architecture

Stasium is a **client–daemon** system. Two binaries:

- `cmd/stasium` — CLI + TUI client (Cobra + Bubble Tea)
- `cmd/stasiumd` — Background daemon

They communicate over a **Unix Domain Socket** (`/tmp/stasium.sock`) using newline-delimited JSON (NDJSON). The protocol is defined in `pkg/transport/uds/` with three message types: `req`, `res`, and `evt`.

### Daemon internals (`pkg/daemon/`)

- **daemon.go** — Central coordinator; holds item state, registers request handlers, manages providers
- **pollloop.go** — Polls all providers every 1s, computes deltas, applies scoring rules, broadcasts `items.delta` events
- **supervisor.go** — Manages `exec`-kind processes with restart policies (`always`, `on-failure`, `never`); maintains a ring buffer of recent log lines

### Provider pattern (`pkg/providers/`)

All item sources implement `core.Provider`:

```go
type Provider interface {
    Name() string
    List(ctx context.Context) ([]Item, error)
    Action(ctx context.Context, itemID string, action string) error
}
```

Log sources additionally implement `core.LogProvider` with `Subscribe`/`Unsubscribe` methods.

Providers: `systemd` (D-Bus), `exec` (supervisor), `docker` (Docker API + Compose), `procfs` (/proc), `logs/journald`, `logs/filetail`.

### Core types (`pkg/core/`)

- **Item** — Universal model for all managed entities. ID format: `kind:provider:native_id`
- **Status** — `running`, `stopped`, `failed`, `restarting`, `unknown`
- **Kind** — `systemd`, `process`, `exec`, `docker`, `log`

### TUI (`pkg/tui/model/`)

Built with Bubble Tea. Three panes (list, detail, logs) with modes: Normal, Search, Editor, ConfirmDelete.

### Daemon service (`pkg/daemon/service/`)

The `stasium daemon install` command writes a systemd user unit file for `stasiumd`. The service logic lives in `pkg/daemon/service/` — unit file generation, install/uninstall, and status checks. Tests must not depend on a running systemd instance.

### Installation (`install.sh`)

A curl-pipeable install script downloads release tarballs from GitHub Releases, verifies checksums, and installs to `~/.local/bin`.

### Manifest (`pkg/manifest/`)

`stasium.yaml` is the declarative config. Supports variable interpolation (`${root}`, `${project}`), scoring rules, Docker Compose imports, and preset generation (e.g., `presets/laravel.go`).

## Conventions

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) enforced by git hook (`.githooks/commit-msg`) and CI. Run `make setup` to install hooks.
- **Logging**: Use `slog` for structured logging in the daemon.
- **Context**: Pass `context.Context` for cancellation propagation in all provider and daemon methods.
- **Tests**: Must pass without root, systemd, or Docker. Integration tests requiring system services should be clearly marked.
- **Indentation**: Tabs for Go and Makefile, 2-space for YAML and Markdown (see `.editorconfig`).
- **Build info**: Version, commit, and date are injected via ldflags into `internal/buildinfo`.
