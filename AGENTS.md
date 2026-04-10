# Repository Guidelines

## Project Structure & Module Organization
`index.ts` is the CLI entry point and delegates into [`src/app.ts`](src/app.ts). Core runtime code lives in `src/`, with service orchestration in `src/service*.ts`, manifest handling in `src/manifest.ts`, TUI rendering in `src/ui.ts`, and auto-discovery logic under `src/discovery/`. Tests are co-located with source files using the `.test.ts` suffix, for example `src/manifest.test.ts`. Build output goes to `dist/`, and the runtime manifest is `stasium.toml`.

## Build, Test, and Development Commands
- `bun install` installs dependencies.
- `bun run index.ts` runs the app locally.
- `bun run index.ts init` creates a starter manifest.
- `bun run lint` runs Biome lint checks.
- `bun run format` rewrites files to the repo format.
- `bun run format:check` verifies formatting without writing changes.
- `bun run typecheck` runs strict TypeScript checks.
- `bun run test` runs the Bun test suite.
- `bun run build` compiles the standalone binary to `dist/stasium`.

Before opening or updating a PR, run: `bun run lint`, `bun run format:check`, `bun run typecheck`, `bun run test`, and `bun run build`.

## Coding Style & Naming Conventions
This repo uses TypeScript ESM with strict compiler settings. Follow existing patterns in `src/` rather than introducing new conventions. Use 2-space indentation, keep lines within 100 columns, and let Biome handle formatting. Prefer named exports, explicit `import type` usage, and relative imports without `.ts` extensions. File names use kebab-case (`service-manager.ts`), types use PascalCase, and functions/variables use camelCase.

## Testing Guidelines
Tests use `bun:test`. Keep tests next to the code they cover and name them `*.test.ts`. Run a single file with `bun test src/manifest.test.ts` or target a case with `bun test src/manifest.test.ts -t "^loads valid manifest$"`. Behavior changes should include updated or new tests.

## Commit & Pull Request Guidelines
Git history follows Conventional Commits such as `fix: ...`, `feat: ...`, and `chore: ...`; keep that format. Signed commits are required. PRs should stay focused, explain user-visible behavior changes, link related issues when applicable, and include terminal screenshots only when the TUI output changes. Keep branch names to `main`, `develop`, or `type/name` such as `fix/pid-cleanup`.
