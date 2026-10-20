import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createLogger } from '../src/logger'
import {
	findExports,
	migrateBarrelImports
} from '../src/migrate-barrel-imports'
import { defaultOptions } from '../src/options'

const logger = createLogger({ verbosity: 'silent' })
const originalImport = 'import { value } from "@test/source";\n'
let root: string

function write(relativePath: string, content: string): void {
	const file = path.join(root, relativePath)
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, content)
}

beforeEach(() => {
	root = fs.mkdtempSync(
		path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'glob-behavior-')
	)
	write('source/package.json', '{"name":"@test/source"}')
	write('source/value.ts', 'export const value = 1;\n')
	write('source/index.ts', 'export { value } from "./value";\n')
})

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true })
})

describe('migration file selection', () => {
	it('keeps source paths relative, preserves ignored exports, and follows source symlinks', async () => {
		write('source/nested/component.tsx', 'export const component = 2;')
		write('source/nested/script.js', 'export const script = 3;')
		write('source/nested/view.jsx', 'export const view = 4;')
		write('source/.hidden.ts', 'export const hidden = 5;')
		write('source/.hidden/file.ts', 'export const hiddenDirectory = 6;')
		write(
			'source/node_modules/dependency/index.ts',
			'export const dependency = 7;'
		)
		write('source/nested/dist/output.ts', 'export const output = 8;')
		write('source/build/output.ts', 'export const output = 9;')
		write('external/linked.ts', 'export const linked = 10;')
		fs.symlinkSync(
			path.join(root, 'external'),
			path.join(root, 'source/linked')
		)

		const exports = await findExports({
			packagePath: path.join(root, 'source'),
			ignoreSourceFiles: ['nested/*.{tsx,jsx}', '**/+(script|absent).js'],
			logger
		})

		expect(exports.map((entry) => entry.source).toSorted()).toEqual([
			'index.ts',
			'linked/linked.ts',
			'nested/component.tsx',
			'nested/script.js',
			'nested/view.jsx',
			'value.ts'
		])
		expect(
			exports
				.filter((entry) => entry.isIgnored)
				.map((entry) => entry.source)
				.toSorted()
		).toEqual(['nested/component.tsx', 'nested/script.js', 'nested/view.jsx'])
	})

	it.each(['relative', 'absolute'])(
		'keeps exclusions and absolute output with %s input paths',
		async (inputKind) => {
			for (const file of [
				'apps/web/main.ts',
				'apps/web/nested/keep.tsx',
				'apps/web/skip.test.ts',
				'apps/web/generated.js',
				'apps/web/.hidden.ts',
				'apps/.hidden/main.ts',
				'apps/web/node_modules/dep/main.ts',
				'apps/web/dist/main.ts',
				'apps/web/build/main.ts',
				'other/main.ts',
				'source/self.ts'
			]) {
				write(file, originalImport)
			}
			write('outside/main.ts', originalImport)
			fs.symlinkSync(
				path.join(root, 'outside'),
				path.join(root, 'apps/web/linked')
			)
			fs.symlinkSync(
				path.join(root, 'outside/main.ts'),
				path.join(root, 'apps/web/link.ts')
			)
			const targetPath =
				inputKind === 'relative' ? path.relative(process.cwd(), root) : root
			const result = await migrateBarrelImports(
				{
					...defaultOptions,
					sourcePath: path.join(targetPath, 'source'),
					targetPath,
					targetGlob: 'apps/{web,missing}{,/**}',
					ignoreTargetFiles: [
						'**/*.{test,spec}.ts',
						'**/+(generated|absent).js'
					]
				},
				logger
			)

			expect(result.changedFiles).toEqual([
				path.join(root, 'apps/web/main.ts'),
				path.join(root, 'apps/web/nested/keep.tsx')
			])
			expect(result.skippedFiles).toEqual([
				path.join(root, 'apps/web/generated.js'),
				path.join(root, 'apps/web/skip.test.ts')
			])
			expect(result.stats.targetFilesFound).toBe(2)
			expect(
				fs.readFileSync(path.join(root, 'apps/web/main.ts'), 'utf8')
			).toContain('@test/source/value')
			for (const file of [
				'apps/web/.hidden.ts',
				'apps/.hidden/main.ts',
				'apps/web/dist/main.ts',
				'apps/web/build/main.ts',
				'apps/web/node_modules/dep/main.ts',
				'outside/main.ts',
				'other/main.ts',
				'source/self.ts',
				'apps/web/generated.js',
				'apps/web/skip.test.ts'
			]) {
				expect(fs.readFileSync(path.join(root, file), 'utf8')).toBe(
					originalImport
				)
			}
		}
	)

	it('discovers the root and nested packages once while excluding hidden and generated packages', async () => {
		write('source/nested/package.json', '{"name":"@test/nested"}')
		write('source/nested/item.ts', 'export const item = 2;')
		for (const directory of ['.hidden', 'node_modules/dep', 'dist', 'build']) {
			write(`source/${directory}/package.json`, '{"name":"@test/excluded"}')
		}
		write('target/main.ts', originalImport)
		write('source/self.ts', originalImport)
		const result = await migrateBarrelImports(
			{
				...defaultOptions,
				sourcePath: path.join(root, 'source'),
				targetPath: root
			},
			logger
		)
		expect(result.stats.sourcePackagesFound).toBe(2)
		expect(result.changedFiles).toEqual([path.join(root, 'target/main.ts')])
		expect(fs.readFileSync(path.join(root, 'source/self.ts'), 'utf8')).toBe(
			originalImport
		)
	})
})
