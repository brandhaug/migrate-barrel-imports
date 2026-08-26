import { describe, expect, it } from 'bun:test'
import { parseCliArgs } from '../src/cli'

describe('parseCliArgs', (): void => {
	it('parses positional source and target paths', (): void => {
		expect(parseCliArgs(['packages/*', 'apps/web'])).toEqual({
			sourcePath: 'packages/*',
			targetPath: 'apps/web',
			includeExtension: undefined,
			dryRun: undefined,
			ignoreSourceFiles: undefined,
			ignoreTargetFiles: undefined,
			verbosity: undefined
		})
	})

	it('returns empty values when no arguments are given', (): void => {
		expect(parseCliArgs([])).toEqual({
			sourcePath: undefined,
			targetPath: undefined,
			includeExtension: undefined,
			dryRun: undefined,
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
})
