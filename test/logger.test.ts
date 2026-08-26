import { describe, expect, it } from 'bun:test'
import { createLogger } from '../src/logger'

const collect = (run: (write: (line: string) => void) => void): string[] => {
	const lines: string[] = []
	run((line: string): void => {
		lines.push(line)
	})
	return lines
}

describe('createLogger', (): void => {
	it('suppresses processing output but keeps the summary in quiet mode', (): void => {
		const lines = collect((write): void => {
			const logger = createLogger({ verbosity: 'quiet', write })
			logger.verbose('Processing file: src/foo.ts')
			logger.summary('Migration Summary')
		})

		expect(lines).toEqual(['Migration Summary'])
	})

	it('prints warnings and the summary but no processing output by default', (): void => {
		const lines = collect((write): void => {
			const logger = createLogger({ verbosity: 'normal', write })
			logger.verbose('Processing file: src/foo.ts')
			logger.warn('Could not resolve export foo')
			logger.summary('Migration Summary')
		})

		expect(lines).toEqual(['Could not resolve export foo', 'Migration Summary'])
	})

	it('suppresses warnings in quiet mode', (): void => {
		const lines = collect((write): void => {
			const logger = createLogger({ verbosity: 'quiet', write })
			logger.warn('Could not resolve export foo')
		})

		expect(lines).toEqual([])
	})

	it('prints processing output in verbose mode', (): void => {
		const lines = collect((write): void => {
			const logger = createLogger({ verbosity: 'verbose', write })
			logger.verbose('Processing file: src/foo.ts')
			logger.warn('Could not resolve export foo')
			logger.summary('Migration Summary')
		})

		expect(lines).toEqual([
			'Processing file: src/foo.ts',
			'Could not resolve export foo',
			'Migration Summary'
		])
	})

	it('truncates a single log line longer than 500 characters', (): void => {
		const lines = collect((write): void => {
			const logger = createLogger({ verbosity: 'verbose', write })
			logger.verbose('x'.repeat(1000))
		})

		expect(lines[0]).toBe(`${'x'.repeat(500)}...`)
	})

	it('leaves a line of exactly 500 characters untouched', (): void => {
		const lines = collect((write): void => {
			const logger = createLogger({ verbosity: 'verbose', write })
			logger.verbose('x'.repeat(500))
		})

		expect(lines[0]).toBe('x'.repeat(500))
	})

	it('truncates each line of a multi-line message independently', (): void => {
		const lines = collect((write): void => {
			const logger = createLogger({ verbosity: 'verbose', write })
			logger.verbose(`\nshort\n${'x'.repeat(1000)}`)
		})

		expect(lines[0]).toBe(`\nshort\n${'x'.repeat(500)}...`)
	})

	it('always prints errors, even in quiet mode', (): void => {
		const lines = collect((write): void => {
			const logger = createLogger({ verbosity: 'quiet', write })
			logger.error('Error during migration: boom')
		})

		expect(lines).toEqual(['Error during migration: boom'])
	})

	it('prints info output by default but not in quiet mode', (): void => {
		const normalLines = collect((write): void => {
			createLogger({ verbosity: 'normal', write }).info(
				'[dry-run] Would update imports in src/app.ts'
			)
		})
		const quietLines = collect((write): void => {
			createLogger({ verbosity: 'quiet', write }).info(
				'[dry-run] Would update imports in src/app.ts'
			)
		})

		expect(normalLines).toEqual([
			'[dry-run] Would update imports in src/app.ts'
		])
		expect(quietLines).toEqual([])
	})
})
