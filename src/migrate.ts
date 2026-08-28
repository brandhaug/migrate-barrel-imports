import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import fg from 'fast-glob'
import { isBarrelFile } from './barrel.js'
import { findExports } from './find-exports.js'
import { findImports } from './find-imports.js'
import { updateImports } from './update-imports.js'
import { createLogger, type Logger } from './logger.js'
import { type Options as MigrationOptions } from './options.js'
import {
	type MigrationResult,
	type MigrationStats,
	type ParseError,
	defaultLogger,
	recordParseError
} from './types.js'

/**
 * Main migration function that orchestrates the barrel file migration process
 *
 * Process flow:
 * 1. Finds all source packages matching the glob pattern
 * 2. For each package:
 *    - Reads package.json to get package name and configuration
 *    - Scans source package for all exports (named and default)
 *    - Finds all files in the monorepo that import from the package
 *    - Updates each import to point directly to source files
 *
 * @param {Options} options - Migration configuration options
 * @returns {Promise<MigrationStats>} Statistics for the whole migration run
 */
export async function migrateBarrelImports(
	options: MigrationOptions,
	// `json` overrides verbosity: the report is the only thing allowed on stdout
	logger: Logger = createLogger({
		verbosity:
			options.json === true ? 'silent' : (options.verbosity ?? 'normal')
	})
): Promise<MigrationResult> {
	const {
		sourcePath,
		targetPath,
		targetGlob,
		ignoreSourceFiles,
		ignoreTargetFiles,
		includeExtension = true,
		includeBarrels = false,
		dryRun = false
	} = options

	// Track migration statistics
	const stats: MigrationStats = {
		sourcePackagesFound: 0,
		sourcePackagesProcessed: 0,
		sourcePackagesSkipped: 0,
		sourceFilesFound: 0,
		sourceFilesWithExports: 0,
		sourceFilesSkipped: 0,
		exportsFound: 0,
		targetFilesFound: 0,
		targetFilesProcessed: 0,
		importsUpdated: 0,
		noChangesNeeded: 0,
		targetFilesSkipped: 0,
		targetFilesFailed: 0,
		importsMigrated: 0
	}

	// Target files are counted once per run, not once per source package
	const candidateFiles = new Set<string>()
	const skippedFiles = new Set<string>()
	const examinedFiles = new Set<string>()
	const failedFiles = new Set<string>()
	const updatedFiles = new Set<string>()

	// Track warnings
	const warnings: Array<string> = []

	// Track files that could not be parsed
	const parseErrors: Array<ParseError> = []

	if (dryRun) {
		logger.info('[dry-run] Running in dry-run mode, no files will be modified')
	}

	try {
		// Find source packages
		const sourcePackages = await findSourcePackages(sourcePath, logger)
		stats.sourcePackagesFound = sourcePackages.length

		for (const packagePath of sourcePackages) {
			logger.verbose(`\nProcessing package: ${packagePath}`)

			// Read the package name first, so an unreadable or unnamed package.json
			// only skips this package instead of aborting the whole migration
			const packageJsonPath = path.join(packagePath, 'package.json')
			let packageName: string | null
			try {
				packageName = await getPackageName(packagePath)
			} catch (error) {
				recordParseError({
					filePath: packageJsonPath,
					error,
					parseErrors,
					logger
				})
				stats.sourcePackagesSkipped++
				continue
			}
			if (packageName === null) {
				logger.warn(`Skipping package without a readable name: ${packagePath}`)
				stats.sourcePackagesSkipped++
				continue
			}

			// Find exports in source package
			const exports = await findExports({
				packagePath,
				logger,
				ignoreSourceFiles,
				stats,
				parseErrors
			})
			// Ignored files keep their barrel import, so their exports are not migrated
			const migratableExports = exports.filter((info) => !info.isIgnored)
			stats.exportsFound += migratableExports.reduce(
				(total, info) => total + info.exports.length,
				0
			)
			stats.sourceFilesWithExports += migratableExports.length

			// Find files that import from this package
			const targetFiles = await findImports({
				packageName,
				targetPath,
				targetGlob,
				logger,
				ignoreTargetFiles,
				// Only self-imports inside this package are excluded; files in
				// other source packages are legitimate rewrite targets
				excludedPackagePaths: [packagePath],
				parseErrors
			})
			targetFiles.files.forEach((filePath) => candidateFiles.add(filePath))
			targetFiles.skipped.forEach((filePath) => skippedFiles.add(filePath))

			// Update imports in target files
			for (const filePath of targetFiles.files) {
				// Rewriting a barrel's own re-exports changes what its package
				// exposes, so barrels are left alone unless explicitly opted in
				if (
					!includeBarrels &&
					(await isBarrelFile({ filePath, logger }, parseErrors))
				) {
					logger.verbose(
						`Skipping barrel file (use --include-barrels to rewrite it): ${filePath}`
					)
					candidateFiles.delete(filePath)
					skippedFiles.add(filePath)
					continue
				}

				const result = await updateImports({
					filePath,
					packageName,
					exports,
					logger,
					includeExtension,
					dryRun,
					warnings,
					parseErrors
				})
				stats.importsMigrated += result.importsMigrated

				if (result.status === 'failed') {
					failedFiles.add(filePath)
					continue
				}

				examinedFiles.add(filePath)
				if (result.status === 'updated') {
					updatedFiles.add(filePath)
				}
			}

			stats.sourcePackagesProcessed++
		}

		// Surface every unparseable file as a warning
		for (const { filePath, message } of parseErrors) {
			warnings.push(`Skipped ${filePath}: failed to parse: ${message}`)
		}

		// Derive the target file counters so they cannot contradict each other.
		// Skipped candidates (by ignore pattern or barrel detection) are removed
		// from the found count, so found = processed + failed.
		stats.targetFilesFound = candidateFiles.size
		stats.targetFilesSkipped = skippedFiles.size
		stats.targetFilesProcessed = examinedFiles.size
		stats.importsUpdated = updatedFiles.size
		stats.noChangesNeeded = examinedFiles.size - updatedFiles.size
		stats.targetFilesFailed = failedFiles.size

		// Print migration summary
		logger.summary('\nMigration Summary')
		if (dryRun) {
			logger.summary('Mode: dry-run (no files were modified)')
		}
		logger.summary(`Source packages found: ${stats.sourcePackagesFound}`)
		logger.summary(
			`Source packages processed: ${stats.sourcePackagesProcessed}`
		)
		logger.summary(`Source packages skipped: ${stats.sourcePackagesSkipped}`)
		logger.summary(`Source files found: ${stats.sourceFilesFound}`)
		logger.summary(`Source files with exports: ${stats.sourceFilesWithExports}`)
		logger.summary(`Source files skipped: ${stats.sourceFilesSkipped}`)
		logger.summary(`Exports found: ${stats.exportsFound}`)
		logger.summary(`Target files found: ${stats.targetFilesFound}`)
		logger.summary(`Target files processed: ${stats.targetFilesProcessed}`)
		logger.summary(`Target files with imports updated: ${stats.importsUpdated}`)
		logger.summary(
			`Target files with no changes needed: ${stats.noChangesNeeded}`
		)
		logger.summary(`Target files skipped: ${stats.targetFilesSkipped}`)
		logger.summary(`Target files failed: ${stats.targetFilesFailed}`)
		logger.summary(`Total imports migrated: ${stats.importsMigrated}`)
		logger.summary(`Files that could not be parsed: ${parseErrors.length}`)

		if (parseErrors.length > 0) {
			logger.summary('Unparseable files:')
			parseErrors.forEach(({ filePath, message }) =>
				logger.summary(`  - ${filePath}: ${message}`)
			)
		}

		if (warnings.length > 0) {
			logger.warn('\nWarnings:')
			warnings.forEach((warning) => logger.warn(`  - ${warning}`))
		}

		return {
			mode: dryRun ? 'dry-run' : 'apply',
			stats,
			warnings,
			parseErrors,
			changedFiles: [...updatedFiles].toSorted(),
			skippedFiles: [...skippedFiles].toSorted()
		}
	} catch (error) {
		logger.error(
			`Error during migration: ${
				error instanceof Error ? error.message : String(error)
			}`
		)
		throw error
	}
}

/**
 * Gets the package name from package.json
 *
 * @param {string} packagePath - Path to the package directory
 * @returns {Promise<string | null>} Package name, or null when it has none
 */
async function getPackageName(packagePath: string): Promise<string | null> {
	const packageJsonPath = path.join(packagePath, 'package.json')
	const manifest: { name?: unknown } = JSON.parse(
		await readFile(packageJsonPath, 'utf8')
	)
	return typeof manifest.name === 'string' && manifest.name.length > 0
		? manifest.name
		: null
}

/**
 * Finds all source packages in the given path
 *
 * @param {string} sourcePath - Path to search for source packages
 * @returns {Promise<string[]>} Array of package paths
 */
async function findSourcePackages(
	sourcePath: string,
	logger: Logger = defaultLogger
): Promise<Array<string>> {
	// Use a local variable instead of reassigning the parameter
	const resolvedPath = path.isAbsolute(sourcePath)
		? path.resolve(sourcePath)
		: path.join(process.cwd(), sourcePath)

	logger.verbose(`Looking for source packages in: ${resolvedPath}`)

	await assertSourceDirectory(sourcePath, resolvedPath)

	const packageJsonFiles = await fg('{package.json,**/package.json}', {
		cwd: resolvedPath,
		ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
		absolute: true
	})

	if (packageJsonFiles.length === 0) {
		throw new Error(
			`No package.json files found in: ${resolvedPath}. source-path must be a directory containing packages; it is searched recursively, ignoring node_modules, dist and build (given: ${sourcePath}).`
		)
	}

	logger.verbose(`Found ${packageJsonFiles.length} package.json files:`)
	packageJsonFiles.forEach((file) => logger.verbose(`  - ${file}`))

	return packageJsonFiles.map((file) => path.dirname(file))
}

/**
 * Ensures the source path points at an existing directory.
 *
 * `source-path` is a directory that is scanned recursively for `package.json`
 * files, not a glob, so a pattern such as `packages/*` resolves to nothing.
 *
 * @param {string} sourcePath - Source path as given by the caller
 * @param {string} resolvedPath - Absolute source path
 * @returns {Promise<void>}
 */
async function assertSourceDirectory(
	sourcePath: string,
	resolvedPath: string
): Promise<void> {
	const stats = await stat(resolvedPath).catch(() => undefined)

	if (stats === undefined) {
		throw new Error(
			`Source path does not exist: ${resolvedPath}. source-path must be a directory containing packages, not a glob pattern (given: ${sourcePath}).`
		)
	}

	if (!stats.isDirectory()) {
		throw new Error(
			`Source path is not a directory: ${resolvedPath}. source-path must be a directory containing packages (given: ${sourcePath}).`
		)
	}
}
