import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../src/cli'
import { migrateBarrelImports } from '../src/migrate-barrel-imports'
import type { Options } from '../src/options'

vi.mock('@clack/prompts', (): object => ({
	intro: vi.fn(),
	outro: vi.fn(),
	log: { info: vi.fn() },
	cancel: vi.fn(),
	text: vi.fn(),
	confirm: vi.fn(),
	isCancel: vi.fn((): boolean => false)
}))

vi.mock('../src/migrate-barrel-imports', (): object => ({
	migrateBarrelImports: vi.fn()
}))

import * as clack from '@clack/prompts'

const mockedText = vi.mocked(clack.text)
const mockedConfirm = vi.mocked(clack.confirm)

type PromptAnswers = {
	sourcePath: string
	targetPath: string
	ignoreSourceFilesInput: string
	ignoreTargetFilesInput: string
	includeExtension: boolean
	dryRun: boolean
}

function mockAnswers(overrides: Partial<PromptAnswers> = {}): PromptAnswers {
	const answers: PromptAnswers = {
		sourcePath: 'libs/*',
		targetPath: '.',
		ignoreSourceFilesInput: '',
		ignoreTargetFilesInput: '',
		includeExtension: true,
		dryRun: false,
		...overrides
	}

	mockedText.mockImplementation(async ({ message }: { message?: string }) => {
		if (message?.startsWith('Source path')) {
			return answers.sourcePath
		}
		if (message?.startsWith('Path to the directory')) {
			return answers.targetPath
		}
		if (message?.startsWith('File patterns to ignore in source')) {
			return answers.ignoreSourceFilesInput
		}
		if (message?.startsWith('File patterns to ignore in target')) {
			return answers.ignoreTargetFilesInput
		}
		throw new Error(`Unexpected text prompt: ${String(message)}`)
	})

	mockedConfirm.mockImplementation(
		async ({ message }: { message?: string }) => {
			if (message?.includes('Include js|jsx|ts|tsx|mjs|cjs')) {
				return answers.includeExtension
			}
			if (message?.includes('dry-run mode')) {
				return answers.dryRun
			}
			throw new Error(`Unexpected confirm prompt: ${String(message)}`)
		}
	)

	return answers
}

describe('index', (): void => {
	beforeEach((): void => {
		vi.clearAllMocks()
		vi.mocked(clack.isCancel).mockReturnValue(false)
	})

	afterEach((): void => {
		vi.resetAllMocks()
		vi.mocked(clack.isCancel).mockReturnValue(false)
	})

	it('should pass collected prompt values to migrateBarrelImports', async (): Promise<void> => {
		mockAnswers({
			targetPath: 'target-dir',
			ignoreSourceFilesInput: '**/*.test.ts, **/node_modules/**',
			ignoreTargetFilesInput: '**/*.spec.ts, **/dist/**',
			includeExtension: false,
			dryRun: true
		})

		await main()

		const options: Options = {
			sourcePath: 'libs/*',
			targetPath: 'target-dir',
			ignoreSourceFiles: ['**/*.test.ts', '**/node_modules/**'],
			ignoreTargetFiles: ['**/*.spec.ts', '**/dist/**'],
			includeExtension: false,
			dryRun: true
		}

		expect(migrateBarrelImports).toHaveBeenCalledWith(options)
	})

	it('should fall back to default options when prompts are left empty', async (): Promise<void> => {
		mockAnswers()

		await main()

		const options: Options = {
			sourcePath: 'libs/*',
			targetPath: '.',
			ignoreSourceFiles: [],
			ignoreTargetFiles: [],
			includeExtension: true,
			dryRun: false
		}

		expect(migrateBarrelImports).toHaveBeenCalledWith(options)
	})

	it('should exit cleanly when a prompt is cancelled', async (): Promise<void> => {
		mockAnswers()
		vi.mocked(clack.isCancel).mockReturnValue(true)

		await main()

		expect(migrateBarrelImports).not.toHaveBeenCalled()
		expect(clack.cancel).toHaveBeenCalledWith('Migration cancelled')
	})

	it('should treat an empty source path as invalid', async (): Promise<void> => {
		mockAnswers({ sourcePath: '' })

		let validationError: string | undefined
		mockedText.mockImplementation(
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

		await main()

		expect(validationError).toBe('Source path is required')
	})
})
