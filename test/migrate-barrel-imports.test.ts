import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'bun:test'
import { createLogger, type Verbosity } from '../src/logger'
import {
	isBarrelFile,
	type ExportInfo,
	findExports,
	migrateBarrelImports,
	resolveExportSource
} from '../src/migrate-barrel-imports'
import { defaultOptions, type Options } from '../src/options'

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
	const monorepoDir = path.join(
		process.env.RUNNER_TEMP || os.tmpdir(),
		`test-${testName}-${randomUUID()}`
	)
	const sourceDir = path.join(monorepoDir, 'packages/source-lib')
	const targetDir = path.join(monorepoDir, 'packages/target-app')

	// Create directory structure
	;[sourceDir, targetDir].forEach((dir) => {
		fs.mkdirSync(path.join(dir, 'src/components'), { recursive: true })
		fs.mkdirSync(path.join(dir, 'src/icons/general'), { recursive: true })
	})

	return { monorepoDir, sourceDir, targetDir }
}

const createPackageJson = (
	dir: string,
	name: string,
	dependencies: Record<string, string> = {}
): void => {
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

const createSourceFiles = (
	dir: string,
	exports: Record<string, string>
): void => {
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

const runMigrateBarrelImports = async (
	overrides: Partial<Options> = {}
): Promise<void> => {
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
			const { monorepoDir, sourceDir, targetDir } = createTestSetup(
				name.toLowerCase().replace(/\s+/g, '-')
			)

			// Setup source package
			createPackageJson(sourceDir, '@test/source-lib')
			createSourceFiles(sourceDir, sourceExports)

			// Setup target package
			createPackageJson(targetDir, '@test/target-app', {
				'@test/source-lib': '1.0.0'
			})
			fs.writeFileSync(
				path.join(targetDir, targetFile.path),
				targetFile.content
			)

			// Run migration
			await runMigrateBarrelImports({
				sourcePath: sourceDir,
				targetPath: monorepoDir,
				includeExtension: true
			})

			// Verify results
			const updatedContent = fs.readFileSync(
				path.join(targetDir, targetFile.path),
				'utf-8'
			)
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
			expectedImports: [
				'import { Status, Direction } from "@test/source-lib/src/enums.ts"'
			]
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
			expectedImports: [
				'import { User, Config } from "@test/source-lib/src/types.ts"'
			]
		}
	]

	tsFeatureTests.forEach(
		({ name, sourceExports, targetFile, expectedImports }) => {
			it(`should migrate barrel imports for ${name}`, async () => {
				const { monorepoDir, sourceDir, targetDir } = createTestSetup(
					name.toLowerCase().replace(/\s+/g, '-')
				)

				// Setup source package
				createPackageJson(sourceDir, '@test/source-lib')
				createSourceFiles(sourceDir, sourceExports)

				// Setup target package
				createPackageJson(targetDir, '@test/target-app', {
					'@test/source-lib': '1.0.0'
				})
				fs.writeFileSync(
					path.join(targetDir, targetFile.path),
					targetFile.content
				)

				// Run migration
				await runMigrateBarrelImports({
					sourcePath: sourceDir,
					targetPath: monorepoDir,
					includeExtension: true
				})

				// Verify results
				const updatedContent = fs.readFileSync(
					path.join(targetDir, targetFile.path),
					'utf-8'
				)
				const cleanedContent = cleanOutput(updatedContent)

				expectedImports?.forEach((expected) => {
					expect(cleanedContent).toContain(expected)
				})

				// Cleanup
				fs.rmSync(monorepoDir, { recursive: true, force: true })
			})
		}
	)

	// Test case for migrating barrel imports within source package when inside target
	it('should migrate barrel imports within source package when inside target directory', async () => {
		const monorepoDir = path.join(
			process.env.RUNNER_TEMP || os.tmpdir(),
			`test-source-in-target-${randomUUID()}`
		)
		const targetDir = path.join(monorepoDir, 'packages/target-app')
		const internalSourceDir = path.join(targetDir, 'packages/source-lib')

		// Create directory structure
		fs.mkdirSync(path.join(targetDir, 'packages'), { recursive: true })
		fs.mkdirSync(path.join(internalSourceDir, 'src/components'), {
			recursive: true
		})

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
		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
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
		const formContent = fs.readFileSync(
			path.join(internalSourceDir, 'src/Form.tsx'),
			'utf-8'
		)
		const appContent = fs.readFileSync(
			path.join(targetDir, 'src/App.tsx'),
			'utf-8'
		)

		// Check internal file imports
		expect(cleanOutput(formContent)).toContain(
			'import { Button } from "@test/source-lib/src/components/Button.tsx"'
		)
		expect(cleanOutput(formContent)).toContain(
			'import { Input } from "@test/source-lib/src/components/Input.tsx"'
		)

		// Check external file imports
		expect(cleanOutput(appContent)).toContain(
			'import { Button } from "@test/source-lib/src/components/Button.tsx"'
		)
		expect(cleanOutput(appContent)).toContain(
			'import { Input } from "@test/source-lib/src/components/Input.tsx"'
		)

		// Cleanup
		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	// Test cases for barrel file detection and handling
	const barrelFileTests: TestCase[] = [
		{
			name: 'Multiple barrel files',
			sourceExports: {
				'src/utils.ts':
					'export const add = (a: number, b: number): number => a + b;',
				'src/constants.ts': 'export const PI = 3.14159;',
				'src/index.ts': `
          export * from "./utils";
          export * from "./constants";
        `,
				'src/features/index.ts': `
          export * from "../utils";
          export * from "../constants";
        `,
				'src/features/math.ts':
					'export const multiply = (a: number, b: number): number => a * b;'
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
				'src/components/button/types.ts':
					'export interface ButtonProps { label: string; }',
				'src/components/button/styles.ts':
					'export const buttonStyles = { color: "blue" };',
				'src/components/input/index.ts':
					'export interface InputProps { value: string; }',
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
				'src/utils.ts':
					'export const add = (a: number, b: number): number => a + b;',
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
				'src/utils.ts':
					'export const add = (a: number, b: number): number => a + b;',
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
				'src/utils.ts':
					'export const add = (a: number, b: number): number => a + b;',
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
			name: 'Name re-exported by a barrel and exported directly',
			sourceExports: {
				'src/aggregate.ts': `
          export { McpToolDescriptor } from './mcp-tool';
        `,
				'src/mcp-tool.ts': `
          export interface McpToolDescriptor { name: string; }
        `,
				'src/index.ts': `
          export * from './aggregate';
        `
			},
			targetFile: {
				path: 'src/app.ts',
				content: `
          import { McpToolDescriptor } from "@test/source-lib";
        `
			},
			expectedImports: [
				'import { McpToolDescriptor } from "@test/source-lib/src/mcp-tool.ts"'
			]
		},
		{
			name: 'Only migrate imports from barrel files',
			sourceExports: {
				'src/components/Button.tsx':
					'export const Button = () => <button>Click me</button>;',
				'src/components/Button.stories.tsx':
					'export const Button = () => <button>Story</button>;',
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
			expectedImports: [
				'import { Button } from "@test/source-lib/src/components/Button.tsx"'
			]
		}
	]

	barrelFileTests.forEach(
		({ name, sourceExports, targetFile, expectedImports }) => {
			it(`should handle ${name}`, async () => {
				const { monorepoDir, sourceDir, targetDir } = createTestSetup(
					name.toLowerCase().replace(/\s+/g, '-')
				)

				// Setup source package
				createPackageJson(sourceDir, '@test/source-lib')
				createSourceFiles(sourceDir, sourceExports)

				// Setup target package
				createPackageJson(targetDir, '@test/target-app', {
					'@test/source-lib': '1.0.0'
				})
				fs.writeFileSync(
					path.join(targetDir, targetFile.path),
					targetFile.content
				)

				// Run migration
				await runMigrateBarrelImports({
					sourcePath: sourceDir,
					targetPath: monorepoDir,
					includeExtension: true
				})

				// Verify results
				const updatedContent = fs.readFileSync(
					path.join(targetDir, targetFile.path),
					'utf-8'
				)
				const cleanedContent = cleanOutput(updatedContent)

				expectedImports?.forEach((expected) => {
					expect(cleanedContent).toContain(expected)
				})

				// Cleanup
				fs.rmSync(monorepoDir, { recursive: true, force: true })
			})
		}
	)

	it('should migrate imports from a .ts file containing generic arrow functions', async () => {
		const { monorepoDir, sourceDir, targetDir } = createTestSetup('ts-generics')

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/generics.ts': `
export const identity = <T>(value: T): T => value;
`,
			'src/index.ts': `
export * from "./generics";
`
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/consumer.ts'),
			`
import { identity } from "@test/source-lib";

export const echo = (value: string): string => identity(value);
`
		)

		await runMigrateBarrelImports({
			sourcePath: sourceDir,
			targetPath: monorepoDir,
			includeExtension: true
		})

		const updatedContent = fs.readFileSync(
			path.join(targetDir, 'src/consumer.ts'),
			'utf-8'
		)

		expect(cleanOutput(updatedContent)).toContain(
			'import { identity } from "@test/source-lib/src/generics.ts"'
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('should migrate imports from a .tsx file containing JSX', async () => {
		const { monorepoDir, sourceDir, targetDir } = createTestSetup('tsx-jsx')

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/badge.tsx': `
export const Badge = ({ label }: { label: string }) => <span>{label}</span>;
`,
			'src/index.ts': `
export * from "./badge";
`
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/view.tsx'),
			`
import { Badge } from "@test/source-lib";

export const View = () => <Badge label="hi" />;
`
		)

		await runMigrateBarrelImports({
			sourcePath: sourceDir,
			targetPath: monorepoDir,
			includeExtension: true
		})

		const updatedContent = fs.readFileSync(
			path.join(targetDir, 'src/view.tsx'),
			'utf-8'
		)

		expect(cleanOutput(updatedContent)).toContain(
			'import { Badge } from "@test/source-lib/src/badge.tsx"'
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('should rewrite imports in a target .ts file containing generic arrow functions', async () => {
		const { monorepoDir, sourceDir, targetDir } =
			createTestSetup('ts-generics-target')

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/utils.ts': `
export const add = (a: number, b: number): number => a + b;
`,
			'src/index.ts': `
export * from "./utils";
`
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/generic-consumer.ts'),
			`
import { add } from "@test/source-lib";

export const first = <T>(values: T[]): T | undefined => values[0];

export const sum = (a: number, b: number): number => add(a, b);
`
		)

		await runMigrateBarrelImports({
			sourcePath: sourceDir,
			targetPath: monorepoDir,
			includeExtension: true
		})

		const updatedContent = fs.readFileSync(
			path.join(targetDir, 'src/generic-consumer.ts'),
			'utf-8'
		)

		expect(cleanOutput(updatedContent)).toContain(
			'import { add } from "@test/source-lib/src/utils.ts"'
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})
})

const createBarrelTestFile = (
	relativePath: string,
	content: string
): string => {
	const dir = path.join(
		process.env.RUNNER_TEMP || os.tmpdir(),
		`barrel-detection-${randomUUID()}`
	)
	const filePath = path.join(dir, relativePath)
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, content)
	return filePath
}

describe('isBarrelFile', () => {
	it('treats an index file of re-exports as a barrel', async () => {
		const filePath = createBarrelTestFile(
			'src/index.ts',
			`export { Button } from './Button'
export * from './helpers'
export type { ButtonProps } from './Button'
`
		)

		expect(await isBarrelFile({ filePath })).toBe(true)
	})

	it('does not treat a component file with local JSX as a barrel', async () => {
		const filePath = createBarrelTestFile(
			'src/features/Rbac/Assignments/RoleTogglePopover.tsx',
			`import { useState } from 'react'

export { RoleToggleContext } from './RoleToggleContext'

export const RoleTogglePopover = (): JSX.Element => {
	const [open, setOpen] = useState(false)

	return <div onClick={() => setOpen(!open)}>{open ? 'open' : 'closed'}</div>
}
`
		)

		expect(await isBarrelFile({ filePath })).toBe(false)
	})

	it('does not treat a file mixing re-exports with declarations as a barrel', async () => {
		const filePath = createBarrelTestFile(
			'src/utils/mixed.ts',
			`export { formatDate } from './formatDate'
export * from './constants'

export const DEFAULT_LOCALE = 'en-US'

export function parseDate(input: string): Date {
	return new Date(input)
}
`
		)

		expect(await isBarrelFile({ filePath })).toBe(false)
	})

	it('treats the package main entry as a barrel even with a local declaration', async () => {
		const filePath = createBarrelTestFile(
			'src/entry.ts',
			`export { Button } from './Button'
export * from './helpers'

export const VERSION = '1.0.0'
`
		)
		const packagePath = path.resolve(path.dirname(filePath), '..')
		fs.writeFileSync(
			path.join(packagePath, 'package.json'),
			JSON.stringify({
				name: '@test/lib',
				main: './src/entry.ts',
				exports: { '.': './src/entry.ts' }
			})
		)

		expect(await isBarrelFile({ filePath, packagePath })).toBe(true)
	})

	it('does not treat a non-entry file of mixed content as a barrel even with a package entry', async () => {
		const filePath = createBarrelTestFile(
			'src/entry.ts',
			`export { Button } from './Button'

export const VERSION = '1.0.0'
`
		)
		const packagePath = path.resolve(path.dirname(filePath), '..')
		fs.writeFileSync(
			path.join(packagePath, 'package.json'),
			JSON.stringify({ name: '@test/lib', main: './src/other.ts' })
		)

		expect(await isBarrelFile({ filePath, packagePath })).toBe(false)
	})
})

describe.concurrent('unparseable files', (): void => {
	it('skips a target file that cannot be parsed and migrates the rest', async () => {
		const { monorepoDir, sourceDir, targetDir } =
			createTestSetup('unparseable-target')

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/utils.ts': `export const add = (a: number, b: number): number => a + b;\n`,
			'src/index.ts': `export * from "./utils";\n`
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		const brokenFile = path.join(targetDir, 'src/a-broken.ts')
		fs.writeFileSync(
			brokenFile,
			`import { add } from "@test/source-lib";\nconst broken = >>>;\n`
		)
		fs.writeFileSync(
			path.join(targetDir, 'src/b-good.ts'),
			`import { add } from "@test/source-lib";\nexport const sum = add(1, 2);\n`
		)

		const result = await migrateBarrelImports({
			...defaultOptions,
			sourcePath: sourceDir,
			targetPath: monorepoDir,
			includeExtension: true
		})

		expect(result.parseErrors.map(({ filePath }) => filePath)).toContain(
			brokenFile
		)

		const goodContent = cleanOutput(
			fs.readFileSync(path.join(targetDir, 'src/b-good.ts'), 'utf-8')
		)
		expect(goodContent).toContain(
			'import { add } from "@test/source-lib/src/utils.ts"'
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('skips a source file that cannot be parsed and still migrates exports from the rest', async () => {
		const { monorepoDir, sourceDir, targetDir } =
			createTestSetup('unparseable-source')

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/utils.ts': `export const add = (a: number, b: number): number => a + b;\n`,
			'src/broken.ts': `export const broken = >>>;\n`,
			'src/index.ts': `export * from "./utils";\nexport * from "./broken";\n`
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/consumer.ts'),
			`import { add } from "@test/source-lib";\nexport const sum = add(1, 2);\n`
		)

		const result = await migrateBarrelImports({
			...defaultOptions,
			sourcePath: sourceDir,
			targetPath: targetDir,
			includeExtension: true
		})

		expect(result.parseErrors.map(({ filePath }) => filePath)).toContain(
			path.join(sourceDir, 'src/broken.ts')
		)

		const consumerContent = cleanOutput(
			fs.readFileSync(path.join(targetDir, 'src/consumer.ts'), 'utf-8')
		)
		expect(consumerContent).toContain(
			'import { add } from "@test/source-lib/src/utils.ts"'
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('reports each unparseable file only once', async () => {
		const { monorepoDir, sourceDir, targetDir } =
			createTestSetup('unparseable-dedupe')

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/utils.ts': `export const add = (a: number, b: number): number => a + b;\n`,
			'src/broken.ts': `export const broken = >>>;\n`,
			'src/index.ts': `export * from "./utils";\n`
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/consumer.ts'),
			`import { add } from "@test/source-lib";\nexport const sum = add(1, 2);\n`
		)

		const result = await migrateBarrelImports({
			...defaultOptions,
			sourcePath: sourceDir,
			targetPath: monorepoDir,
			includeExtension: true
		})

		const brokenPath = path.join(sourceDir, 'src/broken.ts')
		const occurrences = result.parseErrors.filter(
			({ filePath }) => filePath === brokenPath
		)
		expect(occurrences).toHaveLength(1)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('adds each unparseable file to the warnings', async () => {
		const { monorepoDir, sourceDir, targetDir } = createTestSetup(
			'unparseable-warnings'
		)

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/utils.ts': `export const add = (a: number, b: number): number => a + b;\n`,
			'src/index.ts': `export * from "./utils";\n`
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		const brokenFile = path.join(targetDir, 'src/broken.ts')
		fs.writeFileSync(
			brokenFile,
			`import { add } from "@test/source-lib";\nconst broken = >>>;\n`
		)

		const result = await migrateBarrelImports({
			...defaultOptions,
			sourcePath: sourceDir,
			targetPath: monorepoDir,
			includeExtension: true
		})

		expect(
			result.warnings.some(
				(warning) =>
					warning.includes(brokenFile) && warning.includes('failed to parse')
			)
		).toBe(true)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('reports the number of unparseable files in the migration summary', async () => {
		const { monorepoDir, sourceDir, targetDir } = createTestSetup(
			'unparseable-summary'
		)

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/utils.ts': `export const add = (a: number, b: number): number => a + b;\n`,
			'src/index.ts': `export * from "./utils";\n`
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/broken.ts'),
			`import { add } from "@test/source-lib";\nconst broken = >>>;\n`
		)

		const lines: string[] = []
		const originalLog = console.log
		console.log = (...args: unknown[]): void => {
			lines.push(args.map(String).join(' '))
		}

		try {
			await migrateBarrelImports({
				...defaultOptions,
				sourcePath: sourceDir,
				targetPath: monorepoDir,
				includeExtension: true
			})
		} finally {
			console.log = originalLog
		}

		expect(lines.join('\n')).toContain('Files that could not be parsed: 1')

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('skips a source package whose package.json cannot be parsed and migrates the rest', async () => {
		const { monorepoDir, targetDir } = createTestSetup(
			'unparseable-package-json'
		)
		const packagesDir = path.join(monorepoDir, 'packages')
		const goodLib = path.join(packagesDir, 'good-lib')
		const brokenLib = path.join(packagesDir, 'broken-lib')

		fs.mkdirSync(path.join(goodLib, 'src'), { recursive: true })
		fs.mkdirSync(path.join(brokenLib, 'src'), { recursive: true })

		createPackageJson(goodLib, '@test/good-lib')
		createSourceFiles(goodLib, {
			'src/utils.ts': `export const add = (a: number, b: number): number => a + b;\n`,
			'src/index.ts': `export * from "./utils";\n`
		})

		const brokenPackageJson = path.join(brokenLib, 'package.json')
		fs.writeFileSync(brokenPackageJson, '{ not valid json')
		fs.writeFileSync(
			path.join(brokenLib, 'src/index.ts'),
			`export const noop = (): void => {};\n`
		)

		createPackageJson(targetDir, '@test/target-app', {
			'@test/good-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/consumer.ts'),
			`import { add } from "@test/good-lib";\nexport const sum = add(1, 2);\n`
		)

		const result = await migrateBarrelImports({
			...defaultOptions,
			sourcePath: packagesDir,
			targetPath: targetDir,
			includeExtension: true
		})

		expect(result.parseErrors.map(({ filePath }) => filePath)).toContain(
			brokenPackageJson
		)

		const consumerContent = cleanOutput(
			fs.readFileSync(path.join(targetDir, 'src/consumer.ts'), 'utf-8')
		)
		expect(consumerContent).toContain(
			'import { add } from "@test/good-lib/src/utils.ts"'
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})
})

describe.concurrent('findExports', (): void => {
	const createPackage = (
		testName: string,
		files: Record<string, string>
	): string => {
		const packageDir = path.join(
			process.env.RUNNER_TEMP || os.tmpdir(),
			`test-${testName}-${randomUUID()}`
		)
		fs.mkdirSync(packageDir, { recursive: true })
		createPackageJson(packageDir, '@test/source-lib')
		createSourceFiles(packageDir, files)
		return packageDir
	}

	it('reports each exported name once per file', async () => {
		const packagePath = createPackage('dedupe-names', {
			'src/dto.ts': 'export interface WorkspaceOverviewDto { id: string; }',
			'src/index.ts': `
export { WorkspaceOverviewDto } from './dto';
export type { WorkspaceOverviewDto } from './dto';
`
		})

		const exports = await findExports({ packagePath })
		const indexExports = exports.find((info) => info.source === 'src/index.ts')

		expect(indexExports?.exports).toEqual(['WorkspaceOverviewDto'])

		fs.rmSync(packagePath, { recursive: true, force: true })
	})

	it('logs each exported name once per file', async () => {
		const packagePath = createPackage('dedupe-log', {
			'src/dto.ts': 'export interface WorkspaceOverviewDto { id: string; }',
			'src/index.ts': `
export { WorkspaceOverviewDto } from './dto';
export type { WorkspaceOverviewDto } from './dto';
`
		})
		const lines: string[] = []

		await findExports({
			packagePath,
			logger: createLogger({
				verbosity: 'verbose',
				write: (line: string): void => {
					lines.push(line)
				}
			})
		})

		const indexLine = lines.find(
			(line) =>
				line.startsWith('Found exports') && line.endsWith('in src/index.ts')
		)
		expect(indexLine).toBe('Found exports WorkspaceOverviewDto in src/index.ts')

		fs.rmSync(packagePath, { recursive: true, force: true })
	})

	it('records each file once per exported name', async () => {
		const packagePath = createPackage('dedupe-files', {
			'src/dto.ts': 'export interface WorkspaceOverviewDto { id: string; }',
			'src/index.ts': `
export { WorkspaceOverviewDto } from './dto';
export type { WorkspaceOverviewDto } from './dto';
`
		})

		const exports = await findExports({ packagePath })
		const files = exports[0]?.exportFiles?.WorkspaceOverviewDto ?? []

		expect(files).toEqual(['src/dto.ts', 'src/index.ts'])

		fs.rmSync(packagePath, { recursive: true, force: true })
	})
})

const buildDuplicatedExports = (files: string[]): ExportInfo[] =>
	files.map((source) => ({
		source,
		exports: ['Duplicated'],
		exportFiles: { Duplicated: files }
	}))

describe.concurrent('resolveExportSource', (): void => {
	it('prefers the direct module over a barrel that re-exports the name', () => {
		const exportFiles = {
			McpToolDescriptor: ['src/aggregate.ts', 'src/mcp-tool.ts']
		}
		const exports: ExportInfo[] = [
			{
				source: 'src/aggregate.ts',
				exports: ['McpToolDescriptor'],
				isBarrelFile: true,
				exportFiles
			},
			{
				source: 'src/mcp-tool.ts',
				exports: ['McpToolDescriptor'],
				exportFiles
			}
		]

		expect(resolveExportSource({ name: 'McpToolDescriptor', exports })).toBe(
			'src/mcp-tool.ts'
		)
	})

	it('resolves the same source regardless of candidate order', () => {
		const forward = resolveExportSource({
			name: 'Duplicated',
			exports: buildDuplicatedExports(['src/one.ts', 'src/two.ts'])
		})
		const reversed = resolveExportSource({
			name: 'Duplicated',
			exports: buildDuplicatedExports(['src/two.ts', 'src/one.ts'])
		})

		expect(forward).toBe(reversed)
	})
})

describe('migrate-barrel-imports dry-run diff', (): void => {
	const dryRunSourceExports: Record<string, string> = {
		'src/utils.ts': `
export const add = (a: number, b: number): number => a + b;
`,
		'src/constants.ts': `
export const PI = 3.14159;
`,
		'src/index.ts': `
export * from "./utils";
export * from "./constants";
`
	}

	const dryRunTargetFile = {
		path: 'src/calculator.ts',
		content: `import { add, PI } from "@test/source-lib";

export const calculateArea = (radius: number): number => {
  return PI * add(radius, radius);
};
`
	}

	const setupDryRunFixture = (): {
		monorepoDir: string
		sourceDir: string
		targetFilePath: string
	} => {
		const { monorepoDir, sourceDir, targetDir } =
			createTestSetup('dry-run-diff')

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, dryRunSourceExports)
		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})

		const targetFilePath = path.join(targetDir, dryRunTargetFile.path)
		fs.writeFileSync(targetFilePath, dryRunTargetFile.content)

		return { monorepoDir, sourceDir, targetFilePath }
	}

	const captureDryRunOutput = async (
		sourceDir: string,
		monorepoDir: string
	): Promise<string> => {
		const lines: string[] = []
		const originalLog = console.log
		console.log = (...args: unknown[]): void => {
			lines.push(args.map((arg) => String(arg)).join(' '))
		}

		try {
			await runMigrateBarrelImports({
				sourcePath: sourceDir,
				targetPath: monorepoDir,
				includeExtension: true,
				dryRun: true
			})
		} finally {
			console.log = originalLog
		}

		return lines.join('\n')
	}

	it('prints a before/after diff of each changed import statement', async () => {
		const { monorepoDir, sourceDir, targetFilePath } = setupDryRunFixture()

		const output = await captureDryRunOutput(sourceDir, monorepoDir)

		const headerPath = targetFilePath.replace(/^\/+/, '')
		expect(output).toContain(`--- a/${headerPath}`)
		expect(output).toContain(`+++ b/${headerPath}`)
		expect(output).toContain('-import { add, PI } from "@test/source-lib";')
		expect(output).toContain(
			'+import { add } from "@test/source-lib/src/utils.ts";'
		)
		expect(output).toContain(
			'+import { PI } from "@test/source-lib/src/constants.ts";'
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('leaves file contents on disk unchanged', async () => {
		const { monorepoDir, sourceDir, targetFilePath } = setupDryRunFixture()

		await captureDryRunOutput(sourceDir, monorepoDir)

		expect(fs.readFileSync(targetFilePath, 'utf-8')).toBe(
			dryRunTargetFile.content
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})
})

describe.concurrent('output verbosity', (): void => {
	const runWithVerbosity = async (
		testName: string,
		verbosity: Verbosity
	): Promise<string[]> => {
		const { monorepoDir, sourceDir, targetDir } = createTestSetup(testName)

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/utils.ts':
				'export const add = (a: number, b: number): number => a + b;\n',
			'src/index.ts': 'export * from "./utils";\n'
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/calculator.ts'),
			'import { add } from "@test/source-lib";\nexport const double = (n: number): number => add(n, n);\n'
		)

		const lines: string[] = []
		await migrateBarrelImports(
			{
				...defaultOptions,
				sourcePath: sourceDir,
				targetPath: monorepoDir,
				verbosity
			},
			createLogger({
				verbosity,
				write: (line: string): void => {
					lines.push(line)
				}
			})
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })

		return lines
	}

	it('prints only the migration summary in quiet mode', async () => {
		const output = (await runWithVerbosity('quiet-mode', 'quiet')).join('\n')

		expect(output).toContain('Migration Summary')
		expect(output).toContain('Total imports migrated:')
		expect(output).not.toContain('Processing file:')
		expect(output).not.toContain('Scanning for TypeScript')
	})

	it('prints the summary but no per-file processing output by default', async () => {
		const output = (await runWithVerbosity('normal-mode', 'normal')).join('\n')

		expect(output).toContain('Migration Summary')
		expect(output).not.toContain('Processing file:')
		expect(output).not.toContain('Scanning for TypeScript')
	})

	it('prints per-file processing output in verbose mode', async () => {
		const output = (await runWithVerbosity('verbose-mode', 'verbose')).join(
			'\n'
		)

		expect(output).toContain('Processing file:')
		expect(output).toContain('Scanning for TypeScript')
		expect(output).toContain('Migration Summary')
	})

	it('truncates a long export listing to 500 characters plus an ellipsis', async () => {
		const { monorepoDir, sourceDir, targetDir } = createTestSetup('truncation')

		const manyExports = Array.from(
			{ length: 200 },
			(_, index) => `export const generatedExport${index} = ${index};`
		).join('\n')

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/codegen.ts': `${manyExports}\n`,
			'src/index.ts': 'export * from "./codegen";\n'
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/app.ts'),
			'import { generatedExport0 } from "@test/source-lib";\nexport const value = generatedExport0;\n'
		)

		const lines: string[] = []
		await migrateBarrelImports(
			{
				...defaultOptions,
				sourcePath: sourceDir,
				targetPath: monorepoDir,
				verbosity: 'verbose'
			},
			createLogger({
				verbosity: 'verbose',
				write: (line: string): void => {
					lines.push(line)
				}
			})
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })

		const exportListing = lines.find((line) =>
			line.startsWith('Found exports generatedExport0')
		)

		expect(exportListing).toBeDefined()
		expect(exportListing).toHaveLength(503)
		expect(exportListing?.endsWith('...')).toBe(true)
	})

	const runDryRun = async (
		testName: string,
		verbosity: Verbosity
	): Promise<string[]> => {
		const { monorepoDir, sourceDir, targetDir } = createTestSetup(testName)

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/utils.ts':
				'export const add = (a: number, b: number): number => a + b;\n',
			'src/index.ts': 'export * from "./utils";\n'
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/calculator.ts'),
			'import { add } from "@test/source-lib";\nexport const double = (n: number): number => add(n, n);\n'
		)

		const lines: string[] = []
		await migrateBarrelImports(
			{
				...defaultOptions,
				sourcePath: sourceDir,
				targetPath: monorepoDir,
				dryRun: true,
				verbosity
			},
			createLogger({
				verbosity,
				write: (line: string): void => {
					lines.push(line)
				}
			})
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })

		return lines
	}

	it('prints the dry-run import diff by default', async () => {
		const output = (await runDryRun('dry-run-normal', 'normal')).join('\n')

		expect(output).toContain('[dry-run] Would update imports in')
		expect(output).toContain(
			'+import { add } from "@test/source-lib/src/utils"'
		)
		expect(output).not.toContain('Processing file:')
	})

	it('suppresses the dry-run import diff in quiet mode', async () => {
		const output = (await runDryRun('dry-run-quiet', 'quiet')).join('\n')

		expect(output).not.toContain('[dry-run] Would update imports in')
		expect(output).toContain('Mode: dry-run (no files were modified)')
	})

	const runWithUnparseableFile = async (
		testName: string,
		verbosity: Verbosity
	): Promise<string[]> => {
		const { monorepoDir, sourceDir, targetDir } = createTestSetup(testName)

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, {
			'src/utils.ts':
				'export const add = (a: number, b: number): number => a + b;\n',
			'src/broken.ts': 'export const broken = (((;\n',
			'src/index.ts': 'export * from "./utils";\n'
		})

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/calculator.ts'),
			'import { add } from "@test/source-lib";\nexport const double = (n: number): number => add(n, n);\n'
		)

		const lines: string[] = []
		await migrateBarrelImports(
			{
				...defaultOptions,
				sourcePath: sourceDir,
				targetPath: monorepoDir,
				verbosity
			},
			createLogger({
				verbosity,
				write: (line: string): void => {
					lines.push(line)
				}
			})
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })

		return lines
	}

	it('warns about unparseable files by default and still migrates', async () => {
		const output = (
			await runWithUnparseableFile('parse-error-normal', 'normal')
		).join('\n')

		expect(output).toContain('src/broken.ts: failed to parse')
		expect(output).toContain('Files that could not be parsed: 1')
		expect(output).toContain('Total imports migrated: 1')
	})

	it('suppresses parse warnings in quiet mode but keeps the summary count', async () => {
		const output = (
			await runWithUnparseableFile('parse-error-quiet', 'quiet')
		).join('\n')

		expect(output).not.toContain('Skipping')
		expect(output).toContain('Files that could not be parsed: 1')
	})
	// Barrel files as rewrite targets
	const barrelSourceExports: Record<string, string> = {
		'src/utils.ts': `
export const add = (a: number, b: number): number => a + b;
`,
		'src/constants.ts': `
export const PI = 3.14159;
`,
		'src/index.ts': `
export * from "./utils";
export * from "./constants";
`
	}

	const barrelTargetContent = `
export * from "./client";
export { add, PI } from "@test/source-lib";
`

	const setupBarrelTarget = (
		testName: string
	): { monorepoDir: string; sourceDir: string; barrelPath: string } => {
		const { monorepoDir, sourceDir, targetDir } = createTestSetup(testName)

		createPackageJson(sourceDir, '@test/source-lib')
		createSourceFiles(sourceDir, barrelSourceExports)

		createPackageJson(targetDir, '@test/target-app', {
			'@test/source-lib': '1.0.0'
		})
		fs.writeFileSync(
			path.join(targetDir, 'src/client.ts'),
			'export const client = 1;\n'
		)
		const barrelPath = path.join(targetDir, 'src/index.ts')
		fs.writeFileSync(barrelPath, barrelTargetContent)

		return { monorepoDir, sourceDir, barrelPath }
	}

	it('should rewrite re-exports in a barrel target file when includeBarrels is enabled', async () => {
		const { monorepoDir, sourceDir, barrelPath } = setupBarrelTarget(
			'barrel-target-included'
		)

		await runMigrateBarrelImports({
			sourcePath: sourceDir,
			targetPath: monorepoDir,
			includeExtension: true,
			includeBarrels: true
		})

		const cleanedContent = cleanOutput(fs.readFileSync(barrelPath, 'utf-8'))

		expect(cleanedContent).toContain(
			'export { add } from "@test/source-lib/src/utils.ts"'
		)
		expect(cleanedContent).toContain(
			'export { PI } from "@test/source-lib/src/constants.ts"'
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('should leave re-exports in a barrel target file untouched by default', async () => {
		const { monorepoDir, sourceDir, barrelPath } = setupBarrelTarget(
			'barrel-target-skipped'
		)

		await runMigrateBarrelImports({
			sourcePath: sourceDir,
			targetPath: monorepoDir,
			includeExtension: true
		})

		expect(fs.readFileSync(barrelPath, 'utf-8')).toBe(barrelTargetContent)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('should count skipped barrel files in the stats and report them when verbose', async () => {
		const { monorepoDir, sourceDir, barrelPath } = setupBarrelTarget(
			'barrel-target-stats'
		)

		const lines: string[] = []
		const result = await migrateBarrelImports(
			{
				...defaultOptions,
				sourcePath: sourceDir,
				targetPath: monorepoDir,
				includeExtension: true,
				verbosity: 'verbose'
			},
			createLogger({
				verbosity: 'verbose',
				write: (line: string): void => {
					lines.push(line)
				}
			})
		)

		expect(result.stats.targetFilesSkipped).toBe(1)
		expect(result.stats.targetFilesProcessed).toBe(0)
		expect(lines.join('\n')).toContain(
			`Skipping barrel file (use --include-barrels to rewrite it): ${barrelPath}`
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})
})
