import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateBarrelImports } from '../src/migrate-barrel-imports'
import { type Options, defaultOptions } from '../src/options'

interface TestSetup {
  monorepoDir: string
  sourceDir: string
  targetDir: string
}

interface TestCase {
  name: string
  sourceExports: Record<string, string>
  targetFile: {
    path: string
    content: string
  }
  expectedImports?: string[]
}

// Helper functions
const createTestSetup = (testName: string): TestSetup => {
  const monorepoDir = path.join(process.env.RUNNER_TEMP || os.tmpdir(), `test-${testName}-${randomUUID()}`)
  const sourceDir = path.join(monorepoDir, 'packages/source-lib')
  const targetDir = path.join(monorepoDir, 'packages/target-app')

  // Create directory structure
  ;[sourceDir, targetDir].forEach((dir) => {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  })

  return { monorepoDir, sourceDir, targetDir }
}

const createPackageJson = (dir: string, name: string, dependencies: Record<string, string> = {}): void => {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      main: 'src/index.ts',
      types: 'src/index.ts',
      ...(Object.keys(dependencies).length > 0 && { dependencies })
    })
  )
}

const createSourceFiles = (dir: string, exports: Record<string, string>): void => {
  Object.entries(exports).forEach(([filePath, content]) => {
    fs.writeFileSync(path.join(dir, filePath), content)
  })
}

const cleanOutput = (content: string): string => {
  return content
    .replace(/\s+/g, ' ')
    .replace(/\s*{\s*/g, ' { ')
    .replace(/\s*}\s*/g, ' } ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*;\s*/g, ';')
    .replace(/import\s*{\s*/g, 'import { ')
    .replace(/\s*}\s*from/g, ' } from')
    .replace(/\s+/g, ' ')
    .trim()
}

const runMigrateBarrelImports = async (overrides: Partial<Options> = {}): Promise<void> => {
  const options: Options = {
    ...defaultOptions,
    sourcePath: 'source-path',
    ...overrides
  }
  await migrateBarrelImports(options)
}

describe.concurrent('migrate-barrel-imports', (): void => {
  // Test cases
  const testCases: TestCase[] = [
    {
      name: 'TS monorepo setup',
      sourceExports: {
        'src/utils.ts': `
export const add = (a: number, b: number): number => a + b;
export const subtract = (a: number, b: number): number => a - b;
`,
        'src/constants.ts': `
export const PI = 3.14159;
export const E = 2.71828;
`,
        'src/index.ts': `
export * from "./utils";
export * from "./constants";
`
      },
      targetFile: {
        path: 'src/calculator.ts',
        content: `
import { add, PI } from "@test/source-lib";

export const calculateArea = (radius: number): number => {
  return PI * add(radius, radius);
};
`
      },
      expectedImports: [
        'import { add } from "@test/source-lib/src/utils.ts"',
        'import { PI } from "@test/source-lib/src/constants.ts"'
      ]
    },
    {
      name: 'JS monorepo setup',
      sourceExports: {
        'src/utils.js': `
export const multiply = (a, b) => a * b;
export const divide = (a, b) => a / b;
`,
        'src/config.js': `
export const API_URL = 'https://api.example.com';
export const MAX_RETRIES = 3;
`,
        'src/index.js': `
export * from "./utils.js";
export * from "./config.js";
`
      },
      targetFile: {
        path: 'src/api-client.js',
        content: `
import { multiply, API_URL } from "@test/source-lib";

export const fetchWithRetry = async (endpoint) => {
  const fullUrl = \`\${API_URL}\${endpoint}\`;
  const timeout = multiply(1000, 2);
  return fetch(fullUrl, { timeout });
};
`
      },
      expectedImports: [
        'import { multiply } from "@test/source-lib/src/utils.js"',
        'import { API_URL } from "@test/source-lib/src/config.js"'
      ]
    }
  ]

  testCases.forEach(({ name, sourceExports, targetFile, expectedImports }) => {
    it(`should migrate barrel imports in a ${name}`, async () => {
      const { monorepoDir, sourceDir, targetDir } = createTestSetup(name.toLowerCase().replace(/\s+/g, '-'))

      // Setup source package
      createPackageJson(sourceDir, '@test/source-lib')
      createSourceFiles(sourceDir, sourceExports)

      // Setup target package
      createPackageJson(targetDir, '@test/target-app', { '@test/source-lib': '1.0.0' })
      fs.writeFileSync(path.join(targetDir, targetFile.path), targetFile.content)

      // Run migration
      await runMigrateBarrelImports({
        sourcePath: sourceDir,
        targetPath: monorepoDir,
        includeExtension: true
      })

      // Verify results
      const updatedContent = fs.readFileSync(path.join(targetDir, targetFile.path), 'utf-8')
      const cleanedContent = cleanOutput(updatedContent)

      expectedImports?.forEach((expected) => {
        expect(cleanedContent).toContain(expected)
      })

      // Cleanup
      fs.rmSync(monorepoDir, { recursive: true, force: true })
    })
  })

  // Special test cases for TypeScript features
  const tsFeatureTests: TestCase[] = [
    {
      name: 'TypeScript enums',
      sourceExports: {
        'src/enums.ts': `
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
`,
        'src/index.ts': 'export * from "./enums";'
      },
      targetFile: {
        path: 'src/status-handler.ts',
        content: `
import { Status, Direction } from "@test/source-lib";

export const handleStatus = (status: Status): void => {
  console.log(\`Current status: \${status}\`);
};

export const move = (direction: Direction): void => {
  console.log(\`Moving \${direction}\`);
};
`
      },
      expectedImports: ['import { Status, Direction } from "@test/source-lib/src/enums.ts"']
    },
    {
      name: 'TypeScript interfaces',
      sourceExports: {
        'src/types.ts': `
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
`,
        'src/index.ts': 'export * from "./types";'
      },
      targetFile: {
        path: 'src/user-service.ts',
        content: `
import { User, Config } from "@test/source-lib";

export const createUser = (user: User): void => {
  console.log(\`Creating user: \${user.name}\`);
};

export const loadConfig = (config: Config): void => {
  console.log(\`Loading config: \${config.apiUrl}\`);
};
`
      },
      expectedImports: ['import { User, Config } from "@test/source-lib/src/types.ts"']
    }
  ]

  tsFeatureTests.forEach(({ name, sourceExports, targetFile, expectedImports }) => {
    it(`should migrate barrel imports for ${name}`, async () => {
      const { monorepoDir, sourceDir, targetDir } = createTestSetup(name.toLowerCase().replace(/\s+/g, '-'))

      // Setup source package
      createPackageJson(sourceDir, '@test/source-lib')
      createSourceFiles(sourceDir, sourceExports)

      // Setup target package
      createPackageJson(targetDir, '@test/target-app', { '@test/source-lib': '1.0.0' })
      fs.writeFileSync(path.join(targetDir, targetFile.path), targetFile.content)

      // Run migration
      await runMigrateBarrelImports({
        sourcePath: sourceDir,
        targetPath: monorepoDir,
        includeExtension: true
      })

      // Verify results
      const updatedContent = fs.readFileSync(path.join(targetDir, targetFile.path), 'utf-8')
      const cleanedContent = cleanOutput(updatedContent)

      expectedImports?.forEach((expected) => {
        expect(cleanedContent).toContain(expected)
      })

      // Cleanup
      fs.rmSync(monorepoDir, { recursive: true, force: true })
    })
  })
})
