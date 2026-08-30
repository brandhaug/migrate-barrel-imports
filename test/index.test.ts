// fallow-ignore-file unused-file
// Reason: executed directly by `bun test`; not reachable from the bin entry
// point, so the reachability analysis flags it as unused.
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { type Options } from '../src/options'

const clackMocks = {
	intro: mock((): void => {}),
	outro: mock((): void => {}),
	log: { info: mock((): void => {}), error: mock((): void => {}) },
	cancel: mock((): void => {}),
	text: mock((): string | Promise<string> => ''),
	confirm: mock((): boolean | Promise<boolean> => false),
	isCancel: mock((): boolean => false)
}

mock.module('@clack/prompts', () => clackMocks)

const migrateBarrelImports = mock(async (): Promise<void> => {})
mock.module('../src/migrate-barrel-imports', () => ({
	migrateBarrelImports
}))

// Import modules under test after mocks are registered
const { main } = await import('../src/cli')

interface PromptAnswers {
	sourcePath: string
	targetPath: string
	includeExtension: boolean
	dryRun: boolean
}

function mockAnswers(overrides: Partial<PromptAnswers> = {}): PromptAnswers {
	const answers: PromptAnswers = {
		sourcePath: 'libs/*',
		targetPath: '.',
		includeExtension: true,
		dryRun: false,
		...overrides
	}

	clackMocks.text.mockImplementation(({ message }: { message?: string }) => {
		if (message?.startsWith('Source path')) {
			return answers.sourcePath
		}
		if (message?.startsWith('Path to the directory')) {
			return answers.targetPath
		}
		throw new Error(`Unexpected text prompt: ${String(message)}`)
	})

	clackMocks.confirm.mockImplementation(({ message }: { message?: string }) => {
		if (message?.includes('Include js|jsx|ts|tsx|mjs|cjs')) {
			return answers.includeExtension
		}
		if (message?.includes('dry-run mode')) {
			return answers.dryRun
		}
		throw new Error(`Unexpected confirm prompt: ${String(message)}`)
	})

	return answers
}

describe('index', (): void => {
	beforeEach((): void => {
		clackMocks.text.mockReset()
		clackMocks.confirm.mockReset()
		clackMocks.intro.mockClear()
		clackMocks.outro.mockClear()
		clackMocks.log.info.mockClear()
		migrateBarrelImports.mockReset()
		migrateBarrelImports.mockImplementation(async (): Promise<void> => {})
		clackMocks.isCancel.mockReturnValue(false)
		clackMocks.cancel.mockClear()
		clackMocks.log.error.mockClear()
	})

	it('should pass collected prompt values to migrateBarrelImports', async (): Promise<void> => {
		mockAnswers({
			targetPath: 'target-dir',
			includeExtension: false,
			dryRun: true
		})

		await main(undefined, { isInteractive: true })

		const options: Options = {
			sourcePath: 'libs/*',
			targetPath: 'target-dir',
			ignoreSourceFiles: [],
			ignoreTargetFiles: [],
			includeExtension: false,
			includeBarrels: false,
			dryRun: true,
			verbosity: 'normal'
		}

		expect(migrateBarrelImports).toHaveBeenCalledWith(options)
	})

	it('should prefer CLI arguments over prompts', async (): Promise<void> => {
		mockAnswers({
			targetPath: 'target-dir',
			includeExtension: false,
			dryRun: true
		})

		await main(
			[
				'libs/*',
				'cli-target-dir',
				'--no-extension',
				'--dry-run',
				'--ignore-source-files',
				'**/*.test.ts, **/node_modules/**',
				'--ignore-target-files',
				'**/*.spec.ts, **/dist/**'
			],
			{ isInteractive: true }
		)

		const options: Options = {
			sourcePath: 'libs/*',
			targetPath: 'cli-target-dir',
			ignoreSourceFiles: ['**/*.test.ts', '**/node_modules/**'],
			ignoreTargetFiles: ['**/*.spec.ts', '**/dist/**'],
			includeExtension: false,
			includeBarrels: false,
			dryRun: true,
			verbosity: 'normal'
		}

		expect(migrateBarrelImports).toHaveBeenCalledWith(options)
		expect(clackMocks.text).not.toHaveBeenCalled()
		expect(clackMocks.confirm).not.toHaveBeenCalled()
	})

	it('should fall back to default options when prompts are left empty', async (): Promise<void> => {
		mockAnswers()

		await main(undefined, { isInteractive: true })

		const options: Options = {
			sourcePath: 'libs/*',
			targetPath: '.',
			ignoreSourceFiles: [],
			ignoreTargetFiles: [],
			includeExtension: true,
			includeBarrels: false,
			dryRun: false,
			verbosity: 'normal'
		}

		expect(migrateBarrelImports).toHaveBeenCalledWith(options)
	})

	it('should exit cleanly when a prompt is cancelled', async (): Promise<void> => {
		mockAnswers()
		clackMocks.isCancel.mockReturnValue(true)

		await main(undefined, { isInteractive: true })

		expect(migrateBarrelImports).not.toHaveBeenCalled()
		expect(clackMocks.cancel).toHaveBeenCalledWith('Migration cancelled')
	})

	it('should not prompt and should default the extension when stdin is not a TTY', async (): Promise<void> => {
		mockAnswers()

		await main(['libs/*'], { isInteractive: false })

		const options: Options = {
			sourcePath: 'libs/*',
			targetPath: '.',
			ignoreSourceFiles: [],
			ignoreTargetFiles: [],
			includeExtension: true,
			includeBarrels: false,
			dryRun: false,
			verbosity: 'normal'
		}

		expect(migrateBarrelImports).toHaveBeenCalledWith(options)
		expect(clackMocks.text).not.toHaveBeenCalled()
		expect(clackMocks.confirm).not.toHaveBeenCalled()
	})

	it('should fail instead of prompting when no source path is given and stdin is not a TTY', async (): Promise<void> => {
		mockAnswers()
		const previousExitCode = process.exitCode

		await main([], { isInteractive: false })

		expect(migrateBarrelImports).not.toHaveBeenCalled()
		expect(clackMocks.text).not.toHaveBeenCalled()
		expect(clackMocks.log.error).toHaveBeenCalledWith(
			'source-path is required when stdin is not a TTY. Pass it as the first argument, e.g. migrate-barrel-imports packages .'
		)
		expect(process.exitCode).toBe(1)

		process.exitCode = previousExitCode ?? 0
	})

	it('should exit with code 1 instead of throwing when the migration fails', async (): Promise<void> => {
		mockAnswers()
		const previousExitCode = process.exitCode
		migrateBarrelImports.mockImplementation(async (): Promise<void> => {
			throw new Error('Source path does not exist: /tmp/packages/*')
		})

		await main(['packages/*'], { isInteractive: false })

		expect(process.exitCode).toBe(1)

		process.exitCode = previousExitCode ?? 0
	})

	it('should treat an empty source path as invalid', async (): Promise<void> => {
		mockAnswers({ sourcePath: '' })

		let validationError: string | undefined
		clackMocks.text.mockImplementation(
			async ({
				validate
			}: {
				validate?: (value: string | undefined) => string | Error | undefined
			}) => {
				if (validate) {
					validationError = validate('')
				}
				return ''
			}
		)

		await main(undefined, { isInteractive: true })

		expect(validationError).toBe('Source path is required')
	})

	it('should pass --quiet through as quiet verbosity', async (): Promise<void> => {
		mockAnswers()

		await main(['libs/*', '.', '--extension', '--no-dry-run', '--quiet'])

		expect(migrateBarrelImports).toHaveBeenCalledWith(
			expect.objectContaining({ verbosity: 'quiet' })
		)
	})

	it('should pass --verbose through as verbose verbosity', async (): Promise<void> => {
		mockAnswers()

		await main(['libs/*', '.', '--extension', '--no-dry-run', '--verbose'])

		expect(migrateBarrelImports).toHaveBeenCalledWith(
			expect.objectContaining({ verbosity: 'verbose' })
		)
	})

	it('should not print the intro banner or outro in quiet mode', async (): Promise<void> => {
		mockAnswers()

		await main(['libs/*', '.', '--extension', '--no-dry-run', '--quiet'])

		expect(clackMocks.intro).not.toHaveBeenCalled()
		expect(clackMocks.log.info).not.toHaveBeenCalled()
		expect(clackMocks.outro).not.toHaveBeenCalled()
	})

	it('should print the intro banner by default', async (): Promise<void> => {
		mockAnswers()

		await main(['libs/*', '.', '--extension', '--no-dry-run'])

		expect(clackMocks.intro).toHaveBeenCalled()
		expect(clackMocks.outro).toHaveBeenCalled()
	})
})
