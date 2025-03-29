import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateBarrelImports } from '../src/migrate-barrel-imports'
import { type Options, defaultOptions } from '../src/options'

describe.concurrent('migrate-barrel-imports', (): void => {
  // Use RUNNER_TEMP if available to avoid access errors in GHA
  const tmpDir = process.env.RUNNER_TEMP || os.tmpdir()

  // Helper function to run the migrateBarrelImports with overridden options
  const runMigrateBarrelImports = async (overrides: Partial<Options> = {}): Promise<void> => {
    const options: Options = {
      ...defaultOptions,
      sourcePath: 'source-path',
      ...overrides
    }
    await migrateBarrelImports(options)
  }

  it('should migrate barrel imports in a TS monorepo setup', async () => {
    // Create monorepo structure in temp directory
    const monorepoDir = path.join(tmpDir, `test-monorepo-ts-${randomUUID()}`)
    const sourceDir = path.join(monorepoDir, 'packages/source-lib')
    const targetDir = path.join(monorepoDir, 'packages/target-app')

    // Create directories
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.mkdirSync(targetDir, { recursive: true })
    fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true })
    fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })

    // Create source package with barrel exports
    fs.writeFileSync(
      path.join(sourceDir, 'package.json'),
      JSON.stringify({
        name: '@test/source-lib',
        version: '1.0.0',
        main: 'src/index.ts',
        types: 'src/index.ts'
      })
    )

    // Create source files with exports
    fs.writeFileSync(
      path.join(sourceDir, 'src/utils.ts'),
      `
export const add = (a: number, b: number): number => a + b;
export const subtract = (a: number, b: number): number => a - b;
`
    )

    fs.writeFileSync(
      path.join(sourceDir, 'src/constants.ts'),
      `
export const PI = 3.14159;
export const E = 2.71828;
`
    )

    // Create barrel file
    fs.writeFileSync(
      path.join(sourceDir, 'src/index.ts'),
      `
export * from \"./utils\";
export * from \"./constants\";
`
    )

    // Create target package that imports from source
    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify({
        name: '@test/target-app',
        version: '1.0.0',
        dependencies: {
          '@test/source-lib': '1.0.0'
        }
      })
    )

    // Create target file with barrel imports
    fs.writeFileSync(
      path.join(targetDir, 'src/calculator.ts'),
      `
import { add, PI } from "@test/source-lib";

export const calculateArea = (radius: number): number => {
	return PI * add(radius, radius);
};
`
    )

    // Run migration
    await runMigrateBarrelImports({
      sourcePath: sourceDir,
      targetPath: monorepoDir,
      includeExtension: true
    })

    // Read the updated file content
    const updatedContent = fs.readFileSync(path.join(targetDir, 'src/calculator.ts'), 'utf-8')

    // Verify imports were updated to direct paths using string checks
    expect(updatedContent).toContain('import { add } from "@test/source-lib/src/utils.ts"')
    expect(updatedContent).toContain('import { PI } from "@test/source-lib/src/constants.ts"')
    expect(updatedContent).not.toContain('import { add, PI } from "@test/source-lib"')

    // Clean up
    fs.rmSync(monorepoDir, { recursive: true, force: true })
  })

  it('should migrate barrel imports in a JS monorepo setup', async () => {
    // Create monorepo structure in temp directory
    const monorepoDir = path.join(tmpDir, `test-monorepo-js-${randomUUID()}`)
    const sourceDir = path.join(monorepoDir, 'packages/source-lib')
    const targetDir = path.join(monorepoDir, 'packages/target-app')

    // Create directories
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.mkdirSync(targetDir, { recursive: true })
    fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true })
    fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })

    // Create source package with barrel exports
    fs.writeFileSync(
      path.join(sourceDir, 'package.json'),
      JSON.stringify({
        name: '@test/source-lib',
        version: '1.0.0',
        main: 'src/index.js',
        type: 'module'
      })
    )

    // Create source files with exports
    fs.writeFileSync(
      path.join(sourceDir, 'src/utils.js'),
      `
export const multiply = (a, b) => a * b;
export const divide = (a, b) => a / b;
`
    )

    fs.writeFileSync(
      path.join(sourceDir, 'src/config.js'),
      `
export const API_URL = 'https://api.example.com';
export const MAX_RETRIES = 3;
`
    )

    // Create barrel file
    fs.writeFileSync(
      path.join(sourceDir, 'src/index.js'),
      `
export * from "./utils.js";
export * from "./config.js";
`
    )

    // Create target package that imports from source
    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify({
        name: '@test/target-app',
        version: '1.0.0',
        type: 'module',
        dependencies: {
          '@test/source-lib': '1.0.0'
        }
      })
    )

    // Create target file with barrel imports
    fs.writeFileSync(
      path.join(targetDir, 'src/api-client.js'),
      `
import { multiply, API_URL } from "@test/source-lib";

export const fetchWithRetry = async (endpoint) => {
  const fullUrl = \`\${API_URL}\${endpoint}\`;
  const timeout = multiply(1000, 2);
  return fetch(fullUrl, { timeout });
};
`
    )

    // Run migration
    await runMigrateBarrelImports({
      sourcePath: sourceDir,
      targetPath: monorepoDir,
      includeExtension: true
    })

    // Read the updated file content
    const updatedContent = fs.readFileSync(path.join(targetDir, 'src/api-client.js'), 'utf-8')

    // Verify imports were updated to direct paths using string checks
    expect(updatedContent).toContain('import { multiply } from "@test/source-lib/src/utils.js"')
    expect(updatedContent).toContain('import { API_URL } from "@test/source-lib/src/config.js"')
    expect(updatedContent).not.toContain('import { multiply, API_URL } from "@test/source-lib"')

    // Clean up
    fs.rmSync(monorepoDir, { recursive: true, force: true })
  })

  it('should migrate barrel imports for multiple source packages using glob pattern', async () => {
    // Create monorepo structure in temp directory
    const monorepoDir = path.join(tmpDir, `test-monorepo-glob-${randomUUID()}`)
    const packagesDir = path.join(monorepoDir, 'packages')
    const targetDir = path.join(monorepoDir, 'apps/target-app')

    // Create directories
    fs.mkdirSync(packagesDir, { recursive: true })
    fs.mkdirSync(targetDir, { recursive: true })
    fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })

    // Create multiple source packages
    const sourcePackages = [
      {
        name: '@test/ui-lib',
        exports: {
          'src/Button.ts': 'export const Button = () => <button>Click me</button>;',
          'src/Input.ts': 'export const Input = () => <input />;',
          'src/index.ts': 'export * from "./Button";\nexport * from "./Input";'
        }
      },
      {
        name: '@test/utils-lib',
        exports: {
          'src/format.ts': 'export const formatDate = (date: Date) => date.toISOString();',
          'src/validate.ts':
            'export const isValidEmail = (email: string) => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);',
          'src/index.ts': 'export * from "./format";\nexport * from "./validate";'
        }
      }
    ]

    // Create each source package
    for (const pkg of sourcePackages) {
      const dirName = pkg.name.split('/')[1] ?? 'unknown'
      const pkgDir = path.join(packagesDir, dirName)
      fs.mkdirSync(path.join(pkgDir, 'src'), { recursive: true })

      // Create package.json
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({
          name: pkg.name,
          version: '1.0.0',
          main: 'src/index.ts',
          types: 'src/index.ts'
        })
      )

      // Create source files
      for (const [filePath, content] of Object.entries(pkg.exports)) {
        fs.writeFileSync(path.join(pkgDir, filePath), content)
      }
    }

    // Create target package that imports from both source packages
    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify({
        name: '@test/target-app',
        version: '1.0.0',
        dependencies: {
          '@test/ui-lib': '1.0.0',
          '@test/utils-lib': '1.0.0'
        }
      })
    )

    // Create target file with barrel imports from both packages
    fs.writeFileSync(
      path.join(targetDir, 'src/UserForm.ts'),
      `
import { Button, Input } from "@test/ui-lib";
import { formatDate, isValidEmail } from "@test/utils-lib";

export const UserForm = () => {
  const handleSubmit = (email: string) => {
    if (!isValidEmail(email)) return;
    console.log(\`Form submitted at \${formatDate(new Date())}\`);
  };

  return (
    <form>
      <Input />
      <Button />
    </form>
  );
};
`
    )

    // Run migration with glob pattern
    await runMigrateBarrelImports({
      sourcePath: path.join(packagesDir, '*'),
      targetPath: monorepoDir,
      includeExtension: true
    })

    // Read the updated file content
    const updatedContent = fs.readFileSync(path.join(targetDir, 'src/UserForm.ts'), 'utf-8')

    // Verify imports from ui-lib were updated
    expect(updatedContent).toContain('import { Button } from "@test/ui-lib/src/Button.ts"')
    expect(updatedContent).toContain('import { Input } from "@test/ui-lib/src/Input.ts"')
    expect(updatedContent).not.toContain('import { Button, Input } from "@test/ui-lib"')

    // Verify imports from utils-lib were updated
    expect(updatedContent).toContain('import { formatDate } from "@test/utils-lib/src/format.ts"')
    expect(updatedContent).toContain('import { isValidEmail } from "@test/utils-lib/src/validate.ts"')
    expect(updatedContent).not.toContain('import { formatDate, isValidEmail } from "@test/utils-lib"')

    // Clean up
    fs.rmSync(monorepoDir, { recursive: true, force: true })
  })

  it('should migrate barrel imports for TypeScript enums', async () => {
    // Create monorepo structure in temp directory
    const monorepoDir = path.join(tmpDir, `test-monorepo-enum-${randomUUID()}`)
    const sourceDir = path.join(monorepoDir, 'packages/source-lib')
    const targetDir = path.join(monorepoDir, 'packages/target-app')

    // Create directories
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.mkdirSync(targetDir, { recursive: true })
    fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true })
    fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })

    // Create source package with enum exports
    fs.writeFileSync(
      path.join(sourceDir, 'package.json'),
      JSON.stringify({
        name: '@test/source-lib',
        version: '1.0.0',
        main: 'src/index.ts',
        types: 'src/index.ts'
      })
    )

    // Create source files with enum exports
    fs.writeFileSync(
      path.join(sourceDir, 'src/enums.ts'),
      `
export enum Status {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT'
}
`
    )

    // Create barrel file
    fs.writeFileSync(
      path.join(sourceDir, 'src/index.ts'),
      `
export * from "./enums";
`
    )

    // Create target package that imports from source
    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify({
        name: '@test/target-app',
        version: '1.0.0',
        dependencies: {
          '@test/source-lib': '1.0.0'
        }
      })
    )

    // Create target file with barrel imports
    fs.writeFileSync(
      path.join(targetDir, 'src/status-handler.ts'),
      `
import { Status, Direction } from "@test/source-lib";

export const handleStatus = (status: Status): void => {
  console.log(\`Current status: \${status}\`);
};

export const move = (direction: Direction): void => {
  console.log(\`Moving \${direction}\`);
};
`
    )

    // Run migration
    await runMigrateBarrelImports({
      sourcePath: sourceDir,
      targetPath: monorepoDir,
      includeExtension: true
    })

    // Read the updated file content
    const updatedContent = fs.readFileSync(path.join(targetDir, 'src/status-handler.ts'), 'utf-8')

    // Verify imports were updated to direct paths
    expect(updatedContent).toContain('import { Status, Direction } from "@test/source-lib/src/enums.ts"')
    expect(updatedContent).not.toContain('import { Status, Direction } from "@test/source-lib"')

    // Clean up
    fs.rmSync(monorepoDir, { recursive: true, force: true })
  })

  it('should migrate barrel imports for TypeScript interfaces', async () => {
    // Create monorepo structure in temp directory
    const monorepoDir = path.join(tmpDir, `test-monorepo-interface-${randomUUID()}`)
    const sourceDir = path.join(monorepoDir, 'packages/source-lib')
    const targetDir = path.join(monorepoDir, 'packages/target-app')

    // Create directories
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.mkdirSync(targetDir, { recursive: true })
    fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true })
    fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })

    // Create source package with interface exports
    fs.writeFileSync(
      path.join(sourceDir, 'package.json'),
      JSON.stringify({
        name: '@test/source-lib',
        version: '1.0.0',
        main: 'src/index.ts',
        types: 'src/index.ts'
      })
    )

    // Create source files with interface exports
    fs.writeFileSync(
      path.join(sourceDir, 'src/types.ts'),
      `
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Config {
  apiUrl: string;
  timeout: number;
  retries: number;
}
`
    )

    // Create barrel file
    fs.writeFileSync(
      path.join(sourceDir, 'src/index.ts'),
      `
export * from "./types";
`
    )

    // Create target package that imports from source
    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify({
        name: '@test/target-app',
        version: '1.0.0',
        dependencies: {
          '@test/source-lib': '1.0.0'
        }
      })
    )

    // Create target file with barrel imports
    fs.writeFileSync(
      path.join(targetDir, 'src/user-service.ts'),
      `
import { User, Config } from "@test/source-lib";

export const createUser = (user: User): void => {
  console.log(\`Creating user: \${user.name}\`);
};

export const loadConfig = (config: Config): void => {
  console.log(\`Loading config: \${config.apiUrl}\`);
};
`
    )

    // Run migration
    await runMigrateBarrelImports({
      sourcePath: sourceDir,
      targetPath: monorepoDir,
      includeExtension: true
    })

    // Read the updated file content
    const updatedContent = fs.readFileSync(path.join(targetDir, 'src/user-service.ts'), 'utf-8')

    // Verify imports were updated to direct paths
    expect(updatedContent).toContain('import { User, Config } from "@test/source-lib/src/types.ts"')
    expect(updatedContent).not.toContain('import { User, Config } from "@test/source-lib"')

    // Clean up
    fs.rmSync(monorepoDir, { recursive: true, force: true })
  })

  it('should migrate barrel imports for TypeScript type aliases', async () => {
    // Create monorepo structure in temp directory
    const monorepoDir = path.join(tmpDir, `test-monorepo-type-${randomUUID()}`)
    const sourceDir = path.join(monorepoDir, 'packages/source-lib')
    const targetDir = path.join(monorepoDir, 'packages/target-app')

    // Create directories
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.mkdirSync(targetDir, { recursive: true })
    fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true })
    fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })

    // Create source package with type exports
    fs.writeFileSync(
      path.join(sourceDir, 'package.json'),
      JSON.stringify({
        name: '@test/source-lib',
        version: '1.0.0',
        main: 'src/index.ts',
        types: 'src/index.ts'
      })
    )

    // Create source files with type exports
    fs.writeFileSync(
      path.join(sourceDir, 'src/types.ts'),
      `
export type Status = 'pending' | 'success' | 'error';

export type Coordinates = {
  x: number;
  y: number;
};

export type Callback<T> = (data: T) => void;
`
    )

    // Create barrel file
    fs.writeFileSync(
      path.join(sourceDir, 'src/index.ts'),
      `
export * from "./types";
`
    )

    // Create target package that imports from source
    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify({
        name: '@test/target-app',
        version: '1.0.0',
        dependencies: {
          '@test/source-lib': '1.0.0'
        }
      })
    )

    // Create target file with barrel imports
    fs.writeFileSync(
      path.join(targetDir, 'src/position-handler.ts'),
      `
import { Status, Coordinates, Callback } from "@test/source-lib";

export const updatePosition = (pos: Coordinates): void => {
  console.log(\`Position: (\${pos.x}, \${pos.y})\`);
};

export const handleStatus = (status: Status, callback: Callback<string>): void => {
  callback(\`Status changed to: \${status}\`);
};
`
    )

    // Run migration
    await runMigrateBarrelImports({
      sourcePath: sourceDir,
      targetPath: monorepoDir,
      includeExtension: true
    })

    // Read the updated file content
    const updatedContent = fs.readFileSync(path.join(targetDir, 'src/position-handler.ts'), 'utf-8')

    // Verify imports were updated to direct paths
    expect(updatedContent).toContain('import { Status, Coordinates, Callback } from "@test/source-lib/src/types.ts"')
    expect(updatedContent).not.toContain('import { Status, Coordinates, Callback } from "@test/source-lib"')

    // Clean up
    fs.rmSync(monorepoDir, { recursive: true, force: true })
  })

  it('should migrate barrel imports for TypeScript classes', async () => {
    // Create monorepo structure in temp directory
    const monorepoDir = path.join(tmpDir, `test-monorepo-class-${randomUUID()}`)
    const sourceDir = path.join(monorepoDir, 'packages/source-lib')
    const targetDir = path.join(monorepoDir, 'packages/target-app')

    // Create directories
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.mkdirSync(targetDir, { recursive: true })
    fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true })
    fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })

    // Create source package with class exports
    fs.writeFileSync(
      path.join(sourceDir, 'package.json'),
      JSON.stringify({
        name: '@test/source-lib',
        version: '1.0.0',
        main: 'src/index.ts',
        types: 'src/index.ts'
      })
    )

    // Create source files with class exports
    fs.writeFileSync(
      path.join(sourceDir, 'src/classes.ts'),
      `
export class Logger {
  constructor(private prefix: string) {}

  log(message: string): void {
    console.log(\`[\${this.prefix}] \${message}\`);
  }
}

export class Timer {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  getElapsed(): number {
    return Date.now() - this.startTime;
  }
}
`
    )

    // Create barrel file
    fs.writeFileSync(
      path.join(sourceDir, 'src/index.ts'),
      `
export * from "./classes";
`
    )

    // Create target package that imports from source
    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify({
        name: '@test/target-app',
        version: '1.0.0',
        dependencies: {
          '@test/source-lib': '1.0.0'
        }
      })
    )

    // Create target file with barrel imports
    fs.writeFileSync(
      path.join(targetDir, 'src/app.ts'),
      `
import { Logger, Timer } from "@test/source-lib";

const logger = new Logger('App');
const timer = new Timer();

logger.log('Application started');
console.log(\`Elapsed time: \${timer.getElapsed()}ms\`);
`
    )

    // Run migration
    await runMigrateBarrelImports({
      sourcePath: sourceDir,
      targetPath: monorepoDir,
      includeExtension: true
    })

    // Read the updated file content
    const updatedContent = fs.readFileSync(path.join(targetDir, 'src/app.ts'), 'utf-8')

    // Verify imports were updated to direct paths
    expect(updatedContent).toContain('import { Logger, Timer } from "@test/source-lib/src/classes.ts"')
    expect(updatedContent).not.toContain('import { Logger, Timer } from "@test/source-lib"')

    // Clean up
    fs.rmSync(monorepoDir, { recursive: true, force: true })
  })
})
