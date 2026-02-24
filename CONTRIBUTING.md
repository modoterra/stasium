# Contributing to Stasium

Thanks for contributing.

## Ground Rules

- Keep pull requests small and focused.
- Follow existing architecture and coding style.
- Include tests for behavior changes.

## Required Before Opening a PR

Run and pass:

```bash
bun run lint
bun run format:check
bun run typecheck
bun run test
bun run build
```

## Commit Requirements

### Conventional Commits (required)

Use Conventional Commit messages, for example:

- `feat: add manifest validation`
- `fix: avoid duplicate service startup`
- `docs: clarify release process`

### Signed Commits (required)

All commits must be signed.

## Pull Request Expectations

- Explain why the change is needed.
- Include validation notes (what you ran and what passed).
- Keep one concern per PR when possible.

## Code of Conduct

By participating, you agree to follow `CODE_OF_CONDUCT.md`.
