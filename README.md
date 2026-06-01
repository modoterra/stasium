# stasium

Stasium is a local service runner for project workspaces. It reads `stasium.toml`, starts services in dependency order, streams logs into a terminal UI, and shuts spawned processes down cleanly.

## Installation

**Linux / macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/modoterra/stasium/main/install.sh | sh
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/modoterra/stasium/main/install.ps1 | iex
```

**Manual download:** grab the binary for your platform from
[GitHub Releases](https://github.com/modoterra/stasium/releases/latest).

| Binary                    | Platform            |
| ------------------------- | ------------------- |
| `stasium-linux-x64`       | Linux x86_64        |
| `stasium-linux-arm64`     | Linux ARM64         |
| `stasium-macos-arm64`     | macOS Apple Silicon |
| `stasium-windows-x64.exe` | Windows x86_64      |

## Development

Install dependencies:

```bash
bun install
```

Run the CLI:

```bash
bun run dev:cli
```

Initialize a manifest:

```bash
bun run index.ts init
```

Run the Vite website:

```bash
bun run dev
```

`init` opens an interactive selector of detected services. Use `up/down` to move,
`space` to toggle, `a` to select all, `n` to clear, and `enter` to create `stasium.toml`.

Inside the runtime TUI, focus the Manifest panel and press `i` to discover services
again and add them to the current manifest (`up/down` move, `space` toggle, `a` all,
`n` none, `enter` add selected, `esc` cancel).

Service cleanup guarantees are strongest on Linux and macOS, where `stasium` manages
services as process groups and can tear down spawned descendants. On Windows,
`stasium` only guarantees direct child shutdown.

Discovery strategies are data-driven via TOML:

- Built-in catalog: `src/discovery/strategies.toml`
- Optional project overrides: `.stasium/discovery.toml`

Commands:

```bash
bun run lint
bun run format
bun run format:check
bun run typecheck
bun run test
bun run build
bun run build:cli
bun run build:site
bun run preview
bun run init:hooks
```

Tooling:

- Oxlint runs lint checks.
- Oxfmt handles formatting.
- TypeScript checks the CLI, tests, Vite config, and website.
- Bun runs tests and builds the standalone CLI binary.

GitHub Actions:

- CI runs on PRs and pushes to main, enforces Conventional Commits, and runs quality gates.
- Release runs after successful CI on main, uses semantic-release, and uploads binaries.
- Changelogs are published in GitHub Releases and synced to `CHANGELOG.md`.
- Release automation expects a `GH_TOKEN` repository secret with `repo` + `workflow` scope.

Commit and branch rules:

- Commits must follow Conventional Commits.
- Branch names must match: `main`, `develop`, or `type/name` where type is one of
  `feature`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.

## Contributing

See `CONTRIBUTING.md` for contribution workflow and required checks.

## Code of Conduct

See `CODE_OF_CONDUCT.md`.

## License

MIT © 2026 Modoterra Corporation. See `LICENSE`.
