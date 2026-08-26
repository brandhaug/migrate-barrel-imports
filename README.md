# migrate-barrel-imports

A CLI tool to migrate barrel imports to direct module imports in JavaScript/TypeScript monorepos.

[![npm version](https://img.shields.io/npm/v/migrate-barrel-imports)](https://www.npmjs.com/package/migrate-barrel-imports)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## About

Barrel files (`index.ts` re-exports) hurt build performance, cause circular dependencies, and slow down editor tooling. This CLI rewrites barrel imports across your codebase to point directly at the source modules.

Inspired by [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files).

```typescript
// Before
import { foo, bar } from '@repo/package'

// After
import { foo } from '@repo/package/src/foo'
import { bar } from '@repo/package/src/bar'
```

## Features

- Glob patterns for targeting multiple packages at once
- Automatic resolution of re-exported symbols to their source files
- Configurable file ignore patterns for both source and target directories
- Optional file extension stripping for bundler-friendly imports
- Barrel files are skipped as rewrite targets, so a package's public API surface stays intact

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

| Argument      | Description                                                                 | Default                 |
| ------------- | --------------------------------------------------------------------------- | ----------------------- |
| `source-path` | Directory pattern for source packages (e.g. `libs/*`, `packages/{ui,core}`) | _(required)_            |
| `target-path` | Directory where imports should be migrated                                  | `.` (current directory) |

### Options

| Option                             | Description                                                   | Default       |
| ---------------------------------- | ------------------------------------------------------------- | ------------- |
| `--extension` / `--no-extension`   | Include file extensions in rewritten import paths             | `--extension` |
| `--include-barrels`                | Also rewrite imports and re-exports inside barrel files       | off           |
| `--ignore-source-files <patterns>` | Comma-separated file patterns to ignore in source directories | _(none)_      |
| `--ignore-target-files <patterns>` | Comma-separated file patterns to ignore in target directories | _(none)_      |
| `--dry-run`                        | Preview changes as a diff without modifying files             | off           |
| `-q`, `--quiet`                    | Print only the migration summary                              | off           |
| `--verbose`                        | Print per-file progress in addition to the summary            | off           |
| `--json`                           | Print one machine-readable JSON report to stdout              | off           |
| `-h`, `--help`                     | Show help                                                     | —             |

By default the CLI prints the migration summary and any warnings. `--verbose`
adds per-file progress, and `-q` / `--quiet` prints the summary alone. Errors
are always printed. Single log lines longer than 500 characters are truncated
with an ellipsis, which keeps generated files with thousands of exports from
flooding the terminal.

### JSON output

`--json` makes the CLI print exactly one JSON document to stdout and suppress
every human-readable line, including the summary and dry-run diffs, so the
output is safe to pipe into `jq` or parse in CI. It goes through the same logger
as `--quiet` and `--verbose`, at a `silent` verbosity, and overrides both.
Errors still go to stderr, where they cannot corrupt the report.

Because there is no interactive fallback in this mode, `source-path` must be
passed as an argument; without it the CLI exits with code 1.

```bash
migrate-barrel-imports "libs/*" . --json --dry-run | jq '.stats.importsMigrated'
```

```json
{
	"mode": "dry-run",
	"stats": {
		"sourcePackagesFound": 1,
		"sourcePackagesProcessed": 1,
		"sourcePackagesSkipped": 0,
		"sourceFilesFound": 2,
		"sourceFilesWithExports": 1,
		"sourceFilesSkipped": 0,
		"exportsFound": 1,
		"targetFilesFound": 2,
		"targetFilesProcessed": 1,
		"importsUpdated": 1,
		"noChangesNeeded": 0,
		"targetFilesSkipped": 1,
		"importsMigrated": 1
	},
	"warnings": [
		"Skipped /repo/apps/web/src/broken.ts: failed to parse: Missing semicolon. (1:38)"
	],
	"parseErrors": [
		{
			"filePath": "/repo/apps/web/src/broken.ts",
			"message": "Missing semicolon. (1:38)"
		}
	],
	"changedFiles": ["/repo/apps/web/src/calculator.ts"],
	"skippedFiles": ["/repo/apps/web/src/index.ts"]
}
```

| Field          | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `mode`         | `apply` when files were written, `dry-run` when only previewed              |
| `stats`        | All migration counters, matching the human-readable summary                 |
| `warnings`     | Non-fatal problems, including every parse failure with its file path        |
| `parseErrors`  | Files that could not be parsed, as `{ filePath, message }`                  |
| `changedFiles` | Target files whose imports were rewritten (or would be, in dry-run)         |
| `skippedFiles` | Target files left untouched, by `--ignore-target-files` or barrel detection |

When arguments or flags are omitted, the CLI falls back to interactive prompts
for the missing values only. Supplying the source path (and any flags) runs the
migration fully non-interactive, which makes it usable in scripts and CI.

### Barrel files as targets

Barrel files are never rewritten by default. Rewriting the `export ... from`
statements inside a package's own `src/index.ts` changes what that package
exposes, which silently breaks its public API. A target file counts as a barrel
when it re-exports and is either named like an entry point (`index.*`), declared
as one in its `package.json`, or made almost entirely of re-exports. Skipped
barrels are counted in the run summary under `Target files skipped`, and named
individually under `--verbose`.

Pass `--include-barrels` to opt in and rewrite them anyway.

### Dry run

`--dry-run` writes nothing to disk. For each file it would change, it prints a
compact unified-style diff of only the import statements that change, so you can
review the migration before applying it:

```diff
[dry-run] Would update imports in packages/target-app/src/calculator.ts
--- a/packages/target-app/src/calculator.ts
+++ b/packages/target-app/src/calculator.ts
-import { add, PI } from "@test/source-lib";
+import { add } from "@test/source-lib/src/utils.ts";
+import { PI } from "@test/source-lib/src/constants.ts";
```

### Examples

```bash
# Migrate a single package
migrate-barrel-imports ./packages/my-lib \
  --ignore-source-files "**/__tests__/**,**/__mocks__/**" \
  --ignore-target-files "**/*.test.ts"

# Migrate multiple packages using glob pattern
migrate-barrel-imports "libs/*" --no-extension

# Print only the migration summary
migrate-barrel-imports "libs/*" --quiet

# Also rewrite the re-exports inside barrel files
migrate-barrel-imports "libs/*" --include-barrels

# Migrate specific packages
migrate-barrel-imports "packages/{ui,core,utils}" --ignore-target-files "**/*.test.ts"

# Machine-readable report for CI
migrate-barrel-imports "libs/*" . --json --dry-run > report.json
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
