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

## Testing

- Framework: Vitest
- Run tests: `npm test`
- Run tests in CI mode: `CI=test npm run test`
- Test files mirror source files: `test/<name>.test.ts`
- Always add tests for new functionality in `test/migrate-barrel-imports.test.ts`

## Commit & Release Conventions

- **All commits and PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/)**: `type(scope): subject`, where `type` is one of `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`. Use `!` or a `BREAKING CHANGE:` footer for breaking changes.
- This convention is enforced by the **PR Gate** workflow (`.github/workflows/pr-gate.yml`), which fails any PR whose title does not conform.
- Releases are automated by [release-please](https://github.com/googleapis/release-please-action): merging Conventional Commits to `master` opens a release PR titled `chore(master): release ...`; merging it tags and publishes the release.
- `CLAUDE.md` is a symlink to this file so Claude Code reads the same conventions.

## Pull Request Guidelines

- Target branch: `master`
