import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from '@babel/parser'
import { default as traverse } from '@babel/traverse'
import { describe, expect, it } from 'vitest'
import { migrateBarrelImports } from '../src/migrate-barrel-imports'
import { type Options, defaultOptions } from '../src/options'

describe.concurrent('migrate-barrel-imports', (): void => {
	// Use RUNNER_TEMP if available to avoid access errors in GHA
	const tmpDir = process.env.RUNNER_TEMP || os.tmpdir()

	// Helper function to run the migrateBarrelImports with overridden options
	const runMigrateBarrelImports = async (
		overrides: Partial<Options> = {}
	): Promise<void> => {
		const options: Options = {
			...defaultOptions,
			sourcePath: 'source-path',
			...overrides
		}
		await migrateBarrelImports(options)
	}

	it('should migrate barrel imports in a monorepo setup', async () => {
		// Create monorepo structure in temp directory
		const monorepoDir = path.join(tmpDir, `test-monorepo-${randomUUID()}`)
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
export * from './utils';
export * from './constants';
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
import { add, PI } from '@test/source-lib';

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

		// Read and parse the updated file
		const updatedContent = fs.readFileSync(
			path.join(targetDir, 'src/calculator.ts'),
			'utf-8'
		)
		const ast = parse(updatedContent, {
			sourceType: 'module',
			plugins: ['typescript']
		})

		// Track found imports
		const foundImports = {
			add: false,
			PI: false
		}

		// Verify imports were updated to direct paths
		traverse(ast, {
			ImportDeclaration(path) {
				const source = path.node.source.value
				const specifiers = path.node.specifiers

				for (const specifier of specifiers) {
					if (specifier.type === 'ImportSpecifier') {
						const importedName =
							specifier.imported.type === 'Identifier'
								? specifier.imported.name
								: specifier.imported.value

						if (
							importedName === 'add' &&
							source === '@test/source-lib/src/utils.ts'
						) {
							foundImports.add = true
						}
						if (
							importedName === 'PI' &&
							source === '@test/source-lib/src/constants.ts'
						) {
							foundImports.PI = true
						}
					}
				}
			}
		})

		expect(foundImports.add).toBe(true)
		expect(foundImports.PI).toBe(true)

		// Clean up
		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})
})
