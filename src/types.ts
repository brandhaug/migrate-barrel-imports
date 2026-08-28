import { type ImportSpecifier } from '@babel/types'
import { createLogger, type Logger } from './logger.js'

/**
 * @property {string} source - Source file path containing exports
 * @property {string[]} exports - Array of exported names from the file
 * @property {boolean} [isIgnored] - Whether the file is ignored
 * @property {Record<string, string>} [reExports] - Map of export names to their original source package
 * @property {Record<string, string>} [exportSources] - Map of export names to their source files
 * @property {string[]} [defaultExportNames] - Names of entities exported as default
 * @property {boolean} [isBarrelFile] - Whether this file is a barrel file
 * @property {Record<string, string[]>} [exportFiles] - Map of export names to all files that export them
 */
export interface ExportInfo {
	source: string
	exports: Array<string>
	isIgnored?: boolean
	reExports?: Record<string, string>
	exportSources?: Record<string, string>
	defaultExportNames?: Array<string>
	isBarrelFile?: boolean
	exportFiles?: Record<string, Array<string>>
}

/**
 * Counters for a single migration run
 *
 * Semantics: `*Found` counts candidates discovered, `*Processed` counts
 * candidates actually examined, and `*Skipped` counts candidates excluded
 * before examination. Target file counters count distinct files across the
 * whole run, so a file importing from several source packages counts once.
 *
 * Invariants:
 * - sourcePackagesFound = sourcePackagesProcessed + sourcePackagesSkipped
 * - targetFilesFound = targetFilesProcessed + targetFilesFailed
 * - targetFilesProcessed = importsUpdated + noChangesNeeded
 */
export interface MigrationStats {
	sourcePackagesFound: number
	sourcePackagesProcessed: number
	sourcePackagesSkipped: number
	sourceFilesFound: number
	sourceFilesWithExports: number
	sourceFilesSkipped: number
	exportsFound: number
	targetFilesFound: number
	targetFilesProcessed: number
	importsUpdated: number
	noChangesNeeded: number
	targetFilesSkipped: number
	targetFilesFailed: number
	importsMigrated: number
}

/**
 * @property {string} filePath - Path to the file to check
 * @property {string} [packagePath] - Path to the package the file belongs to,
 *   used to recognise the package's declared entry points
 */
export interface IsBarrelFileParams {
	filePath: string
	packagePath?: string
	logger?: Logger
}

export interface FindExportsParams {
	packagePath: string
	logger?: Logger
	ignoreSourceFiles?: Array<string>
	stats?: MigrationStats
	parseErrors?: Array<ParseError>
}

export interface FindImportsParams {
	packageName: string
	targetPath: string
	targetGlob?: string
	logger?: Logger
	ignoreTargetFiles?: Array<string>
	excludedPackagePaths?: Array<string>
	stats?: MigrationStats
	parseErrors?: Array<ParseError>
	skippedFiles?: Array<string>
}

/**
 * A file that could not be parsed during the migration
 *
 * @property {string} filePath - Absolute path to the file that failed to parse
 * @property {string} message - The parser error message
 */
export interface ParseError {
	filePath: string
	message: string
}

/**
 * The outcome of a migration run
 *
 * @property {'apply' | 'dry-run'} mode - Whether files were written or only previewed
 * @property {MigrationStats} stats - Counters collected during the run
 * @property {string[]} warnings - Non-fatal problems, including every parse failure with its file path
 * @property {ParseError[]} parseErrors - Files that could not be parsed, with the parser message
 * @property {string[]} changedFiles - Target files whose imports were rewritten (or would be, in dry-run)
 * @property {string[]} skippedFiles - Target files left untouched, by ignore pattern or barrel detection
 */
export interface MigrationResult {
	mode: 'apply' | 'dry-run'
	stats: MigrationStats
	warnings: Array<string>
	parseErrors: Array<ParseError>
	changedFiles: Array<string>
	skippedFiles: Array<string>
}

/**
 * Target files that import from a package, split by whether they are ignored
 *
 * @property {string[]} files - Candidate files to migrate
 * @property {string[]} skipped - Candidate files excluded by ignore patterns
 */
export interface FindImportsResult {
	files: Array<string>
	skipped: Array<string>
}

export interface ImportSpec {
	local: ImportSpecifier['local']
	imported: ImportSpecifier['imported']
}

export interface UpdateImportsParams {
	filePath: string
	packageName: string
	exports: Array<ExportInfo>
	logger?: Logger
	includeExtension?: boolean
	dryRun?: boolean
	warnings?: Array<string>
	stats?: MigrationStats
	parseErrors?: Array<ParseError>
}

/**
 * Outcome of examining a single target file
 *
 * @property {'updated' | 'unchanged' | 'failed'} status - What happened to the file
 * @property {number} importsMigrated - Number of import specifiers rewritten
 */
export interface UpdateImportsResult {
	status: 'updated' | 'unchanged' | 'failed'
	importsMigrated: number
}

/**
 * Result of resolving an imported or re-exported name to a direct source path
 *
 * - `move`: the name resolves to `sourcePath` and should be rewritten
 * - `keep`: the name should stay pointing at the barrel package
 * - `drop`: the name is not exported by the package
 * - `unresolved`: the name is exported but no source file could be determined
 */
export type ResolvedTarget =
	| { kind: 'move'; sourcePath: string; dedupeAliased: boolean }
	| { kind: 'keep' }
	| { kind: 'drop' }
	| { kind: 'unresolved' }

export interface ResolveTargetParams {
	name: string
	exports: Array<ExportInfo>
	packageName: string
	includeExtension: boolean
}

export interface ResolveExportSourceParams {
	name: string
	exports: Array<ExportInfo>
}

/** Logger used when a caller does not supply one. */
export const defaultLogger: Logger = createLogger({ verbosity: 'normal' })

/**
 * True when a module source names the package itself or a subpath of it.
 *
 * A bare prefix match would also match sibling packages (`@scope/foo2`,
 * `@scope/foo-bar`), so the boundary check requires either an exact match or a
 * `/` after the package name.
 */
export function isPackageImport(source: string, packageName: string): boolean {
	return source === packageName || source.startsWith(`${packageName}/`)
}

/**
 * Records a file that could not be parsed so the migration can skip it and carry on
 */
export function recordParseError({
	filePath,
	error,
	parseErrors,
	logger = defaultLogger
}: {
	filePath: string
	error: unknown
	parseErrors?: Array<ParseError>
	logger?: Logger
}): void {
	const message = error instanceof Error ? error.message : String(error)
	logger.warn(`Skipping ${filePath}: failed to parse: ${message}`)

	if (parseErrors?.some((parseError) => parseError.filePath === filePath)) {
		return
	}

	parseErrors?.push({ filePath, message })
}
