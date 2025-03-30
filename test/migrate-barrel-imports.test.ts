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
    fs.mkdirSync(path.join(dir, 'src/components'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'src/icons/general'), { recursive: true })
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
    const fullPath = path.join(dir, filePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content)
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
    sourcePath: overrides.sourcePath || 'source-path',
    targetPath: overrides.targetPath || 'target-path',
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

  // Test case for migrating barrel imports within source package when inside target
  it('should migrate barrel imports within source package when inside target directory', async () => {
    const monorepoDir = path.join(process.env.RUNNER_TEMP || os.tmpdir(), `test-source-in-target-${randomUUID()}`)
    const targetDir = path.join(monorepoDir, 'packages/target-app')
    const internalSourceDir = path.join(targetDir, 'packages/source-lib')

    // Create directory structure
    fs.mkdirSync(path.join(targetDir, 'packages'), { recursive: true })
    fs.mkdirSync(path.join(internalSourceDir, 'src/components'), { recursive: true })

    // Create source package inside target directory
    createPackageJson(internalSourceDir, '@test/source-lib')

    // Create source package files with nested barrel files and components
    createSourceFiles(internalSourceDir, {
      'src/components/Button.tsx': `
export const Button = ({ children }: { children: React.ReactNode }) => {
  return <button>{children}</button>;
};
`,
      'src/components/Input.tsx': `
export const Input = ({ value }: { value: string }) => {
  return <input value={value} />;
};
`,
      'src/components/index.ts': `
export * from './Button';
export * from './Input';
`,
      'src/index.ts': `
export * from './components';
`
    })

    // Create a file in the source package that imports from its own barrel
    createSourceFiles(internalSourceDir, {
      'src/Form.tsx': `
import { Button, Input } from "@test/source-lib";

export const Form = () => {
  return (
    <form>
      <Input value="test" />
      <Button>Submit</Button>
    </form>
  );
};
`
    })

    // Create target app package
    fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })
    createPackageJson(targetDir, '@test/target-app', { '@test/source-lib': '1.0.0' })
    createSourceFiles(targetDir, {
      'src/App.tsx': `
import { Button, Input } from "@test/source-lib";

export const App = () => {
  return (
    <div>
      <Input value="test" />
      <Button>Click me</Button>
    </div>
  );
};
`
    })

    // Run migration
    await runMigrateBarrelImports({
      sourcePath: internalSourceDir,
      targetPath: targetDir,
      includeExtension: true
    })

    // Verify results for both internal and external files
    const formContent = fs.readFileSync(path.join(internalSourceDir, 'src/Form.tsx'), 'utf-8')
    const appContent = fs.readFileSync(path.join(targetDir, 'src/App.tsx'), 'utf-8')

    // Check internal file imports
    expect(cleanOutput(formContent)).toContain('import { Button } from "@test/source-lib/src/components/Button.tsx"')
    expect(cleanOutput(formContent)).toContain('import { Input } from "@test/source-lib/src/components/Input.tsx"')

    // Check external file imports
    expect(cleanOutput(appContent)).toContain('import { Button } from "@test/source-lib/src/components/Button.tsx"')
    expect(cleanOutput(appContent)).toContain('import { Input } from "@test/source-lib/src/components/Input.tsx"')

    // Cleanup
    fs.rmSync(monorepoDir, { recursive: true, force: true })
  })

  // Test cases for barrel file detection and handling
  const barrelFileTests: TestCase[] = [
    {
      name: 'Multiple barrel files',
      sourceExports: {
        'src/utils.ts': 'export const add = (a: number, b: number): number => a + b;',
        'src/constants.ts': 'export const PI = 3.14159;',
        'src/index.ts': `
          export * from "./utils";
          export * from "./constants";
        `,
        'src/features/index.ts': `
          export * from "../utils";
          export * from "../constants";
        `,
        'src/features/math.ts': 'export const multiply = (a: number, b: number): number => a * b;'
      },
      targetFile: {
        path: 'src/calculator.ts',
        content: `
          import { add, PI, multiply } from "@test/source-lib";
          import { add as addFromFeatures } from "@test/source-lib/features";
        `
      },
      expectedImports: [
        'import { add } from "@test/source-lib/src/utils.ts"',
        'import { PI } from "@test/source-lib/src/constants.ts"',
        'import { multiply } from "@test/source-lib/src/features/math.ts"'
      ]
    },
    {
      name: 'Nested barrel files',
      sourceExports: {
        'src/components/index.ts': `
          export * from "./button";
          export * from "./input";
        `,
        'src/components/button/index.ts': `
          export * from "./types";
          export * from "./styles";
        `,
        'src/components/button/types.ts': 'export interface ButtonProps { label: string; }',
        'src/components/button/styles.ts': 'export const buttonStyles = { color: "blue" };',
        'src/components/input/index.ts': 'export interface InputProps { value: string; }',
        'src/index.ts': 'export * from "./components";'
      },
      targetFile: {
        path: 'src/app.ts',
        content: `
          import { ButtonProps, buttonStyles, InputProps } from "@test/source-lib";
        `
      },
      expectedImports: [
        'import { ButtonProps } from "@test/source-lib/src/components/button/types.ts"',
        'import { buttonStyles } from "@test/source-lib/src/components/button/styles.ts"',
        'import { InputProps } from "@test/source-lib/src/components/input/index.ts"'
      ]
    },
    {
      name: 'Circular dependencies in barrel files',
      sourceExports: {
        'src/a.ts': 'export const a = "a";',
        'src/b.ts': 'export const b = "b";',
        'src/index.ts': `
          export * from "./a";
          export * from "./b";
        `,
        'src/circular.ts': `
          export * from "./index";
          export const c = "c";
        `
      },
      targetFile: {
        path: 'src/app.ts',
        content: `
          import { a, b, c } from "@test/source-lib";
        `
      },
      expectedImports: [
        'import { a } from "@test/source-lib/src/a.ts"',
        'import { b } from "@test/source-lib/src/b.ts"',
        'import { c } from "@test/source-lib/src/circular.ts"'
      ]
    },
    {
      name: 'Mixed exports in barrel files',
      sourceExports: {
        'src/utils.ts': 'export const add = (a: number, b: number): number => a + b;',
        'src/constants.ts': 'export const PI = 3.14159;',
        'src/index.ts': `
          export * from "./utils";
          export const multiply = (a: number, b: number): number => a * b;
          export default class Calculator {}
        `
      },
      targetFile: {
        path: 'src/calculator.ts',
        content: `
          import { add, PI, multiply, Calculator } from "@test/source-lib";
        `
      },
      expectedImports: [
        'import { add } from "@test/source-lib/src/utils.ts"',
        'import { PI } from "@test/source-lib/src/constants.ts"',
        'import { multiply } from "@test/source-lib/src/index.ts"',
        'import { Calculator } from "@test/source-lib"'
      ]
    },
    {
      name: 'External package re-exports',
      sourceExports: {
        'src/utils.ts': 'export const add = (a: number, b: number): number => a + b;',
        'src/index.ts': `
          export * from "./utils";
          export { something } from "external-package";
        `
      },
      targetFile: {
        path: 'src/app.ts',
        content: `
          import { add, something } from "@test/source-lib";
        `
      },
      expectedImports: [
        'import { add } from "@test/source-lib/src/utils.ts"',
        'import { something } from "external-package"'
      ]
    },
    {
      name: 'Multiple external package re-exports',
      sourceExports: {
        'src/utils.ts': 'export const add = (a: number, b: number): number => a + b;',
        'src/index.ts': `
          export * from "./utils";
          export { something } from "external-package";
          export { other } from "another-package";
          export { third } from "third-package";
        `
      },
      targetFile: {
        path: 'src/app.ts',
        content: `
          import { add, something, other, third } from "@test/source-lib";
        `
      },
      expectedImports: [
        'import { add } from "@test/source-lib/src/utils.ts"',
        'import { something } from "external-package"',
        'import { other } from "another-package"',
        'import { third } from "third-package"'
      ]
    },
    {
      name: 'Nested barrel files with multiple re-exports',
      sourceExports: {
        'src/components/Button.ts': `
          export const Button = () => {};
          export const ButtonGroup = () => {};
        `,
        'src/components/index.ts': `
          export * from './Button';
          export const ComponentA = () => {};
        `,
        'src/icons/Icon.ts': `
          export const Icon = () => {};
          export const IconGroup = () => {};
        `,
        'src/icons/index.ts': `
          export * from './Icon';
          export const IconA = () => {};
        `,
        'src/index.ts': `
          export * from './components';
          export * from './icons';
          export const RootComponent = () => {};
        `
      },
      targetFile: {
        path: 'src/app.ts',
        content: `
          import { Button, ButtonGroup, ComponentA, Icon, IconGroup, IconA, RootComponent } from "@test/source-lib";
        `
      },
      expectedImports: [
        'import { Button, ButtonGroup } from "@test/source-lib/src/components/Button.ts"',
        'import { ComponentA } from "@test/source-lib/src/components/index.ts"',
        'import { Icon, IconGroup } from "@test/source-lib/src/icons/Icon.ts"',
        'import { IconA } from "@test/source-lib/src/icons/index.ts"',
        'import { RootComponent } from "@test/source-lib/src/index.ts"'
      ]
    },
    {
      name: 'Large barrel file with many exports',
      sourceExports: {
        'src/icons/general/IconA.ts': 'export const IconA = () => {};',
        'src/icons/general/IconB.ts': 'export const IconB = () => {};',
        'src/icons/general/IconC.ts': 'export const IconC = () => {};',
        'src/icons/general/index.ts': `
          export * from './IconA';
          export * from './IconB';
          export * from './IconC';
          export const IconD = () => {};
          export const IconE = () => {};
        `
      },
      targetFile: {
        path: 'src/components/IconList.ts',
        content: `
          import { IconA, IconB, IconC, IconD, IconE } from "@test/source-lib/icons/general";
        `
      },
      expectedImports: [
        'import { IconA } from "@test/source-lib/src/icons/general/IconA.ts"',
        'import { IconB } from "@test/source-lib/src/icons/general/IconB.ts"',
        'import { IconC } from "@test/source-lib/src/icons/general/IconC.ts"',
        'import { IconD, IconE } from "@test/source-lib/src/icons/general/index.ts"'
      ]
    },
    {
      name: 'Barrel file with mixed direct exports and re-exports',
      sourceExports: {
        'src/utils/math.ts': `
          export const add = (a: number, b: number) => a + b;
          export const subtract = (a: number, b: number) => a - b;
        `,
        'src/utils/string.ts': `
          export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
          export const lowercase = (s: string) => s.toLowerCase();
        `,
        'src/utils/index.ts': `
          export * from './math';
          export * from './string';
          export const combine = (a: number, b: number) => a + b;
          export const format = (s: string) => s.trim();
        `
      },
      targetFile: {
        path: 'src/app.ts',
        content: `
          import { add, subtract, capitalize, lowercase, combine, format } from "@test/source-lib/utils";
        `
      },
      expectedImports: [
        'import { add, subtract } from "@test/source-lib/src/utils/math.ts"',
        'import { capitalize, lowercase } from "@test/source-lib/src/utils/string.ts"',
        'import { combine, format } from "@test/source-lib/src/utils/index.ts"'
      ]
    },
    {
      name: 'Only migrate imports from barrel files',
      sourceExports: {
        'src/components/Button.tsx': 'export const Button = () => <button>Click me</button>;',
        'src/components/Button.stories.tsx': 'export const Button = () => <button>Story</button>;',
        'src/components/index.ts': `
          export * from "./Button";
        `,
        'src/index.ts': `
          export * from "./components";
        `
      },
      targetFile: {
        path: 'src/app.tsx',
        content: `
          // Import from barrel file
          import { Button } from "@test/source-lib";
        `
      },
      expectedImports: ['import { Button } from "@test/source-lib/src/components/Button.tsx"']
    }
  ]

  barrelFileTests.forEach(({ name, sourceExports, targetFile, expectedImports }) => {
    it(`should handle ${name}`, async () => {
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
