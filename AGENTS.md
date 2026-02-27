# AGENTS.md

## Purpose
- This file is for coding agents working in this repository.
- Follow these instructions for commands, quality gates, and code style.
- Prefer existing patterns in `src/` over inventing new conventions.

## Project Snapshot
- Stack: Bun + TypeScript (ESM).
- UI layer: `@opentui/core` terminal renderer.
- Entry point: `index.ts`.
- Main code: `src/*.ts`.
- Runtime manifest: `stasium.toml`.

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
- Release (maintainers/CI): `bun run release`

## Build/Lint/Test (Canonical)
- Build: `bun run build`
- Lint: `bun run lint`
- Format gate: `bun run format:check`
- Type gate: `bun run typecheck`
- Test: `bun test` (equivalent to `bun run test`)

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
- If no test files exist for a temporary branch:
  - `bun test --pass-with-no-tests`
- Bun default discovery pattern:
  - `**{.test,.spec,_test_,_spec_}.{js,ts,jsx,tsx}`

## Current Test Status
- Repository includes test files under `src/` and CI runs `bun test`.
- New behavior changes should add or update tests using `.test.ts` or `.spec.ts` naming.

## Pre-PR Validation Sequence
- Run this exact sequence before opening or updating a PR:
  1. `bun run lint`
  2. `bun run format:check`
  3. `bun run typecheck`
  4. `bun run test`
  5. `bun run build`
- This matches `CONTRIBUTING.md` and CI expectations.

## CI And Release Behavior
- CI runs on PRs and pushes to `main`.
- CI checks currently include install, typecheck, lint, format check, tests.
- Release workflow builds binaries on Linux/macOS/Windows.
- Semantic Release runs on pushes to `main`.

## Import Guidelines
- Order imports as:
  1. Node built-ins (`node:*`)
  2. External packages
  3. Local relative modules (`./...`)
- Prefer explicit type-only imports:
  - `import type { X } from "./types";`
  - or `import { type X, y } from "pkg";`
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
- Avoid `any`; prefer specific types, unions, and narrowing.
- Prefer explicit return types for exported functions and public methods.
- Use union string literals for finite states (see `src/types.ts`).
- Keep shared domain types centralized in `src/types.ts` when reasonable.

## Naming Conventions
- Filenames: kebab-case (e.g., `service-manager.ts`).
- Classes, interfaces, type aliases: PascalCase.
- Functions, variables, methods: camelCase.
- Module-level constants: UPPER_SNAKE_CASE.
- Discriminant fields (e.g., event `type`): lowercase string literals.
- Names should reflect behavior and domain intent.

## Error Handling Conventions
- Use custom domain errors for business/validation failures:
  - `ManifestError`, `InitError`, similar patterns.
- Validate early and throw clear, actionable error messages.
- In `catch` blocks, safely narrow unknown values:
  - `error instanceof Error ? error.message : String(error)`
- For expected probe failures (optional files/integrations), catch and continue intentionally.
- Do not throw raw strings.
- At the top level, prefer setting `process.exitCode` to signal failure.
- Use direct `process.exit(...)` only in established shutdown/signal flows.

## Async, Lifecycle, And Resource Management
- Prefer `async/await` and guard clauses over nested conditionals.
- Use `void promise` only for intentional fire-and-forget work.
- Always clean up listeners/subscriptions in teardown paths.
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
- Conventional Commits are required.
- Signed commits are required by contribution policy.
- Allowed branch names:
  - `main`
  - `develop`
  - `type/name` where type is one of:
    - `feature`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`
- Recommended local setup: `bun run init:hooks`

## Cursor And Copilot Rules
- No Cursor rules were found:
  - `.cursor/rules/` is not present.
  - `.cursorrules` is not present.
- No Copilot instructions file was found:
  - `.github/copilot-instructions.md` is not present.
- If any of these files are added later, treat them as high-priority repo instructions and update this document.

## Agent Handoff Checklist
- Scope stays focused and minimal.
- Changes follow naming/import/style conventions in this file.
- Lint/format/typecheck/test/build are run (or failures explained).
- Behavior changes include tests when practical.
- Commit messages follow Conventional Commits.
