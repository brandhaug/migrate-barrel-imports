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

- `source-path`: Path to the package containing barrel files (required)
- `target-path`: Path to the directory where imports should be migrated (default: current directory)

### Options

Options can be specified either before or after the arguments:

- `--ignore-source-files <patterns>`: Comma-separated list of file patterns to ignore in source directory
- `--ignore-target-files <patterns>`: Comma-separated list of file patterns to ignore in target directory
- `--no-extension`: Exclude `js|jsx|ts|tsx|mjs|cjs` file extensions from import statements

## Example

```bash
# Options after arguments
migrate-barrel-imports ./packages/my-lib --ignore-source-files "**/__tests__/**,**/__mocks__/**" --ignore-target-files "**/*.test.ts"

# Options before arguments
migrate-barrel-imports --no-extension ./packages/my-lib .

# Mix of options before and after arguments
migrate-barrel-imports --no-extension ./packages/my-lib --ignore-target-files "**/*.test.ts"
```

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request on GitHub.

## License

This project is licensed under the MIT License.
