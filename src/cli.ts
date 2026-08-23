import { parseArgs } from 'node:util'
import * as p from '@clack/prompts'
import { migrateBarrelImports } from './migrate-barrel-imports.js'
import { defaultOptions } from './options.js'
import type { Options } from './options.js'

export type CliArgs = Partial<Omit<Options, 'targetPath'>> & {
	targetPath?: string
}

/**
 * Parses command-line arguments into partial migration options.
 *
 * Supports two positionals (`source-path` and optional `target-path`) plus flags:
 * `--extension` / `--no-extension`, `--ignore-source-files <patterns>`,
 * `--ignore-target-files <patterns>`, `--dry-run`.
 */
export function parseCliArgs(argv: readonly string[]): CliArgs {
	const { args: withoutNegation, noExtension } = extractNoExtension(argv)
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
			help: { type: 'boolean', short: 'h', description: 'Show this help' }
		}
	})

	if (values.help) {
		console.log(`migrate-barrel-imports [source-path] [target-path] [options]

Positionals:
  source-path              Glob pattern for packages containing barrel files (e.g. libs/*)
  target-path              Directory where imports should be migrated (default: .)

Options:
  --extension / --no-extension     Include file extensions in imports
  --ignore-source-files <patterns> Comma-separated patterns to ignore in source dirs
  --ignore-target-files <patterns> Comma-separated patterns to ignore in target dirs
  --dry-run                        Preview changes without modifying files
  -h, --help                       Show this help`)
		process.exit(0)
	}

	return {
		sourcePath: positionals[0],
		targetPath: positionals[1],
		includeExtension: values.extension ?? (noExtension ? false : undefined),
		dryRun: values['dry-run'],
		ignoreSourceFiles: splitPatterns(values['ignore-source-files']),
		ignoreTargetFiles: splitPatterns(values['ignore-target-files'])
	}
}

function extractNoExtension(argv: readonly string[]): {
	args: string[]
	noExtension: boolean
} {
	const args = argv.filter((arg) => arg !== '--no-extension')
	return { args, noExtension: args.length !== argv.length }
}

function splitPatterns(value: string | undefined): string[] | undefined {
	if (value === undefined) {
		return undefined
	}

	return value
		.split(',')
		.map((pattern) => pattern.trim())
		.filter((pattern): pattern is string => pattern.length > 0)
}

async function resolveSourcePath(
	cliValue: string | undefined
): Promise<string | symbol> {
	if (cliValue !== undefined && cliValue.trim().length > 0) {
		return cliValue
	}

	return await p.text({
		message: 'Source path/glob for packages containing barrel files',
		placeholder: 'libs/*',
		validate: (value: string | undefined): string | Error | undefined => {
			if (value === undefined || value.trim().length === 0) {
				return 'Source path is required'
			}
			return undefined
		}
	})
}

async function resolveTargetPath(
	cliValue: string | undefined
): Promise<string | symbol> {
	if (cliValue !== undefined && cliValue.trim().length > 0) {
		return cliValue
	}

	return await p.text({
		message: 'Path to the directory where imports should be migrated',
		placeholder: defaultOptions.targetPath,
		defaultValue: defaultOptions.targetPath
	})
}

async function resolveIncludeExtension(
	cliValue: boolean | undefined
): Promise<boolean | symbol> {
	if (cliValue !== undefined) {
		return cliValue
	}

	return await p.confirm({
		message:
			'Include js|jsx|ts|tsx|mjs|cjs file extensions in import statements?',
		initialValue: true
	})
}

function resolveIgnoreSourceFiles(cliValue: string[] | undefined): string[] {
	return cliValue ?? defaultOptions.ignoreSourceFiles
}

function resolveIgnoreTargetFiles(cliValue: string[] | undefined): string[] {
	return cliValue ?? defaultOptions.ignoreTargetFiles
}

async function resolveDryRun(
	cliValue: boolean | undefined
): Promise<boolean | symbol> {
	if (cliValue !== undefined) {
		return cliValue
	}

	return await p.confirm({
		message: 'Run in dry-run mode (preview changes without modifying files)?',
		initialValue: false
	})
}

export async function main(
	argv: readonly string[] = process.argv.slice(2)
): Promise<void> {
	p.intro('migrate-barrel-imports')
	p.log.info(
		'Migrate barrel files imports to direct imports in JavaScript/TypeScript monorepos'
	)

	const args = parseCliArgs(argv)

	const sourcePath = await resolveSourcePath(args.sourcePath)
	if (p.isCancel(sourcePath)) {
		p.cancel('Migration cancelled')
		return
	}

	const targetPath = await resolveTargetPath(args.targetPath)
	if (p.isCancel(targetPath)) {
		p.cancel('Migration cancelled')
		return
	}

	const includeExtension = await resolveIncludeExtension(args.includeExtension)
	if (p.isCancel(includeExtension)) {
		p.cancel('Migration cancelled')
		return
	}

	const dryRun = await resolveDryRun(args.dryRun)
	if (p.isCancel(dryRun)) {
		p.cancel('Migration cancelled')
		return
	}

	await migrateBarrelImports({
		sourcePath,
		targetPath,
		ignoreSourceFiles: resolveIgnoreSourceFiles(args.ignoreSourceFiles),
		ignoreTargetFiles: resolveIgnoreTargetFiles(args.ignoreTargetFiles),
		includeExtension,
		dryRun
	})

	p.outro('Done')
}
