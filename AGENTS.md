# AGENTS.md

## Project Overview

`migrate-barrel-imports` is a CLI tool that rewrites barrel imports (`index.ts` re-exports) to direct module imports in JavaScript/TypeScript monorepos. Built with Babel for AST parsing/transformation, Commander for CLI, and fast-glob for file matching.

- **Language:** TypeScript (ES2020, ESM)
- **Package manager:** npm (no lockfile, exact versions pinned)
- **Node requirement:** >= 20

## Setup Commands

```bash
npm install
npm run prepare   # configures git hooks
```

## Development Workflow

- Source code lives in `src/`, tests in `test/`
- Build with `npm run build` (runs `tsc`, outputs to `dist/`)
- Run the CLI locally: `npm start` or `node dist/index.js`
- Pre-commit hook runs `oxfmt --write` and `oxlint --fix --type-aware` automatically

## Testing

- Framework: Vitest
- Run tests: `npm test`
- Run tests in CI mode: `CI=test npm run test`
- Test files mirror source files: `test/<name>.test.ts`
- Always add tests for new functionality in `test/migrate-barrel-imports.test.ts`

## Code Style

- **Formatter:** oxfmt (tabs, single quotes, no semicolons, no trailing commas)
- **Linter:** oxlint with TypeScript, Unicorn, and OXC plugins
- Lint: `npm run lint`
- Format: `npm run format`
- Format check: `npm run format:check`
- Full validation: `npm run validate` (lint + format check + test)

## CI/CD

- **PR checks** (`.github/workflows/pr.yml`): lint, format check, and tests run on PRs to `master`
- **Release** (`.github/workflows/release.yml`): release-please on push to `master`, publishes to npm with provenance

## Pull Request Guidelines

- Target branch: `master`
- All PRs must pass: `npm run lint`, `npm run format:check`, `npm run test`
- Releases are automated via release-please
