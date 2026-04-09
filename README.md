# migrate-barrel-imports

A CLI tool to migrate barrel imports to direct module imports in JavaScript/TypeScript monorepos.

[![npm version](https://img.shields.io/npm/v/migrate-barrel-imports)](https://www.npmjs.com/package/migrate-barrel-imports)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## About

Barrel files (`index.ts` re-exports) hurt build performance, cause circular dependencies, and slow down editor tooling. This CLI rewrites barrel imports across your codebase to point directly at the source modules.

Inspired by [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files).

```typescript
// Before
import { foo, bar } from '@repo/package';

// After
import { foo } from '@repo/package/src/foo';
import { bar } from '@repo/package/src/bar';
```

## Features

- Glob patterns for targeting multiple packages at once
- Automatic resolution of re-exported symbols to their source files
- Configurable file ignore patterns for both source and target directories
- Optional file extension stripping for bundler-friendly imports

## Installation

```bash
npm install -g migrate-barrel-imports
```

### Requirements

- Node.js >= 20

## Usage

```bash
migrate-barrel-imports <source-path> [target-path] [options]
```

Or run without installing:

```bash
npx migrate-barrel-imports <source-path> [target-path] [options]
```

### Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `source-path` | Directory pattern for source packages (e.g. `libs/*`, `packages/{ui,core}`) | *(required)* |
| `target-path` | Directory where imports should be migrated | `.` (current directory) |

### Options

| Option | Description |
|--------|-------------|
| `--ignore-source-files <patterns>` | Comma-separated file patterns to ignore in source directories |
| `--ignore-target-files <patterns>` | Comma-separated file patterns to ignore in target directories |
| `--no-extension` | Omit file extensions from rewritten import paths |
| `--dry-run` | Preview changes without modifying files |

### Examples

```bash
# Migrate a single package
migrate-barrel-imports ./packages/my-lib \
  --ignore-source-files "**/__tests__/**,**/__mocks__/**" \
  --ignore-target-files "**/*.test.ts"

# Migrate multiple packages using glob pattern
migrate-barrel-imports "libs/*" --no-extension

# Migrate specific packages
migrate-barrel-imports "packages/{ui,core,utils}" --ignore-target-files "**/*.test.ts"
```

## Contributing

Contributions are welcome! Feel free to [open an issue](https://github.com/brandhaug/migrate-barrel-imports/issues) or submit a pull request.

### Development Setup

```bash
git clone https://github.com/brandhaug/migrate-barrel-imports.git
cd migrate-barrel-imports
npm install
```

### Running Tests

```bash
npm test
```

## License

This project is licensed under the [MIT License](LICENSE).
