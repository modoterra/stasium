# Stasium

[![CI](https://github.com/modoterra/stasium/actions/workflows/ci.yml/badge.svg)](https://github.com/modoterra/stasium/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25+-00ADD8?logo=go&logoColor=white)](https://go.dev)

A Linux TUI + local daemon that discovers, monitors, and manages services for
development environments. Built for Laravel stacks but works with any
combination of systemd units, exec processes, Docker containers, and log files.

<!-- screenshot placeholder -->
<!-- ![Stasium TUI](docs/screenshot.png) -->

## Features

- **Unified dashboard** — systemd services, exec processes, Docker containers,
  and log files in one view
- **Process supervisor** — spawn and manage `php artisan serve`, `npm run dev`,
  queue workers, schedulers, and any other command
- **Docker support** — read `compose.yml`, start/stop containers, stream logs
- **Live log tailing** — journald and file-based logs with pause/search
- **Manifest-driven** — declarative `stasium.yaml` defines your stack
- **Inline editor** — add, edit, and remove items from the TUI
- **Auto-discovery** — finds interesting processes via procfs heuristics
- **Scoring** — surfaces the most relevant items first
- **Laravel preset** — `stasium manifest init laravel` generates a ready-to-use
  manifest
- **CLI + TUI** — full CLI for scripting, rich TUI for interactive use
- **Rootless** — runs entirely as your user, no root required

## Architecture

```
┌──────────────┐         UDS/NDJSON         ┌──────────────────┐
│   stasium    │◄──────────────────────────►│    stasiumd       │
│  (TUI/CLI)   │                            │    (daemon)       │
└──────────────┘                            ├──────────────────┤
                                            │  Poll Loop (1s)  │
                                            │  Scoring Engine  │
                                            │  Supervisor      │
                                            ├──────────────────┤
                                            │  Providers:      │
                                            │  ├─ systemd/dbus │
                                            │  ├─ exec         │
                                            │  ├─ docker       │
                                            │  ├─ procfs       │
                                            │  ├─ journald     │
                                            │  └─ filetail     │
                                            └──────────────────┘
```

Communication is over a **Unix Domain Socket** (`/tmp/stasium.sock`) using
newline-delimited JSON.

## Installation

### Install script (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/modoterra/stasium/main/install.sh | bash
```

Options:

```bash
# Install a specific version
curl -fsSL ... | bash -s -- --version v0.1.0

# Custom install directory (default: ~/.local/bin)
curl -fsSL ... | bash -s -- --prefix /usr/local/bin
```

### Go install

```bash
go install github.com/modoterra/stasium/cmd/stasium@latest
go install github.com/modoterra/stasium/cmd/stasiumd@latest
```

### From source

```bash
git clone https://github.com/modoterra/stasium.git
cd stasium
make build
# Binaries in bin/stasium and bin/stasiumd
```

### Binary releases

Download pre-built binaries from
[GitHub Releases](https://github.com/modoterra/stasium/releases).

## Quick Start

```bash
# Generate a manifest for a Laravel project
cd /path/to/your/laravel/app
stasium manifest init laravel --root .

# Launch the TUI (auto-starts the daemon)
stasium
```

## CLI Reference

```
stasium                         Launch the TUI (default)
stasium status                  Show all items as a table
stasium status --json           Machine-readable output
stasium status --group web      Filter by group
stasium ping                    Ping the daemon
stasium version                 Show version info

stasium manifest init laravel   Generate a Laravel manifest
stasium manifest validate       Validate stasium.yaml

stasium start item <name>       Start an item
stasium stop item <name>        Stop an item
stasium restart item <name>     Restart an item
stasium restart group <name>    Restart all items in a group

stasium daemon run              Run daemon in foreground
stasium daemon install          Install daemon as systemd user service
stasium daemon uninstall        Remove daemon systemd user service
stasium daemon status           Show daemon status
stasium completion bash|zsh|fish  Shell completions
```

## TUI Keybindings

| Key       | Action                |
|-----------|-----------------------|
| `j` / `k` | Navigate items       |
| `↑` / `↓` | Navigate items       |
| `Tab`     | Switch pane           |
| `/`       | Search / filter       |
| `r`       | Restart selected item |
| `s`       | Stop selected item    |
| `t`       | Start selected item   |
| `x`       | Send SIGTERM          |
| `X`       | Send SIGKILL          |
| `l`       | Focus logs pane       |
| `Space`   | Pause log output      |
| `e`       | Edit selected item    |
| `a`       | Add new item          |
| `d`       | Delete selected item  |
| `q`       | Quit                  |

## Manifest

Stasium is configured via `stasium.yaml`:

```yaml
version: 1
project: myapp
root: /home/user/myapp

groups:
  - name: web
    items: [nginx, php-fpm, vite]

items:
  nginx:
    kind: systemd
    unit: nginx.service

  php-fpm:
    kind: systemd
    unit: php8.3-fpm.service

  artisan-serve:
    kind: exec
    command: php artisan serve
    dir: ${root}
    restart: always

  vite:
    kind: exec
    command: npm run dev
    dir: ${root}
    restart: on-failure

  queue-worker:
    kind: exec
    command: php artisan queue:work
    dir: ${root}
    restart: always

  scheduler:
    kind: exec
    command: php artisan schedule:work
    dir: ${root}
    restart: always

  laravel-log:
    kind: log
    files:
      - ${root}/storage/logs/laravel.log
```

### Supported Kinds

| Kind      | Description                        | Key Fields                  |
|-----------|------------------------------------|-----------------------------|
| `systemd` | systemd unit                      | `unit`                      |
| `exec`    | Supervised process                 | `command`, `dir`, `restart`, `env` |
| `docker`  | Docker container                   | `container`, `service`      |
| `log`     | File tail (no actions)             | `files`                     |

### Variables

- `${root}` — expands to the manifest `root` field
- `${project}` — expands to the manifest `project` field

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, commit
conventions, and PR guidelines.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

[MIT](LICENSE) — Copyright (c) 2025 Modoterra Corporation
