# AGENTS.md

`migrate-barrel-imports` — CLI that rewrites barrel imports (`index.ts` re-exports) to direct module imports in JS/TS monorepos. TypeScript (ES2020, ESM). Babel for AST, Commander for CLI, fast-glob for matching.

## Tooling

- **Bun** (>= 1.4.0) — package manager + test runner (`packageManager: "bun@1.4.0"`, engines `bun >= 1.4.0`). No npm lockfile; use `bun.lock`.
- Source in `src/`, tests in `test/` (mirror their source file, e.g. `test/cli.test.ts`).

## Setup

```bash
bun install
npm run prepare   # sets core.hooksPath to .githooks
```

## Local dev

- Build: `npm run build` (`tsc` → `dist/`)
- Run CLI: `npm start` or `node dist/index.js`
- Test: `bun test` (CI uses `npm run test` = `bun test --isolate`)
- Lint: `npm run lint`; format: `npm run format`
- Full check: `npm run validate` (lint + format:check + test)
- Pre-commit hook (`.githooks/pre-commit`): `npx oxfmt --write && npx oxlint --fix --type-aware`

## Commit & Release

- Conventional Commits enforced by **PR Gate** (`.github/workflows/pr-gate.yml`): `type(scope): subject` with types `feat fix chore docs style refactor perf test build ci revert`; breaking changes use `!` or `BREAKING CHANGE:` footer.
- [release-please](https://github.com/googleapis/release-please-action) on `master` opens a release PR titled `chore(master): release ...`; merging it tags and publishes to npm.
- PR target branch: `master`.
- `CLAUDE.md` is a symlink to this file.
