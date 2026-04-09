# AGENTS.md

## Project Overview

`migrate-barrel-imports` is a CLI tool that rewrites barrel imports (`index.ts` re-exports) to direct module imports in JavaScript/TypeScript monorepos. Built with Babel for AST parsing/transformation, Commander for CLI, and fast-glob for file matching.

- **Language:** TypeScript (ES2020, ESM)
- **Package manager:** npm (no lockfile, exact versions pinned)
- **Node requirement:** >= 20

## Setup Commands

```bash
npm install
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

## Pull Request Guidelines

- Target branch: `master`
