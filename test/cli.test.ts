// fallow-ignore-file unused-file
// Reason: executed directly by `bun test`; not reachable from the bin entry
// point, so the reachability analysis flags it as unused.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'bun:test'
import { parseCliArgs } from '../src/cli'

const cliEntryPoint = path.join(import.meta.dir, '../src/index.ts')

const runCli = async (
	args: ReadonlyArray<string>,
	cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
	const proc = Bun.spawn(['bun', 'run', cliEntryPoint, ...args], {
		cwd,
		stdout: 'pipe',
		stderr: 'pipe'
	})
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited
	])

	return { stdout, stderr, exitCode }
}

describe('parseCliArgs', (): void => {
	it('parses positional source and target paths', (): void => {
		expect(parseCliArgs(['packages/*', 'apps/web'])).toEqual({
			sourcePath: 'packages/*',
			targetPath: 'apps/web',
			targetGlob: undefined,
			includeExtension: undefined,
			includeBarrels: undefined,
			dryRun: undefined,
			json: undefined,
			ignoreSourceFiles: undefined,
			ignoreTargetFiles: undefined,
			verbosity: undefined
		})
	})

	it('returns empty values when no arguments are given', (): void => {
		expect(parseCliArgs([])).toEqual({
			sourcePath: undefined,
			targetPath: undefined,
			targetGlob: undefined,
			includeExtension: undefined,
			dryRun: undefined,
			ignoreSourceFiles: undefined,
			ignoreTargetFiles: undefined
		})
	})

	it('parses --target-glob', (): void => {
		expect(
			parseCliArgs(['packages/*', '.', '--target-glob', 'apps/*'])
		).toEqual({
			sourcePath: 'packages/*',
			targetPath: '.',
			targetGlob: 'apps/*',
			includeExtension: undefined,
			includeBarrels: undefined,
			dryRun: undefined,
			json: undefined,
			ignoreSourceFiles: undefined,
			ignoreTargetFiles: undefined,
			verbosity: undefined
		})
	})

	it('parses --no-extension', (): void => {
		expect(parseCliArgs(['--no-extension']).includeExtension).toBe(false)
	})

	it('prefers --extension over --no-extension when both are given', (): void => {
		expect(
			parseCliArgs(['--no-extension', '--extension']).includeExtension
		).toBe(true)
	})

	it('parses --dry-run', (): void => {
		expect(parseCliArgs(['--dry-run']).dryRun).toBe(true)
	})

	it('parses --no-dry-run', (): void => {
		expect(parseCliArgs(['--no-dry-run']).dryRun).toBe(false)
	})

	it('parses --json', (): void => {
		expect(parseCliArgs(['--json']).json).toBe(true)
	})

	it('splits comma-separated ignore patterns', (): void => {
		const args = parseCliArgs([
			'--ignore-source-files',
			'**/*.test.ts, **/node_modules/**',
			'--ignore-target-files',
			'**/*.spec.ts'
		])

		expect(args.ignoreSourceFiles).toEqual([
			'**/*.test.ts',
			'**/node_modules/**'
		])
		expect(args.ignoreTargetFiles).toEqual(['**/*.spec.ts'])
	})

	it('parses --quiet', (): void => {
		expect(parseCliArgs(['--quiet']).verbosity).toBe('quiet')
	})

	it('parses -q as a shorthand for --quiet', (): void => {
		expect(parseCliArgs(['-q']).verbosity).toBe('quiet')
	})

	it('parses --verbose', (): void => {
		expect(parseCliArgs(['--verbose']).verbosity).toBe('verbose')
	})

	it('leaves verbosity undefined when neither flag is given', (): void => {
		expect(parseCliArgs(['packages/*']).verbosity).toBeUndefined()
	})

	it('prefers --verbose when combined with --quiet', (): void => {
		expect(parseCliArgs(['--quiet', '--verbose']).verbosity).toBe('verbose')
	})
	it('parses --include-barrels', (): void => {
		expect(parseCliArgs(['--include-barrels']).includeBarrels).toBe(true)
	})

	it('parses --no-include-barrels', (): void => {
		expect(parseCliArgs(['--no-include-barrels']).includeBarrels).toBe(false)
	})
})

describe('cli help', (): void => {
	it('documents --json', async () => {
		const { stdout, exitCode } = await runCli(['--help'])

		expect(exitCode).toBe(0)
		expect(stdout).toContain('--json')
	})
})

const createCliFixture = (testName: string) => {
	const monorepoDir = path.join(
		process.env.RUNNER_TEMP || os.tmpdir(),
		`test-${testName}-${randomUUID()}`
	)
	const sourceDir = path.join(monorepoDir, 'packages/source-lib')
	const targetDir = path.join(monorepoDir, 'packages/target-app')

	fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true })
	fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true })

	fs.writeFileSync(
		path.join(sourceDir, 'package.json'),
		JSON.stringify({ name: '@test/source-lib', version: '1.0.0' })
	)
	fs.writeFileSync(
		path.join(sourceDir, 'src/utils.ts'),
		'export const add = (a: number, b: number): number => a + b;\n'
	)
	fs.writeFileSync(
		path.join(sourceDir, 'src/index.ts'),
		'export * from "./utils";\n'
	)

	fs.writeFileSync(
		path.join(targetDir, 'package.json'),
		JSON.stringify({
			name: '@test/target-app',
			version: '1.0.0',
			dependencies: { '@test/source-lib': '1.0.0' }
		})
	)
	const targetFilePath = path.join(targetDir, 'src/calculator.ts')
	fs.writeFileSync(
		targetFilePath,
		'import { add } from "@test/source-lib";\n\nexport const sum = add(1, 2);\n'
	)

	return { monorepoDir, sourceDir, targetFilePath }
}

describe('cli --json', (): void => {
	it('prints exactly one JSON report in apply mode', async () => {
		const { monorepoDir, sourceDir, targetFilePath } =
			createCliFixture('cli-json-apply')

		const { stdout, exitCode } = await runCli(
			[sourceDir, monorepoDir, '--json', '--extension', '--no-dry-run'],
			monorepoDir
		)

		expect(exitCode).toBe(0)

		const report = JSON.parse(stdout)
		expect(report.mode).toBe('apply')
		expect(report.stats.targetFilesFound).toBe(1)
		expect(report.stats.importsMigrated).toBe(1)
		expect(report.warnings).toEqual([])
		expect(report.changedFiles).toEqual([targetFilePath])
		expect(report.skippedFiles).toEqual([])

		expect(fs.readFileSync(targetFilePath, 'utf8')).toContain(
			'@test/source-lib/src/utils.ts'
		)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('keeps stdout parseable when a target file is ignored', async () => {
		const { monorepoDir, sourceDir } = createCliFixture('cli-json-ignored')
		const ignoredFilePath = path.join(
			monorepoDir,
			'packages/target-app/src/generated.ts'
		)
		fs.writeFileSync(
			ignoredFilePath,
			'import { add } from "@test/source-lib";\nexport const x = add(1, 2);\n'
		)

		const { stdout, exitCode } = await runCli(
			[
				sourceDir,
				monorepoDir,
				'--json',
				'--extension',
				'--ignore-target-files',
				'**/generated.ts'
			],
			monorepoDir
		)

		expect(exitCode).toBe(0)
		// Exactly one JSON document on stdout, with nothing else leaked
		expect(JSON.parse(stdout)).toMatchObject({ mode: 'apply' })
		expect(stdout.trim().split('\n').length).toBe(1)
		expect(JSON.parse(stdout).stats.targetFilesSkipped).toBeGreaterThan(0)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('prints exactly one JSON report in dry-run mode without writing files', async () => {
		const { monorepoDir, sourceDir, targetFilePath } =
			createCliFixture('cli-json-dry-run')
		const originalContent = fs.readFileSync(targetFilePath, 'utf8')

		const { stdout, exitCode } = await runCli(
			[sourceDir, monorepoDir, '--json', '--extension', '--dry-run'],
			monorepoDir
		)

		expect(exitCode).toBe(0)

		const report = JSON.parse(stdout)
		expect(report.mode).toBe('dry-run')
		expect(report.stats.importsMigrated).toBe(1)
		expect(report.changedFiles).toEqual([targetFilePath])
		expect(fs.readFileSync(targetFilePath, 'utf8')).toBe(originalContent)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})

	it('exits with an error on stderr when --json is used without a source path', async () => {
		const { stdout, stderr, exitCode } = await runCli(['--json'])

		expect(exitCode).toBe(1)
		expect(stdout).toBe('')
		expect(stderr).toContain('--json requires source-path')
	})

	it('exits with an error on stderr when the source path is not a directory', async () => {
		const { stdout, stderr, exitCode } = await runCli([
			'packages/*',
			'.',
			'--json'
		])

		expect(exitCode).toBe(1)
		expect(stdout).toBe('')
		expect(stderr).toContain('Source path does not exist')
		expect(stderr).not.toContain('at async')
	})

	it('keeps stdout parseable when a target file fails to parse', async () => {
		const { monorepoDir, sourceDir } = createCliFixture('cli-json-warnings')
		const brokenFilePath = path.join(
			monorepoDir,
			'packages/target-app/src/broken.ts'
		)
		fs.writeFileSync(
			brokenFilePath,
			'import { add } from "@test/source-lib" {{{'
		)

		const { stdout, exitCode } = await runCli(
			[sourceDir, monorepoDir, '--json', '--extension'],
			monorepoDir
		)

		expect(exitCode).toBe(0)

		const report = JSON.parse(stdout)
		expect(
			report.warnings.some((warning: string) =>
				warning.includes(brokenFilePath)
			)
		).toBe(true)
		expect(
			report.parseErrors.some(
				(parseError: { filePath: string }) =>
					parseError.filePath === brokenFilePath
			)
		).toBe(true)

		fs.rmSync(monorepoDir, { recursive: true, force: true })
	})
})
