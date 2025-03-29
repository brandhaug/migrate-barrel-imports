# migrate-barrel-imports

A CLI tool to migrate barrel imports in JavaScript/TypeScript monorepos.

Inspired by [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files)

```typescript
// Before 
import { foo, bar } from '@repo/package';

// After
import { foo } from '@repo/package/src/foo';
import { bar } from '@repo/package/src/bar';
```

## Usage

Install the tool globally using npm:

```bash
npm install -g migrate-barrel-imports
migrate-barrel-imports <source-path> [target-path] [options]
```

Or use it directly with npx:

```bash
npx migrate-barrel-imports <source-path> [target-path] [options]
```

### Arguments

- `source-path`: Directory pattern for source packages (e.g. "libs/*", "packages/{ui,core}") (required)
- `target-path`: Path to the directory where imports should be migrated (default: current directory)

### Options

Options can be specified either before or after the arguments:

- `--ignore-source-files <patterns>`: Comma-separated list of file patterns to ignore in source directory
- `--ignore-target-files <patterns>`: Comma-separated list of file patterns to ignore in target directory
- `--no-extension`: Exclude `js|jsx|ts|tsx|mjs|cjs` file extensions from import statements

## Example

```bash
# Migrate a single package
migrate-barrel-imports ./packages/my-lib --ignore-source-files "**/__tests__/**,**/__mocks__/**" --ignore-target-files "**/*.test.ts"

# Migrate multiple packages using glob pattern
migrate-barrel-imports "libs/*" --no-extension

# Migrate specific packages using glob pattern
migrate-barrel-imports "packages/{ui,core,utils}" --ignore-target-files "**/*.test.ts"
```

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request on GitHub.

## License

This project is licensed under the MIT License.
