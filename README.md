<p align="center">
  <img src="docs/assets/stasium.png" alt="Stasium" width="160">
</p>

<h1 align="center">Stasium</h1>

**A beautiful local development process orchestrator for projects that have outgrown one terminal tab.**

Stasium turns a Project's local Development Stack into something you can discover, start, observe, script, and shut down safely. It gives you a fast terminal Workspace for day-to-day work, plus a real command-line interface for automation.

```bash
stasium
```

Open the Workspace, manage your Managed Processes, inspect Process Output, edit your Manifest, and leave knowing Stasium will clean up the Direct Managed Processes it owns.

## Why Stasium

Modern local development is rarely one process. A web server, worker, queue, database proxy, asset watcher, and Docker Compose stack all need to start in the right order, stay observable, and shut down cleanly.

Stasium gives that workflow one home:

- **Interactive Workspace** for managing a Project from a polished terminal interface.
- **Scriptable CLI** for `start`, `stop`, `restart`, `status`, `logs`, `validate`, `doctor`, and `update`.
- **Discovery** that proposes Process Definitions from the Project instead of making you write everything by hand.
- **Startup Dependencies** so Direct Managed Processes come up in the right order.
- **Process Claims** so Stasium can safely find and clean up Direct Managed Processes it started.
- **Durable Process Output** so `stasium logs <name>` works outside the active Workspace.
- **External Runtime Visibility** for Docker Compose-backed Managed Processes without pretending Stasium owns them.
- **Self-update support** with checksum-verified release assets.

## Install

Linux and macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/modoterra/stasium/main/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/modoterra/stasium/main/install.ps1 | iex
```

Manual download:

Download the latest binary from [GitHub Releases](https://github.com/modoterra/stasium/releases/latest).

| Binary                    | Platform            |
| ------------------------- | ------------------- |
| `stasium-linux-x64`       | Linux x86_64        |
| `stasium-linux-arm64`     | Linux ARM64         |
| `stasium-macos-arm64`     | macOS Apple Silicon |
| `stasium-windows-x64.exe` | Windows x86_64      |

## Quick Start

Create or discover a Manifest:

```bash
stasium init
```

Or create one non-interactively from default Discovery results:

```bash
stasium init --yes
```

Open the Workspace:

```bash
stasium
```

Run the Development Stack without opening the Workspace:

```bash
stasium start
stasium status
stasium logs web --follow
stasium stop
```

## Manifest

Stasium stores Project-local Process Definitions in `stasium.toml`.

```toml
[[service]]
name = "web"
command = "bun run dev"
depends_on = ["worker"]

[[service]]
name = "worker"
command = ["bun", "run", "worker"]
restart_policy = "on-failure"
```

Each Process Definition can include:

- `name`: the Managed Process name.
- `command`: a Launch Instruction as a string or argv array.
- `working_dir`: optional Project-relative working directory.
- `env`: optional environment values.
- `depends_on`: Startup Dependencies by Managed Process name.
- `restart_policy`: `never`, `on-failure`, or `always`.

## CLI

Stasium has a cobra-style command tree. The root command stays interactive; subcommands are plain terminal commands for scripts and CI.

| Command                                       | What it does                                     |
| --------------------------------------------- | ------------------------------------------------ |
| `stasium`                                     | Open the Workspace, or Project Setup if needed   |
| `stasium init`                                | Start interactive Project Setup                  |
| `stasium init --yes`                          | Create a Manifest from default Discovery results |
| `stasium discover`                            | Print Candidates without writing the Manifest    |
| `stasium validate`                            | Validate the Manifest                            |
| `stasium doctor`                              | Check Project readiness                          |
| `stasium start [name]`                        | Start all or one Direct Managed Process          |
| `stasium stop [name]`                         | Stop all or one Direct Managed Process           |
| `stasium restart [name]`                      | Restart all or one Direct Managed Process        |
| `stasium status`                              | Print known Managed Process state                |
| `stasium logs <name> [--follow]`              | Print or follow durable Process Output           |
| `stasium update [--check] [--channel <name>]` | Check for and install Stasium updates            |
| `stasium config get <key>`                    | Read supported preferences                       |
| `stasium config set <key> <value>`            | Write supported preferences                      |
| `stasium version` / `stasium --version`       | Print the installed Stasium version              |
| `stasium help [command]` / `--help`           | Show help                                        |

Supported config keys:

- `update.channel`
- `update.enabled`

## Workspace

The Workspace is the interactive Stasium experience. It shows Manifest-backed Direct Managed Processes, External Managed Processes from supported External Runtimes, and Process Output in one terminal UI.

Common keys:

| Key                  | Action                                    |
| -------------------- | ----------------------------------------- |
| `s`                  | Start selected Managed Process            |
| `x`                  | Stop selected Managed Process             |
| `r`                  | Restart selected Managed Process          |
| `a`                  | Add a Process Definition                  |
| `e`                  | Edit selected Process Definition          |
| `d`                  | Delete selected Process Definition        |
| `i`                  | Run Discovery and add selected Candidates |
| `tab`                | Cycle panels                              |
| `1`, `2`, `3`, `4`   | Toggle Workspace panel layouts            |
| `q`, `esc`, `ctrl+c` | Shut down and exit                        |

Project Setup uses `up/down`, `space`, `a`, `n`, and `enter` to choose Candidates.

## Process Ownership

Stasium is deliberate about ownership:

- Direct Managed Processes are started by Stasium and tracked with Process Claims.
- Shutdown follows reverse Startup Dependency ordering where applicable.
- On Linux and macOS, Stasium manages Direct Managed Processes as process groups and can tear down spawned descendants.
- On Windows, Stasium only guarantees direct child shutdown.
- External Managed Processes, such as Docker Compose entries, remain owned by their External Runtime. Stasium can show them and forward lifecycle actions, but it does not claim ownership over them.

## Updates

Stasium checks the stable Update Channel on startup before opening Project Setup or the Workspace. Checks are bounded and fail open: network errors, malformed preferences, unavailable metadata, unsupported platforms, or unsafe install paths become warnings instead of blocking work.

Run updates explicitly:

```bash
stasium update
stasium update --check
stasium update --channel stable
```

Startup update preferences live at:

```text
~/.config/stasium/update.json
```

Default preferences:

```json
{
  "enabled": true,
  "channel": "stable"
}
```

Use the CLI to manage them:

```bash
stasium config get update.channel
stasium config set update.enabled false
```

Release builds stamp the Git tag version into the binary before packaging. Update metadata is published as `update-stable.json` with SHA-256 checksums for each supported platform asset.

## Development

Install dependencies:

```bash
bun install
```

Run the CLI from source:

```bash
bun run dev:cli
```

Run the website locally:

```bash
bun run dev
```

Quality gates:

```bash
bun run lint
bun run format:check
bun run typecheck
bun run test
bun run build
```

Useful build commands:

```bash
bun run build:cli
bun run build:site
bun run preview
```

Discovery strategies are data-driven TOML:

- Built-in catalog: `src/discovery/strategies.toml`
- Optional Project overrides: `.stasium/discovery.toml`

## Release

Releases are tag-driven. Pushing a tag like `v0.4.0` runs the release workflow, builds platform binaries, generates checksums and update metadata, and publishes a GitHub Release.

## Contributing

Contributions are welcome. Before opening a PR, run:

```bash
bun run lint
bun run format:check
bun run typecheck
bun run test
bun run build
```

Commits use Conventional Commits. Branch names must be `main`, `develop`, or `type/name`, where type is one of `feature`, `fix`, `chore`, `docs`, `refactor`, `test`, or `ci`.

See `CONTRIBUTING.md` for the full contribution workflow.

## Community

Use common sense and decency. There is no formal code of conduct. We reserve the right to moderate this community to the extent of the law and the policy of the host. Write community@modoterra.xyz if you need us.

## License

MIT © 2026 Modoterra Corporation. See `LICENSE`.
