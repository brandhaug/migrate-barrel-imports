/**
 * How much output the migration prints.
 *
 * - `quiet`: only the migration summary
 * - `normal`: summary, dry-run diffs and warnings
 * - `verbose`: everything, including per-file progress
 */
export type Verbosity = 'quiet' | 'normal' | 'verbose'

export type Logger = {
	verbose: (message: string) => void
	info: (message: string) => void
	warn: (message: string) => void
	summary: (message: string) => void
	error: (message: string) => void
}

export type CreateLoggerOptions = {
	verbosity: Verbosity
	/** Sink for regular output. Defaults to `console.log`. */
	write?: (line: string) => void
	/** Sink for errors. Defaults to `write`, or `console.error` when unset. */
	writeError?: (line: string) => void
}

/** Maximum length of a single log line before it is truncated. */
export const MAX_LOG_LINE_LENGTH = 500

/** Shortens a log line that would otherwise flood the terminal. */
export function truncateLine(line: string): string {
	if (line.length <= MAX_LOG_LINE_LENGTH) {
		return line
	}

	return `${line.slice(0, MAX_LOG_LINE_LENGTH)}...`
}

function truncateMessage(message: string): string {
	return message.split('\n').map(truncateLine).join('\n')
}

export function createLogger(options: CreateLoggerOptions): Logger {
	const { verbosity } = options
	const writeLine = options.write ?? console.log
	const writeErrorLine = options.writeError ?? options.write ?? console.error

	const write = (message: string): void => {
		writeLine(truncateMessage(message))
	}

	return {
		verbose: (message: string): void => {
			if (verbosity === 'verbose') {
				write(message)
			}
		},
		info: (message: string): void => {
			if (verbosity !== 'quiet') {
				write(message)
			}
		},
		warn: (message: string): void => {
			if (verbosity !== 'quiet') {
				write(message)
			}
		},
		summary: (message: string): void => {
			write(message)
		},
		error: (message: string): void => {
			writeErrorLine(truncateMessage(message))
		}
	}
}
