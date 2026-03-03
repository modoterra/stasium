# AGENTS.md

## Purpose
- This file is for coding agents working in this repository.
- Follow these instructions for commands, quality gates, and code style.
- Prefer existing patterns in `src/` over inventing new conventions.

## Project Snapshot
- Stack: Bun + TypeScript (ESM).
- UI layer: `@opentui/core` terminal renderer.
- Entry point: `index.ts` (delegates to `src/app.ts`).
- Main code: `src/*.ts`, discovery subsystem in `src/discovery/`.
- Runtime manifest: `stasium.toml`.

## Architecture At A Glance
- `src/app.ts` — Main orchestration, keybindings, TUI setup.
- `src/types.ts` — Shared domain types (states, configs, events).
- `src/manifest.ts` — TOML manifest loading, saving, and validation.
- `src/service.ts` — Individual process management (spawn, streams, signals).
- `src/service-manager.ts` — Multi-service orchestration with dependency-aware start/stop.
- `src/service-graph.ts` — DAG validation, topological sort, dependency closures.
- `src/ui.ts` — TUI rendering, dark/light themes.
- `src/focus.ts` — Panel focus and keyboard shortcut management.
- `src/docker.ts` — Docker Compose integration.
- `src/shutdown.ts` — Graceful shutdown with signal handling.
- `src/command.ts` — Shell command tokenization and safety validation.
- `src/discovery/` — Auto-detection of services via TOML-defined strategies.

## Setup And Core Commands
- Install dependencies: `bun install`
- Run app: `bun run index.ts`
- Initialize a manifest: `bun run index.ts init`
- Build binary: `bun run build`
- Type-check: `bun run typecheck`
- Lint: `bun run lint`
- Format (write): `bun run format`
- Format check: `bun run format:check`
- Run tests: `bun run test`
- Install git hooks: `bun run init:hooks`

## Running A Single Test
- Run one test file:
  - `bun test src/manifest.test.ts`
- Run tests by file-name pattern:
  - `bun test manifest.test.ts`
- Run one test case by name regex:
  - `bun test src/manifest.test.ts --test-name-pattern "^loads valid manifest$"`
- Short flag form:
  - `bun test src/manifest.test.ts -t "^loads valid manifest$"`
- Run matching test names across all files:
  - `bun test --test-name-pattern "manifest"`
- Tests import from `bun:test` (`{ describe, expect, test }`).
- Test files are co-located with source using `.test.ts` suffix.
- New behavior changes should add or update tests.

## Pre-PR Validation Sequence
Run this exact sequence before opening or updating a PR:
1. `bun run lint`
2. `bun run format:check`
3. `bun run typecheck`
4. `bun run test`
5. `bun run build`

## CI And Release
- CI runs on PRs and pushes to `main` (commitlint + lint + format + typecheck + test + build).
- A separate workflow validates branch names on PRs.
- Release is **tag-based**: pushing a `v*.*.*` tag triggers cross-platform binary builds and a GitHub Release.

## Import Guidelines
- Order imports as:
  1. Node built-ins (`node:*`)
  2. External packages
  3. Local relative modules (`./...`)
- Relative imports omit the `.ts` extension (e.g., `import { run } from "./app";`).
- Use explicit type-only imports (`verbatimModuleSyntax` is enabled):
  - `import type { X } from "./types";`
  - or `import { type X, y } from "pkg";`
- All exports are **named** — do not use default exports.
- Keep imports minimal and remove unused imports.

## Formatting Guidelines
- Formatter/linter: Biome (`biome.json`).
- Indentation: 2 spaces.
- Line width: 100.
- Keep semicolons, commas, and quote style as formatted by Biome.
- Do not hand-format against tooling; run the formatter/check commands.

## TypeScript Guidelines
- Compiler strictness is enabled (`strict: true`).
- `noUncheckedIndexedAccess` is enabled: guard indexed lookups.
- `noImplicitOverride` is enabled: use `override` where relevant.
- `verbatimModuleSyntax` is enabled: all type-only imports must use `import type`.
- Avoid `any`; prefer specific types, unions, and narrowing.
- Prefer explicit return types for exported functions and public methods.
- Use union string literals for finite states (see `src/types.ts`).
- Keep shared domain types centralized in `src/types.ts` when reasonable.

## Naming Conventions
- Filenames: kebab-case (e.g., `service-manager.ts`).
- Classes, interfaces, type aliases: PascalCase.
- Functions, variables, methods: camelCase.
- Module-level constants: UPPER_SNAKE_CASE.
- TOML-facing config field names: snake_case (matching manifest schema).
- Discriminant fields (e.g., event `type`): lowercase string literals.

## Error Handling Conventions
- Use custom domain errors for business/validation failures:
  - `ManifestError`, `InitError`, `ServiceGraphError`, `ServiceManagerError`, etc.
- Validate early and throw clear, actionable error messages.
- In `catch` blocks, use the `getErrorMessage()` utility from `src/shared.ts`
  or safely narrow: `error instanceof Error ? error.message : String(error)`.
- For expected probe failures (optional files/integrations), catch and continue.
- Do not throw raw strings.
- At the top level, prefer setting `process.exitCode` to signal failure.

## Async, Lifecycle, And Resource Management
- Prefer `async/await` and guard clauses over nested conditionals.
- Use `void promise` only for intentional fire-and-forget work.
- Observer pattern: `subscribe`/`onUpdate` callbacks return unsubscribe functions — always clean up.
- Keep timeouts/retry intervals as named constants.
- After UI state changes, call `renderer.requestRender()` where needed.

## Manifest And Command Safety
- `ServiceConfig.command` supports `string | string[]`.
- Prefer `string[]` when command arguments are structured.
- String commands intentionally reject shell operators:
  - `|`, `&`, `;`, `>`, `<`, `` ` ``, `$`
- Keep service names unique within a manifest.
- Keep `env` values explicit and stringifiable.

## Git And Collaboration Rules
- Conventional Commits are required (enforced by commitlint hook and CI).
- Signed commits are required by contribution policy.
- Allowed branch names: `main`, `develop`, or `type/name` where type is one of:
  `feature`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.
- Recommended local setup: `bun run init:hooks`

## Cursor And Copilot Rules
- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` present.
- If any are added later, treat them as high-priority and incorporate here.

## Agent Handoff Checklist
- Scope stays focused and minimal.
- Changes follow naming/import/style conventions in this file.
- Lint/format/typecheck/test/build pass (or failures explained).
- Behavior changes include tests when practical.
- Commit messages follow Conventional Commits.
