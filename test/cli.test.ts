import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../src/cli'
import { migrateBarrelImports } from '../src/migrate-barrel-imports'
import type { Options } from '../src/options'

vi.mock('../src/migrate-barrel-imports', (): object => ({
	migrateBarrelImports: vi.fn()
}))

describe.concurrent('cli', (): void => {
	// Preserve the original process.argv to restore after tests
	const originalArgv = process.argv

	beforeEach((): void => {
		// Reset modules and mocks before each test
		vi.resetModules()
		vi.clearAllMocks()
		// Set a default argv (node and script name)
		process.argv = ['node', 'cli.js']
	})

	afterEach((): void => {
		// Restore the original process.argv after each test
		process.argv = originalArgv
		vi.resetAllMocks()
	})

	it('should pass default options when no arguments are provided', async (): Promise<void> => {
		// Define the simulated command-line arguments
		process.argv = ['node', 'cli.js', 'source-package']

		// Call the main function
		await main()

		const options: Options = {
			sourcePath: 'source-package',
			targetPath: '.',
			includeExtension: true,
			ignoreSourceFiles: [],
			ignoreTargetFiles: []
		}

		// Assert that migrateBarrelImports was called with the expected options
		expect(migrateBarrelImports).toHaveBeenCalledWith(options)
	})

	it('should correctly parse and pass all provided arguments', async (): Promise<void> => {
		// Define the simulated command-line arguments
		process.argv = [
			'node',
			'cli.js',
			'source-package',
			'target-dir',
			'--ignore-source-files=**/*.test.ts,**/node_modules/**',
			'--ignore-target-files=**/*.spec.ts,**/dist/**',
			'--no-extension'
		]

		// Call the main function
		await main()

		const options: Options = {
			sourcePath: 'source-package',
			targetPath: 'target-dir',
			ignoreSourceFiles: ['**/*.test.ts', '**/node_modules/**'],
			ignoreTargetFiles: ['**/*.spec.ts', '**/dist/**'],
			includeExtension: false
		}

		// Assert that migrateBarrelImports was called with the expected options
		expect(migrateBarrelImports).toHaveBeenCalledWith(options)
	})

	it('should handle missing source path', async (): Promise<void> => {
		// Define the simulated command-line arguments without source path
		process.argv = ['node', 'cli.js']

		// Mock process.exit to prevent actual exit
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('process.exit() called')
		})

		// Call the main function and expect it to throw
		await expect(main()).rejects.toThrow('process.exit() called')

		// Assert that process.exit was called with code 1
		expect(exitSpy).toHaveBeenCalledWith(1)

		// Clean up
		exitSpy.mockRestore()
	})
})
