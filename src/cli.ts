import * as p from '@clack/prompts'
import { migrateBarrelImports } from './migrate-barrel-imports'
import { defaultOptions } from './options'

function splitPatterns(value: string | undefined): string[] {
	if (value === undefined) {
		return []
	}

	return value
		.split(',')
		.map((pattern) => pattern.trim())
		.filter((pattern): pattern is string => pattern.length > 0)
}

export async function main(): Promise<void> {
	p.intro('migrate-barrel-imports')
	p.log.info(
		'Migrate barrel files imports to direct imports in JavaScript/TypeScript monorepos'
	)

	const sourcePath = await p.text({
		message: 'Source path/glob for packages containing barrel files',
		placeholder: 'libs/*',
		validate: (value: string | undefined): string | Error | undefined => {
			if (value === undefined || value.trim().length === 0) {
				return 'Source path is required'
			}
			return undefined
		}
	})

	if (p.isCancel(sourcePath)) {
		p.cancel('Migration cancelled')
		return
	}

	const targetPath = await p.text({
		message: 'Path to the directory where imports should be migrated',
		placeholder: defaultOptions.targetPath,
		defaultValue: defaultOptions.targetPath
	})

	if (p.isCancel(targetPath)) {
		p.cancel('Migration cancelled')
		return
	}

	const includeExtension = await p.confirm({
		message:
			'Include js|jsx|ts|tsx|mjs|cjs file extensions in import statements?',
		initialValue: true
	})

	if (p.isCancel(includeExtension)) {
		p.cancel('Migration cancelled')
		return
	}

	const ignoreSourceFilesInput = await p.text({
		message: 'File patterns to ignore in source directory (comma-separated)',
		placeholder: 'e.g. **/*.test.ts, **/node_modules/**'
	})

	if (p.isCancel(ignoreSourceFilesInput)) {
		p.cancel('Migration cancelled')
		return
	}

	const ignoreTargetFilesInput = await p.text({
		message: 'File patterns to ignore in target directory (comma-separated)',
		placeholder: 'e.g. **/*.spec.ts, **/dist/**'
	})

	if (p.isCancel(ignoreTargetFilesInput)) {
		p.cancel('Migration cancelled')
		return
	}

	const dryRun = await p.confirm({
		message: 'Run in dry-run mode (preview changes without modifying files)?',
		initialValue: false
	})

	if (p.isCancel(dryRun)) {
		p.cancel('Migration cancelled')
		return
	}

	await migrateBarrelImports({
		sourcePath,
		targetPath,
		ignoreSourceFiles:
			splitPatterns(ignoreSourceFilesInput).length > 0
				? splitPatterns(ignoreSourceFilesInput)
				: defaultOptions.ignoreSourceFiles,
		ignoreTargetFiles:
			splitPatterns(ignoreTargetFilesInput).length > 0
				? splitPatterns(ignoreTargetFilesInput)
				: defaultOptions.ignoreTargetFiles,
		includeExtension,
		dryRun
	})

	p.outro('Done')
}
