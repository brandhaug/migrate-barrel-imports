# migrate-barrel-imports

A CLI tool that rewrites barrel imports to direct module imports in JavaScript/TypeScript monorepos.

[![npm version](https://img.shields.io/npm/v/migrate-barrel-imports)](https://www.npmjs.com/package/migrate-barrel-imports)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Barrel files (`index.ts` re-exports) hurt build performance, cause circular dependencies, and slow down editor tooling. This CLI rewrites barrel imports across your codebase to point directly at the source modules.

```typescript
// Before
import { foo, bar } from '@repo/package'

// After
import { foo } from '@repo/package/src/foo'
import { bar } from '@repo/package/src/bar'
```

## Install

```bash
npm install -g migrate-barrel-imports
# or run without installing:
npx migrate-barrel-imports <source-path> [target-path] [options]
```

Requires [bun](https://bun.sh) >= 1.4.0.

## Usage

```bash
migrate-barrel-imports <source-path> [target-path] [options]
```

| Argument      | Description                                                                    | Default                 |
| ------------- | ------------------------------------------------------------------------------ | ----------------------- |
| `source-path` | Directory scanned recursively for packages (e.g. `packages`). Not a glob        | _(required)_            |
| `target-path` | Directory where imports should be migrated                                     | `.` (current directory) |

`source-path` is validated as a real directory, not a glob. Passing a pattern such as `packages/*` fails with an error instead of silently finding nothing.

### Options

| Option                             | Description                                                                       | Default                       |
| ---------------------------------- | --------------------------------------------------------------------------------- | ----------------------------- |
| `--extension` / `--no-extension`   | Include file extensions in rewritten import paths                                 | `--extension`                 |
| `--include-barrels`                | Also rewrite imports and re-exports inside barrel files                           | off                           |
| `--target-glob <pattern>`          | Glob, relative to `target-path`, restricting which target directories are scanned | _(scan all of `target-path`)_ |
| `--ignore-source-files <patterns>` | Comma-separated file patterns to ignore in source directories                     | _(none)_                      |
| `--ignore-target-files <patterns>` | Comma-separated file patterns to ignore in target directories                     | _(none)_                      |
| `--dry-run`                        | Preview changes as a diff without modifying files                                 | off                           |
| `-q`, `--quiet`                    | Print only the migration summary                                                  | off                           |
| `--verbose`                        | Print per-file progress in addition to the summary                                | off                           |
| `--json`                           | Print one machine-readable JSON report to stdout                                  | off                           |
| `-h`, `--help`                     | Show help                                                                         | —                             |

Files inside the source directories are never rewrite targets, so pointing `target-path` at a repo root that contains the source packages leaves those packages untouched.

By default the CLI prints the migration summary and any warnings. `--verbose` adds per-file progress; `-q` / `--quiet` prints the summary alone. Errors are always printed. Log lines longer than 500 characters are truncated so generated files with thousands of exports don't flood the terminal.

### Interactive vs non-interactive

When arguments are omitted, the CLI prompts for the missing values **only when stdin is a TTY**. Without a TTY (scripts, CI, piped input) it never prompts: `--extension` defaults to on, `--dry-run` to off, `target-path` to the current directory, and a missing `source-path` exits with code 1.

### JSON output

`--json` prints exactly one JSON document to stdout and suppresses every human-readable line, including the summary and dry-run diffs, so output is safe to pipe into `jq` or parse in CI. Errors go to stderr, where they cannot corrupt the report. There is no interactive fallback in this mode, so `source-path` must be passed as an argument.

```bash
migrate-barrel-imports libs . --json --dry-run | jq '.stats.importsMigrated'
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

### Barrel files as targets

Barrel files are never rewritten by default: rewriting the `export ... from` statements inside a package's own `src/index.ts` would change what the package exposes and silently break its public API. A target file counts as a barrel when it re-exports and is either named like an entry point (`index.*`), declared as one in its `package.json`, or made almost entirely of re-exports. Skipped barrels are counted in the summary under `Target files skipped` and named individually under `--verbose`. Pass `--include-barrels` to rewrite them anyway.

### Dry run

`--dry-run` writes nothing to disk. For each file it would change, it prints a compact unified-style diff of only the import statements that change:

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
# Migrate a single package, ignoring tests in both source and target
migrate-barrel-imports packages/ui \
  --ignore-source-files "**/__tests__/**,**/__mocks__/**" \
  --ignore-target-files "**/*.test.ts"

# Only scan apps/* for imports to rewrite, without file extensions
migrate-barrel-imports libs . --target-glob "apps/*" --no-extension

# Machine-readable report for CI
migrate-barrel-imports libs . --json --dry-run > report.json
```

## Contributing

Contributions are welcome. Open an [issue](https://github.com/brandhaug/migrate-barrel-imports/issues) or submit a pull request.

Development uses [bun](https://bun.sh):

```bash
git clone https://github.com/brandhaug/migrate-barrel-imports.git
cd migrate-barrel-imports
bun install
bun test
npm run build    # tsc -> dist/
npm run lint     # oxlint
npm run validate # lint + format check + test
```

## License

This project is licensed under the [MIT License](LICENSE).
