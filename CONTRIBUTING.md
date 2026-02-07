# Contributing to Stasium

Thank you for your interest in contributing to Stasium! This document covers
the guidelines and workflow for contributing.

## Getting Started

### Prerequisites

- **Go 1.25+** — [Install Go](https://go.dev/dl/)
- **Linux** with systemd (required for the systemd provider)
- **Docker** (optional, for the Docker provider)
- **Make**

### Setup

```bash
git clone https://github.com/modoterra/stasium.git
cd stasium
make setup   # configures git hooks
make build   # builds stasium + stasiumd
make test    # runs all tests
```

## Development Workflow

1. **Fork** the repository and create a feature branch from `main`.
2. Make your changes with clear, minimal commits.
3. Ensure all tests pass: `make test`
4. Ensure code passes vet: `go vet ./...`
5. Open a **pull request** against `main`.

## Commit Convention

This project enforces [Conventional Commits](https://www.conventionalcommits.org/).
A git hook validates your commit messages automatically after running
`make setup`.

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Allowed Types

| Type       | Description                                      |
|------------|--------------------------------------------------|
| `feat`     | A new feature                                    |
| `fix`      | A bug fix                                        |
| `docs`     | Documentation only changes                       |
| `style`    | Formatting, missing semicolons, etc.             |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement                          |
| `test`     | Adding or correcting tests                       |
| `build`    | Changes to the build system or dependencies      |
| `ci`       | Changes to CI configuration files and scripts    |
| `chore`    | Other changes that don't modify src or test      |
| `revert`   | Reverts a previous commit                        |

### Examples

```
feat(tui): add log search filter
fix(daemon): prevent panic on nil manifest
docs: update CLI reference in README
ci: add golangci-lint workflow
```

### Breaking Changes

Append `!` after the type/scope or include `BREAKING CHANGE:` in the footer:

```
feat(transport)!: switch from JSON to protobuf

BREAKING CHANGE: UDS protocol now uses protobuf framing.
```

## Pull Requests

- Keep PRs focused — one feature or fix per PR.
- PR titles must follow conventional commit format (enforced by CI).
- Include a clear description of what changed and why.
- Link related issues using `Closes #123` or `Fixes #123`.
- All CI checks must pass before merge.

## Code Style

- Follow standard Go conventions (`gofmt`, `go vet`).
- Keep comments minimal — only where clarification is needed.
- Use `context.Context` for cancellation propagation.
- Use `slog` for structured logging in the daemon.

## Testing

- Unit tests live alongside the code they test (`_test.go`).
- Tests must pass without root, systemd, or Docker by default.
- Integration tests requiring system services should be clearly marked.

```bash
make test          # run all unit tests
go test ./pkg/...  # run a subset
```

## Reporting Issues

- Use [GitHub Issues](https://github.com/modoterra/stasium/issues).
- Check for existing issues before opening a new one.
- Include steps to reproduce, expected behavior, and actual behavior.
- For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
