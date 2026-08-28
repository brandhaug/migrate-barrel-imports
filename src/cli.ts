import { parseArgs } from 'node:util'
import * as p from '@clack/prompts'
import {
	migrateBarrelImports,
	type MigrationResult
} from './migrate-barrel-imports.js'
import { type Verbosity } from './logger.js'
import { defaultOptions, type Options } from './options.js'

/** Defaults used when prompts are unavailable (stdin is not a TTY). */
const NON_INTERACTIVE_INCLUDE_EXTENSION = true
const NON_INTERACTIVE_DRY_RUN = false

export type CliArgs = Partial<Omit<Options, 'targetPath'>> & {
	targetPath?: string
}

/**
 * Parses command-line arguments into partial migration options.
 *
 * Supports two positionals (`source-path` and optional `target-path`) plus flags:
 * `--extension` / `--no-extension`, `--include-barrels` / `--no-include-barrels`,
 * `--target-glob <pattern>`, `--ignore-source-files <patterns>`,
 * `--ignore-target-files <patterns>`, `--dry-run`, `--quiet` / `--verbose`,
 * `--json`.
 */
export function parseCliArgs(argv: ReadonlyArray<string>): CliArgs {
	const {
		args: withoutNegation,
		noExtension,
		noIncludeBarrels,
		noDryRun
	} = extractNegations(argv)
	const { values, positionals } = parseArgs({
		args: [...withoutNegation],
		allowPositionals: true,
		options: {
			extension: {
				type: 'boolean',
				default: undefined,
				description:
					'Include js|jsx|ts|tsx|mjs|cjs file extensions in import statements'
			},
			'include-barrels': {
				type: 'boolean',
				default: undefined,
				description:
					'Also rewrite imports inside barrel files (index files of re-exports)'
			},
			'target-glob': {
				type: 'string',
				description:
					'Glob, relative to target-path, restricting which target directories are scanned'
			},
			'ignore-source-files': {
				type: 'string',
				description:
					'Comma-separated file patterns to ignore in source directories'
			},
			'ignore-target-files': {
				type: 'string',
				description:
					'Comma-separated file patterns to ignore in target directories'
			},
			'dry-run': {
				type: 'boolean',
				default: undefined,
				description: 'Preview changes without modifying files'
			},
			quiet: {
				type: 'boolean',
				short: 'q',
				default: undefined,
				description: 'Print only the migration summary'
			},
			verbose: {
				type: 'boolean',
				default: undefined,
				description: 'Print per-file progress in addition to the summary'
			},
			json: {
				type: 'boolean',
				default: undefined,
				description:
					'Print one machine-readable JSON report to stdout and suppress all other output'
			},
			help: { type: 'boolean', short: 'h', description: 'Show this help' }
		}
	})

	if (values.help) {
		console.log(`migrate-barrel-imports [source-path] [target-path] [options]

Positionals:
  source-path              Directory scanned recursively for packages containing barrel files (e.g. packages)
  target-path              Directory where imports should be migrated (default: .)

Options:
  --extension / --no-extension     Include file extensions in imports
  --include-barrels / --no-include-barrels
                                   Also rewrite imports inside barrel files (skipped by default)
  --target-glob <pattern>          Glob (relative to target-path) restricting which target directories are scanned
  --ignore-source-files <patterns> Comma-separated patterns to ignore in source dirs
  --ignore-target-files <patterns> Comma-separated patterns to ignore in target dirs
  --dry-run / --no-dry-run       Preview changes without modifying files
  -q, --quiet                      Print only the migration summary
  --verbose                        Print per-file progress in addition to the summary
  --json                           Print one JSON report to stdout and suppress all other output
  -h, --help                       Show this help

Prompts are shown only when stdin is a TTY. Without one, --extension defaults to
on, --dry-run to off, target-path to the current directory, and a missing
source-path exits with code 1.`)
		process.exit(0)
	}

	return {
		sourcePath: positionals[0],
		targetPath: positionals[1],
		targetGlob: values['target-glob'],
		includeExtension: values.extension ?? (noExtension ? false : undefined),
		includeBarrels:
			values['include-barrels'] ?? (noIncludeBarrels ? false : undefined),
		dryRun: noDryRun ? false : values['dry-run'],
		ignoreSourceFiles: splitPatterns(values['ignore-source-files']),
		ignoreTargetFiles: splitPatterns(values['ignore-target-files']),
		verbosity: resolveVerbosityFlag(values.verbose, values.quiet),
		json: values.json
	}
}

function resolveVerbosityFlag(
	verbose: boolean | undefined,
	quiet: boolean | undefined
): Verbosity | undefined {
	if (verbose) {
		return 'verbose'
	}

	if (quiet) {
		return 'quiet'
	}

	return undefined
}

/** Positionals and negation flags pulled out of argv before parseArgs runs. */
interface NegatedFlags {
	args: Array<string>
	noExtension: boolean
	noIncludeBarrels: boolean
	noDryRun: boolean
}

function extractNegations(argv: ReadonlyArray<string>): NegatedFlags {
	const args: Array<string> = []
	let noExtension = false
	let noIncludeBarrels = false
	let noDryRun = false

	for (const arg of argv) {
		if (arg === '--no-include-barrels') {
			noIncludeBarrels = true
		} else if (arg === '--no-extension') {
			noExtension = true
		} else if (arg === '--no-dry-run') {
			noDryRun = true
		} else {
			args.push(arg)
		}
	}

	return { args, noExtension, noIncludeBarrels, noDryRun }
}

function splitPatterns(value: string | undefined): Array<string> | undefined {
	if (value === undefined) {
		return undefined
	}

	return value
		.split(',')
		.map((pattern) => pattern.trim())
		.filter((pattern): pattern is string => pattern.length > 0)
}

async function resolveSourcePath(
	cliValue: string | undefined,
	isInteractive: boolean
): Promise<string | symbol | undefined> {
	if (cliValue !== undefined && cliValue.trim().length > 0) {
		return cliValue
	}

	if (!isInteractive) {
		return undefined
	}

	return p.text({
		message: 'Source path (directory) for packages containing barrel files',
		placeholder: 'packages',
		validate: (value: string | undefined): string | Error | undefined => {
			if (value === undefined || value.trim().length === 0) {
				return 'Source path is required'
			}
			return undefined
		}
	})
}

async function resolveTargetPath(
	cliValue: string | undefined,
	isInteractive: boolean
): Promise<string | symbol> {
	if (cliValue !== undefined && cliValue.trim().length > 0) {
		return cliValue
	}

	if (!isInteractive) {
		return defaultOptions.targetPath
	}

	return p.text({
		message: 'Path to the directory where imports should be migrated',
		placeholder: defaultOptions.targetPath,
		defaultValue: defaultOptions.targetPath
	})
}

async function resolveIncludeExtension(
	cliValue: boolean | undefined,
	isInteractive: boolean
): Promise<boolean | symbol> {
	if (cliValue !== undefined) {
		return cliValue
	}

	if (!isInteractive) {
		return NON_INTERACTIVE_INCLUDE_EXTENSION
	}

	return p.confirm({
		message:
			'Include js|jsx|ts|tsx|mjs|cjs file extensions in import statements?',
		initialValue: true
	})
}

function resolveIgnoreSourceFiles(
	cliValue: Array<string> | undefined
): Array<string> {
	return cliValue ?? defaultOptions.ignoreSourceFiles
}

function resolveIgnoreTargetFiles(
	cliValue: Array<string> | undefined
): Array<string> {
	return cliValue ?? defaultOptions.ignoreTargetFiles
}

async function resolveDryRun(
	cliValue: boolean | undefined,
	isInteractive: boolean
): Promise<boolean | symbol> {
	if (cliValue !== undefined) {
		return cliValue
	}

	if (!isInteractive) {
		return NON_INTERACTIVE_DRY_RUN
	}

	return p.confirm({
		message: 'Run in dry-run mode (preview changes without modifying files)?',
		initialValue: false
	})
}

/**
 * Runs the migration in `--json` mode: no prompts, no human-readable output,
 * and a single JSON report on stdout for CI to parse.
 */
async function runJson(args: CliArgs): Promise<void> {
	if (args.sourcePath === undefined || args.sourcePath.trim().length === 0) {
		console.error('--json requires source-path to be given as an argument')
		process.exitCode = 1
		return
	}

	let result: MigrationResult
	try {
		result = await migrateBarrelImports({
			sourcePath: args.sourcePath,
			targetPath: args.targetPath ?? defaultOptions.targetPath,
			targetGlob: args.targetGlob,
			ignoreSourceFiles: resolveIgnoreSourceFiles(args.ignoreSourceFiles),
			ignoreTargetFiles: resolveIgnoreTargetFiles(args.ignoreTargetFiles),
			includeExtension:
				args.includeExtension ?? NON_INTERACTIVE_INCLUDE_EXTENSION,
			includeBarrels: args.includeBarrels ?? defaultOptions.includeBarrels,
			dryRun: args.dryRun ?? NON_INTERACTIVE_DRY_RUN,
			json: true
		})
	} catch {
		// migrateBarrelImports already reported the failure through its logger
		process.exitCode = 1
		return
	}

	console.log(JSON.stringify(result))
}

export interface MainOptions {
	/** Whether prompts may be shown. Defaults to whether stdin is a TTY. */
	isInteractive?: boolean
}

export async function main(
	argv: ReadonlyArray<string> = process.argv.slice(2),
	{ isInteractive = process.stdin.isTTY }: MainOptions = {}
): Promise<void> {
	const args = parseCliArgs(argv)

	if (args.json === true) {
		await runJson(args)
		return
	}

	const verbosity = args.verbosity ?? defaultOptions.verbosity
	const isQuiet = verbosity === 'quiet'

	if (!isQuiet) {
		p.intro('migrate-barrel-imports')
		p.log.info(
			'Migrate barrel files imports to direct imports in JavaScript/TypeScript monorepos'
		)
	}

	const sourcePath = await resolveSourcePath(args.sourcePath, isInteractive)
	if (p.isCancel(sourcePath)) {
		p.cancel('Migration cancelled')
		return
	}

	if (sourcePath === undefined) {
		p.log.error(
			'source-path is required when stdin is not a TTY. Pass it as the first argument, e.g. migrate-barrel-imports packages .'
		)
		process.exitCode = 1
		return
	}

	const targetPath = await resolveTargetPath(args.targetPath, isInteractive)
	if (p.isCancel(targetPath)) {
		p.cancel('Migration cancelled')
		return
	}

	const includeExtension = await resolveIncludeExtension(
		args.includeExtension,
		isInteractive
	)
	if (p.isCancel(includeExtension)) {
		p.cancel('Migration cancelled')
		return
	}

	const dryRun = await resolveDryRun(args.dryRun, isInteractive)
	if (p.isCancel(dryRun)) {
		p.cancel('Migration cancelled')
		return
	}

	try {
		await migrateBarrelImports({
			sourcePath,
			targetPath,
			targetGlob: args.targetGlob,
			ignoreSourceFiles: resolveIgnoreSourceFiles(args.ignoreSourceFiles),
			ignoreTargetFiles: resolveIgnoreTargetFiles(args.ignoreTargetFiles),
			includeExtension,
			includeBarrels: args.includeBarrels ?? defaultOptions.includeBarrels,
			dryRun,
			verbosity
		})
	} catch {
		// migrateBarrelImports already reported the failure through its logger
		process.exitCode = 1
		return
	}

	if (!isQuiet) {
		p.outro('Done')
	}
}
