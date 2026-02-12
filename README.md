# stasium

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

To initialize a manifest:

```bash
bun run index.ts init
```

Development commands:

```bash
bun run lint
bun run format
bun run format:check
bun run typecheck
bun run test
bun run build
bun run init:hooks
```

GitHub Actions:

- CI runs on PRs and pushes to main.
- Release runs on push to main using semantic-release and uploads binaries.

Commit and branch rules:

- Commits must follow Conventional Commits.
- Branch names must match: `main`, `develop`, or `type/name` where type is one of
  `feature`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
