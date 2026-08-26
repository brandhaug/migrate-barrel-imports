/**
 * @fileoverview Tool for migrating TypeScript projects from barrel file exports to direct file imports
 *
 * This tool helps migrate TypeScript projects that use barrel files (index.ts files that re-export)
 * to use direct imports from source files instead. This improves:
 * - Tree-shaking efficiency
 * - Build performance
 * - Code maintainability
 * - TypeScript compilation speed
 *
 * The migration process:
 * 1. Scans source package for all exports
 * 2. Finds all files importing from the package
 * 3. Updates imports to point directly to source files
 * 4. Preserves original import names and types
 */

import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import _generate from '@babel/generator'
import { parse } from '@babel/parser'
import type { NodePath } from '@babel/traverse'
import _traverse from '@babel/traverse'
import {
	type ExportDefaultDeclaration,
	type ExportNamedDeclaration,
	exportNamedDeclaration,
	type ExportSpecifier,
	type ImportDeclaration,
	type ImportDefaultSpecifier,
	type ImportNamespaceSpecifier,
	type ImportSpecifier,
	importDeclaration,
	importSpecifier,
	isClassDeclaration,
	isExportAllDeclaration,
	isExportNamedDeclaration,
	isExportSpecifier,
	isFunctionDeclaration,
	isIdentifier,
	isImportDeclaration,
	isImportSpecifier,
	isTSEnumDeclaration,
	isTSInterfaceDeclaration,
	isTSTypeAliasDeclaration,
	isVariableDeclaration,
	stringLiteral,
	type VariableDeclarator
} from '@babel/types'
import fg from 'fast-glob'
import micromatch from 'micromatch'
import { getBabelConfig } from './babel-config.js'
import { formatImportDiff } from './import-diff.js'
import { createLogger, type Logger } from './logger.js'
import type { Options as MigrationOptions } from './options.js'

// @ts-expect-error
const generate: typeof _generate = _generate.default || _generate
// @ts-expect-error
const traverse: typeof _traverse = _traverse.default || _traverse

/**
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
	exports: string[]
	isIgnored?: boolean
	reExports?: Record<string, string>
	exportSources?: Record<string, string>
	defaultExportNames?: string[]
	isBarrelFile?: boolean
	exportFiles?: Record<string, string[]>
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

interface FindExportsParams {
	packagePath: string
	logger?: Logger
	ignoreSourceFiles?: string[]
	stats?: MigrationStats
	parseErrors?: ParseError[]
}

interface FindImportsParams {
	packageName: string
	targetPath: string
	targetGlob?: string
	logger?: Logger
	ignoreTargetFiles?: string[]
	excludedPackagePaths?: string[]
	stats?: MigrationStats
	parseErrors?: ParseError[]
	skippedFiles?: string[]
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
	warnings: string[]
	parseErrors: ParseError[]
	changedFiles: string[]
	skippedFiles: string[]
}

/**
 * Target files that import from a package, split by whether they are ignored
 *
 * @property {string[]} files - Candidate files to migrate
 * @property {string[]} skipped - Candidate files excluded by ignore patterns
 */
interface FindImportsResult {
	files: string[]
	skipped: string[]
}

interface ImportSpec {
	local: ImportSpecifier['local']
	imported: ImportSpecifier['imported']
}

interface UpdateImportsParams {
	filePath: string
	packageName: string
	exports: ExportInfo[]
	logger?: Logger
	includeExtension?: boolean
	dryRun?: boolean
	warnings?: string[]
	stats?: MigrationStats
	parseErrors?: ParseError[]
	changedFiles?: string[]
}

/** Logger used when a caller does not supply one. */
const defaultLogger: Logger = createLogger({ verbosity: 'normal' })

/** Renders an unknown thrown value as a log-friendly string. */
function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

/**
 * Records a file that could not be parsed so the migration can skip it and carry on
 */
function recordParseError({
	filePath,
	error,
	parseErrors,
	logger = defaultLogger
}: {
	filePath: string
	error: unknown
	parseErrors?: ParseError[]
	logger?: Logger
}): void {
	const message = error instanceof Error ? error.message : String(error)
	logger.warn(`Skipping ${filePath}: failed to parse: ${message}`)

	if (parseErrors?.some((parseError) => parseError.filePath === filePath)) {
		return
	}

	parseErrors?.push({ filePath, message })
}

/**
 * Outcome of examining a single target file
 *
 * @property {'updated' | 'unchanged' | 'failed'} status - What happened to the file
 * @property {number} importsMigrated - Number of import specifiers rewritten
 */
interface UpdateImportsResult {
	status: 'updated' | 'unchanged' | 'failed'
	importsMigrated: number
}

/**
 * Extracts export names from a declaration node
 */
function getExportNames(
	declaration: ExportNamedDeclaration['declaration']
): string[] {
	if (!declaration) return []

	if (isVariableDeclaration(declaration)) {
		return declaration.declarations
			.map((d: VariableDeclarator) => (isIdentifier(d.id) ? d.id.name : null))
			.filter((name: string | null): name is string => name !== null)
	}

	if (isFunctionDeclaration(declaration) && declaration.id) {
		return [declaration.id.name]
	}

	if (isTSEnumDeclaration(declaration)) {
		return [declaration.id.name]
	}

	if (isTSInterfaceDeclaration(declaration)) {
		return [declaration.id.name]
	}

	if (isTSTypeAliasDeclaration(declaration)) {
		return [declaration.id.name]
	}

	if (isClassDeclaration(declaration) && declaration.id) {
		return [declaration.id.name]
	}

	return []
}

// Share of non-import statements that must be re-exports for a non-entry-point
// file to count as a barrel
const PURE_RE_EXPORT_RATIO = 0.9

const ENTRY_POINT_FILE_NAME_PATTERN =
	/^index\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/

/**
 * Collects the entry-point file paths a package declares via main, module and exports
 */
async function getPackageEntryPoints(packagePath: string): Promise<string[]> {
	try {
		const manifest: Record<string, unknown> = JSON.parse(
			await readFile(path.join(packagePath, 'package.json'), 'utf-8')
		)

		const entries: string[] = []
		const collect = (value: unknown): void => {
			if (typeof value === 'string') {
				entries.push(path.resolve(packagePath, value))
				return
			}
			if (typeof value === 'object' && value !== null) {
				Object.values(value).forEach(collect)
			}
		}

		;[manifest.main, manifest.module, manifest.exports].forEach(collect)

		return entries
	} catch {
		return []
	}
}

/**
 * Checks whether a file is named like a module entry point (index.*)
 */
function isEntryPointFileName(filePath: string): boolean {
	return ENTRY_POINT_FILE_NAME_PATTERN.test(path.basename(filePath))
}

/**
 * Checks if a file is a barrel file by analyzing its exports
 *
 * @param {IsBarrelFileParams} params - Parameters for the check
 * @returns {Promise<boolean>} Whether the file is a barrel file
 */
export async function isBarrelFile(
	{ filePath, packagePath, logger = defaultLogger }: IsBarrelFileParams,
	parseErrors?: ParseError[]
): Promise<boolean> {
	try {
		const content = await readFile(filePath, 'utf-8')
		const ast = parse(content, getBabelConfig(filePath))

		let reExportCount = 0
		let otherStatementCount = 0

		for (const statement of ast.program.body) {
			if (isImportDeclaration(statement)) continue

			if (
				isExportAllDeclaration(statement) ||
				(isExportNamedDeclaration(statement) && statement.source)
			) {
				reExportCount++
				continue
			}

			otherStatementCount++
		}

		if (reExportCount === 0) return false

		// Entry-point files re-exporting anything are barrels regardless of content
		if (isEntryPointFileName(filePath)) return true

		if (packagePath) {
			const entryPoints = await getPackageEntryPoints(packagePath)
			const resolvedPath = path.resolve(filePath)
			if (entryPoints.includes(resolvedPath)) return true
		}

		// Otherwise substantially all statements must be pure re-exports
		const total = reExportCount + otherStatementCount
		return reExportCount / total >= PURE_RE_EXPORT_RATIO
	} catch (error) {
		recordParseError({ filePath, error, parseErrors, logger })
		return false
	}
}

const AUXILIARY_FILE_MARKERS = [
	'.stories.',
	'.test.',
	'.spec.',
	'.stories/',
	'.test/',
	'.spec/'
]

interface ResolveExportSourceParams {
	name: string
	exports: ExportInfo[]
}

/**
 * Resolves the single canonical source module for an exported name
 *
 * A name can be reachable through several files: the module defining it, and any
 * barrel re-exporting it. Candidates are ranked deterministically:
 * 1. Auxiliary files (stories, tests, specs) are dropped when anything else exists
 * 2. Modules defining the name win over barrels re-exporting it
 * 3. The last remaining candidate in lexicographic order wins, so the result
 *    does not depend on the order files were scanned in
 *
 * @param {ResolveExportSourceParams} params - Export name and collected exports
 * @returns {string | undefined} Canonical source file, or undefined if unknown
 */
export function resolveExportSource({
	name,
	exports
}: ResolveExportSourceParams): string | undefined {
	const candidates: string[] = []
	const barrelSources = new Set<string>()

	for (const info of exports) {
		if (info.isBarrelFile) {
			barrelSources.add(info.source)
		}
		for (const file of info.exportFiles?.[name] ?? []) {
			if (!candidates.includes(file)) {
				candidates.push(file)
			}
		}
		if (info.exports.includes(name) && !candidates.includes(info.source)) {
			candidates.push(info.source)
		}
	}

	if (candidates.length === 0) return undefined

	const mainFiles = candidates.filter(
		(file) => !AUXILIARY_FILE_MARKERS.some((marker) => file.includes(marker))
	)
	const ranked = mainFiles.length > 0 ? mainFiles : candidates
	const direct = ranked.filter((file) => !barrelSources.has(file))
	const preferred = direct.length > 0 ? direct : ranked

	// Pick the last path in lexicographic order so the winner never depends on
	// the order files were scanned in
	return preferred.reduce((winner, file) => (file > winner ? file : winner))
}

/**
 * Result of resolving an imported or re-exported name to a direct source path
 *
 * - `move`: the name resolves to `sourcePath` and should be rewritten
 * - `keep`: the name should stay pointing at the barrel package
 * - `drop`: the name is not exported by the package
 * - `unresolved`: the name is exported but no source file could be determined
 */
type ResolvedTarget =
	| { kind: 'move'; sourcePath: string; dedupeAliased: boolean }
	| { kind: 'keep' }
	| { kind: 'drop' }
	| { kind: 'unresolved' }

interface ResolveTargetParams {
	name: string
	exports: ExportInfo[]
	packageName: string
	includeExtension: boolean
}

/**
 * Builds a package-qualified import path for a file inside the source package
 */
function toPackagePath(
	packageName: string,
	sourceFile: string,
	includeExtension: boolean
): string {
	return includeExtension
		? `${packageName}/${sourceFile}`
		: `${packageName}/${sourceFile.replace(/\.[^/.]+$/, '')}`
}

/**
 * Resolves a single name to the direct source path it should be imported or
 * re-exported from. Shared by `import ... from` and `export ... from` rewriting.
 *
 * @param {ResolveTargetParams} params - Name and collected package exports
 * @returns {ResolvedTarget} What should happen to the specifier
 */
function resolveTarget({
	name,
	exports,
	packageName,
	includeExtension
}: ResolveTargetParams): ResolvedTarget {
	const exportInfo = exports.find((e) => e.exports.includes(name))
	if (!exportInfo) return { kind: 'drop' }
	if (exportInfo.isIgnored) return { kind: 'keep' }

	// Re-exports from an external package keep pointing at that package
	const reExportSource = exportInfo.reExports?.[name]
	if (reExportSource && !reExportSource.startsWith('.')) {
		return { kind: 'move', sourcePath: reExportSource, dedupeAliased: false }
	}

	// Direct exports declared in the package entry point
	if (exportInfo.source === 'src/index.ts' && !reExportSource) {
		if (exportInfo.defaultExportNames?.includes(name)) {
			return { kind: 'move', sourcePath: packageName, dedupeAliased: false }
		}

		if (name !== 'default') {
			return {
				kind: 'move',
				sourcePath: toPackagePath(
					packageName,
					exportInfo.source,
					includeExtension
				),
				dedupeAliased: false
			}
		}
	}

	// Resolve the single canonical source file for this export
	const bestSourceFile = resolveExportSource({ name, exports })
	if (bestSourceFile) {
		return {
			kind: 'move',
			sourcePath: toPackagePath(packageName, bestSourceFile, includeExtension),
			dedupeAliased: true
		}
	}

	return { kind: 'unresolved' }
}

/**
 * Records that a file exports a name, keeping each file listed at most once
 *
 * @param {Record<string, string[]>} exportFiles - Map of export names to files
 * @param {string} name - Exported name
 * @param {string} file - File exporting the name
 */
function recordExportFile(
	exportFiles: Record<string, string[]>,
	name: string,
	file: string
): void {
	const files = exportFiles[name] ?? (exportFiles[name] = [])
	if (!files.includes(file)) {
		files.push(file)
		exportFiles[name] = files.toSorted()
	}
}

/**
 * Recursively finds all exports in a package by scanning all TypeScript files
 *
 * This function:
 * 1. Scans all .ts and .tsx files in the package
 * 2. Identifies both named exports and default exports
 * 3. Skips re-exports to avoid circular dependencies
 * 4. Filters out ignored files based on patterns
 * 5. Handles barrel files by tracking their re-exports
 *
 * @param {FindExportsParams} params - Parameters for finding exports
 * @returns {Promise<ExportInfo[]>} Array of export information, including source file and exported names
 */
export async function findExports({
	packagePath,
	logger = defaultLogger,
	ignoreSourceFiles = [],
	stats,
	parseErrors
}: FindExportsParams): Promise<ExportInfo[]> {
	const exports: ExportInfo[] = []
	const barrelFiles = new Set<string>()
	const exportFiles: Record<string, string[]> = {}

	logger.verbose(
		`Scanning for TypeScript and JavaScript files in: ${packagePath}`
	)
	const allFiles = await fg('**/*.{ts,tsx,js,jsx}', {
		cwd: packagePath,
		ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
	})
	logger.verbose(`Found ${allFiles.length} files`)

	if (stats) {
		stats.sourceFilesFound += allFiles.length
	}

	// First pass: identify barrel files
	for (const file of allFiles) {
		const fullPath = path.join(packagePath, file)
		if (
			await isBarrelFile(
				{ filePath: fullPath, packagePath, logger },
				parseErrors
			)
		) {
			barrelFiles.add(file)
			logger.verbose(`Identified barrel file: ${file}`)
		}
	}

	// Second pass: process all files
	for (const file of allFiles) {
		// Mark files that match ignore patterns but still process them
		const isIgnored = ignoreSourceFiles.some((pattern) =>
			micromatch.isMatch(file, pattern)
		)
		if (isIgnored) {
			logger.verbose(
				`File matches ignore pattern but will be preserved: ${file}`
			)
			if (stats) {
				stats.sourceFilesSkipped++
			}
		}

		const fullPath = path.join(packagePath, file)
		logger.verbose(`\nProcessing file: ${file}`)

		try {
			const content = await readFile(fullPath, 'utf-8')
			const ast = parse(content, getBabelConfig(fullPath))
			const fileExports: string[] = []
			const reExports: Record<string, string> = {}
			const fileExportSources: Record<string, string> = {}
			const defaultExportNames: string[] = []

			traverse(ast, {
				ExportNamedDeclaration(nodePath: NodePath<ExportNamedDeclaration>) {
					// Handle re-exports from external packages
					if (nodePath.node.source) {
						const sourceValue = nodePath.node.source.value
						if (
							sourceValue.includes('node_modules') ||
							!sourceValue.startsWith('.')
						) {
							// Extract export names and their original source
							nodePath.node.specifiers.forEach((specifier) => {
								if (isExportSpecifier(specifier)) {
									const exported = specifier.exported
									const exportName = isIdentifier(exported)
										? exported.name
										: exported.value
									reExports[exportName] = sourceValue
									fileExports.push(exportName)
									fileExportSources[exportName] = file

									// Track all files that export this symbol
									recordExportFile(exportFiles, exportName, file)
								}
							})
							return
						}
					}

					// Handle variable declarations with exports
					if (nodePath.node.declaration) {
						const exportNames = getExportNames(nodePath.node.declaration)
						if (exportNames.length > 0) {
							fileExports.push(...exportNames)
							exportNames.forEach((name) => {
								fileExportSources[name] = file

								// Track all files that export this symbol
								recordExportFile(exportFiles, name, file)
							})
						}
					}

					// Handle export specifiers
					const exportNames = nodePath.node.specifiers
						.map((s) => {
							if (isExportSpecifier(s)) {
								const exported = s.exported
								const exportName = isIdentifier(exported)
									? exported.name
									: exported.value
								if (nodePath.node.source) {
									// If it's a re-export from another file, track the source
									const sourceValue = nodePath.node.source.value
									if (sourceValue.startsWith('.')) {
										const resolvedPath = path.join(
											path.dirname(file),
											sourceValue
										)
										fileExportSources[exportName] = resolvedPath.replace(
											/\.[^/.]+$/,
											''
										)

										// Track all files that export this symbol
										recordExportFile(exportFiles, exportName, file)
									}
								}
								return exportName
							}
							return null
						})
						.filter((name: string | null): name is string => name !== null)

					if (exportNames.length > 0) {
						fileExports.push(...exportNames)
						exportNames.forEach((name) => {
							if (!fileExportSources[name]) {
								fileExportSources[name] = file
							}
						})
					}
				},
				ExportDefaultDeclaration(path: NodePath<ExportDefaultDeclaration>) {
					const exported = path.node.declaration
					const exportName = isIdentifier(exported)
						? exported.name
						: isFunctionDeclaration(exported) && exported.id
							? exported.id.name
							: isClassDeclaration(exported) && exported.id
								? exported.id.name
								: 'default'

					fileExports.push(exportName)
					fileExportSources[exportName] = file

					// If this is a named entity (class, function) being exported as default, track its name
					if (exportName !== 'default') {
						defaultExportNames.push(exportName)
					}
				}
			})

			// A name can be reached more than once in a file (for example a value
			// re-export paired with a type re-export); report it only once.
			const uniqueFileExports = Array.from(new Set(fileExports))

			if (uniqueFileExports.length > 0 || Object.keys(reExports).length > 0) {
				exports.push({
					source: file,
					exports: uniqueFileExports,
					isIgnored,
					...(Object.keys(reExports).length > 0 && { reExports }),
					...(Object.keys(fileExportSources).length > 0 && {
						exportSources: fileExportSources
					}),
					...(defaultExportNames.length > 0 && { defaultExportNames }),
					...(barrelFiles.has(file) && { isBarrelFile: true }),
					...(Object.keys(exportFiles).length > 0 && { exportFiles })
				})

				// Print exports in a single line
				if (uniqueFileExports.length > 0) {
					logger.verbose(
						`Found exports ${uniqueFileExports.join(', ')} in ${file}`
					)
				}
			}
		} catch (error) {
			recordParseError({ filePath: fullPath, error, parseErrors, logger })
		}
	}

	logger.verbose(`\nTotal exports found: ${exports.length}`)
	logger.verbose(`Barrel files found: ${barrelFiles.size}`)
	return exports
}

/**
 * Finds all files in the monorepo that import from a specific package
 *
 * This function:
 * 1. Uses fast-glob to find all TypeScript files
 * 2. Parses each file's AST to find imports
 * 3. Handles both direct package imports and subpath imports
 * 4. Excludes node_modules, dist, and build directories
 * 5. Filters out files matching ignore patterns
 *
 * @param {FindImportsParams} params - Parameters for finding imports
 * @returns {Promise<FindImportsResult>} Candidate and skipped file paths
 */
async function findImports({
	packageName,
	targetPath,
	targetGlob,
	logger = defaultLogger,
	ignoreTargetFiles = [],
	excludedPackagePaths = [],
	parseErrors
}: FindImportsParams): Promise<FindImportsResult> {
	try {
		const allFiles = new Set<string>()

		// Find all TypeScript and JavaScript files in the scanned directories
		const scanDirectories = await resolveScanDirectories(
			targetPath,
			targetGlob,
			logger
		)
		const files = (
			await Promise.all(
				scanDirectories.map((directory) =>
					fg(['**/*.{ts,tsx,js,jsx}'], {
						cwd: directory,
						absolute: true,
						ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
						followSymbolicLinks: false
					})
				)
			)
		).flat()

		const excludedPaths = excludedPackagePaths.map((p) => path.resolve(p))
		const targetFiles = files.filter(
			(file) => !isInsideAnyDirectory(file, excludedPaths)
		)

		logger.verbose(`Found ${targetFiles.length} files to scan`)

		// Scan each file for imports
		for (const file of targetFiles) {
			try {
				const content = await readFile(file, 'utf-8')
				const ast = parse(content, getBabelConfig(file))

				const matchesPackage = (source: string): boolean =>
					source === packageName || source.startsWith(`${packageName}/`)

				traverse(ast, {
					ImportDeclaration(path: NodePath<ImportDeclaration>) {
						// Check for exact package import or subpath import
						if (matchesPackage(path.node.source.value)) {
							allFiles.add(file)
						}
					},
					ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
						// `export { x } from "<package>"` is a barrel import too
						const source = path.node.source
						if (source && matchesPackage(source.value)) {
							allFiles.add(file)
						}
					}
				})
			} catch (error) {
				recordParseError({ filePath: file, error, parseErrors, logger })
			}
		}

		// Candidates that match an ignore pattern are skipped, not found
		const skipped: string[] = []
		for (const file of allFiles) {
			const relativePath = path.relative(targetPath, file)
			if (
				ignoreTargetFiles.some((pattern) =>
					micromatch.isMatch(relativePath, pattern)
				)
			) {
				console.log(`File matches ignore pattern, skipping: ${relativePath}`)
				allFiles.delete(file)
				skipped.push(file)
			}
		}

		const uniqueFiles = Array.from(allFiles)
		if (uniqueFiles.length > 0) {
			logger.verbose(
				`Found total of ${uniqueFiles.length} files with imports from ${packageName}`
			)
			logger.verbose('Files found:')
			for (const file of uniqueFiles) {
				logger.verbose(`  ${file}`)
			}
		} else {
			logger.verbose(`No files found importing from ${packageName}`)
		}

		return { files: uniqueFiles, skipped }
	} catch (error) {
		logger.error(`Error finding imports: ${formatError(error)}`)
		return { files: [], skipped: [] }
	}
}

/**
 * Resolves the directories to scan for imports
 *
 * Without a target glob the whole target path is scanned. With one, only the
 * directories matching the glob (relative to the target path) are scanned.
 */
async function resolveScanDirectories(
	targetPath: string,
	targetGlob: string | undefined,
	logger: Logger = defaultLogger
): Promise<string[]> {
	if (targetGlob === undefined || targetGlob.trim().length === 0) {
		return [targetPath]
	}

	const directories = await fg(targetGlob, {
		cwd: targetPath,
		absolute: true,
		onlyDirectories: true,
		ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
		followSymbolicLinks: false
	})

	logger.verbose(
		`Target glob "${targetGlob}" matched ${directories.length} directories`
	)

	return directories
}

/**
 * Checks whether a file lives inside any of the given directories
 *
 * The source package whose exports are being migrated is never a rewrite
 * target, so its own files (self-imports) are filtered out before scanning.
 */
function isInsideAnyDirectory(
	filePath: string,
	directories: readonly string[]
): boolean {
	const resolvedFile = path.resolve(filePath)

	return directories.some((directory) => {
		const relative = path.relative(path.resolve(directory), resolvedFile)
		return (
			relative.length > 0 &&
			!relative.startsWith('..') &&
			!path.isAbsolute(relative)
		)
	})
}

/**
 * Updates imports in a file to point directly to source files instead of using barrel files
 *
 * This function:
 * 1. Parses the file's AST to find imports from the package
 * 2. For each import, finds the source file containing the export
 * 3. Updates the import to point directly to the source file
 * 4. Preserves original import names and types
 * 5. Only modifies the file if changes are needed
 *
 * @param {UpdateImportsParams} params - Parameters for updating imports
 * @returns {Promise<UpdateImportsResult>} Outcome and number of rewritten imports
 */
async function updateImports({
	filePath,
	packageName,
	exports,
	logger = defaultLogger,
	includeExtension = true,
	dryRun = false,
	warnings,
	parseErrors,
	changedFiles
}: UpdateImportsParams): Promise<UpdateImportsResult> {
	logger.verbose(`\nProcessing file: ${filePath}`)
	let modified = false
	let importsMigrated = 0

	try {
		const content = await readFile(filePath, 'utf-8')
		const ast = parse(content, getBabelConfig(filePath))
		const importDeclarations: ImportDeclaration[] = []

		// First pass: collect all import declarations
		traverse(ast, {
			ImportDeclaration(path: NodePath<ImportDeclaration>) {
				const importSource = path.node.source.value
				if (importSource.startsWith(packageName)) {
					importDeclarations.push(path.node)
				}
			}
		})

		const importsBySource = new Map<string, ImportSpec[]>()
		const remainingSpecifiers: Array<
			ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier
		> = []

		for (const declaration of importDeclarations) {
			for (const specifier of declaration.specifiers) {
				if (!isImportSpecifier(specifier)) continue

				const imported = specifier.imported
				const importName = isIdentifier(imported)
					? imported.name
					: imported.value
				const resolved = resolveTarget({
					name: importName,
					exports,
					packageName,
					includeExtension
				})

				if (resolved.kind === 'drop') continue

				if (resolved.kind === 'keep') {
					remainingSpecifiers.push(specifier)
					continue
				}

				if (resolved.kind === 'unresolved') {
					// Could not resolve this import to a source file
					if (warnings) {
						warnings.push(
							`Could not resolve "${importName}" to a source file in ${filePath}`
						)
					}
					remainingSpecifiers.push(specifier)
					continue
				}

				if (resolved.dedupeAliased) {
					// Check if this import is aliased and if we already have the original import
					const isAliased = specifier.local.name !== importName
					const hasOriginalImport = Array.from(importsBySource.values()).some(
						(specs) =>
							specs.some(
								(spec) =>
									spec.imported &&
									isIdentifier(spec.imported) &&
									spec.imported.name === importName
							)
					)

					// Only add the import if it is not aliased or if we do not have the original import yet
					if (isAliased && hasOriginalImport) continue
				}

				if (!importsBySource.has(resolved.sourcePath)) {
					importsBySource.set(resolved.sourcePath, [])
				}
				importsBySource.get(resolved.sourcePath)?.push({
					local: specifier.local,
					imported: specifier.imported
				})
				modified = true
			}
		}

		// Second pass: update the AST with new imports
		traverse(ast, {
			ImportDeclaration(path: NodePath<ImportDeclaration>) {
				const importSource = path.node.source.value
				if (importSource.startsWith(packageName)) {
					// Remove the original import declaration
					path.remove()
				}
			}
		})

		// Add new import declarations
		const newImports: ImportDeclaration[] = []
		for (const [source, specifiers] of importsBySource) {
			if (specifiers.length > 0) {
				newImports.push(
					importDeclaration(
						specifiers.map(({ local, imported }) =>
							importSpecifier(local, imported)
						),
						stringLiteral(source)
					)
				)
				importsMigrated += specifiers.length
			}
		}

		// Add remaining specifiers if any
		if (remainingSpecifiers.length > 0) {
			newImports.push(
				importDeclaration(remainingSpecifiers, stringLiteral(packageName))
			)
		}

		// Add all new imports at the top of the file
		if (newImports.length > 0) {
			ast.program.body.unshift(...newImports)
			modified = true
		}

		// Third pass: rewrite `export ... from "<package>"` re-exports
		const reExportPaths: Array<NodePath<ExportNamedDeclaration>> = []
		traverse(ast, {
			ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
				const source = path.node.source
				if (source?.value.startsWith(packageName)) {
					reExportPaths.push(path)
				}
			}
		})

		for (const reExportPath of reExportPaths) {
			const node = reExportPath.node
			const exportsBySource = new Map<string, ExportSpecifier[]>()
			const remainingExportSpecifiers: ExportNamedDeclaration['specifiers'] = []
			let movedCount = 0

			for (const specifier of node.specifiers) {
				if (!isExportSpecifier(specifier)) {
					remainingExportSpecifiers.push(specifier)
					continue
				}

				const exportName = specifier.local.name
				const resolved = resolveTarget({
					name: exportName,
					exports,
					packageName,
					includeExtension
				})

				if (resolved.kind === 'unresolved' && warnings) {
					warnings.push(
						`Could not resolve "${exportName}" to a source file in ${filePath}`
					)
				}

				if (resolved.kind !== 'move') {
					remainingExportSpecifiers.push(specifier)
					continue
				}

				if (!exportsBySource.has(resolved.sourcePath)) {
					exportsBySource.set(resolved.sourcePath, [])
				}
				exportsBySource.get(resolved.sourcePath)?.push(specifier)
				movedCount++
			}

			if (movedCount === 0) continue

			const replacements: ExportNamedDeclaration[] = []
			for (const [source, specifiers] of exportsBySource) {
				const declaration = exportNamedDeclaration(
					null,
					specifiers,
					stringLiteral(source)
				)
				declaration.exportKind = node.exportKind
				replacements.push(declaration)
			}

			if (remainingExportSpecifiers.length > 0) {
				const declaration = exportNamedDeclaration(
					null,
					remainingExportSpecifiers,
					stringLiteral(node.source?.value ?? packageName)
				)
				declaration.exportKind = node.exportKind
				replacements.push(declaration)
			}

			reExportPath.replaceWithMultiple(replacements)
			modified = true
			importsMigrated += movedCount
		}

		if (modified) {
			const output = generate(
				ast,
				{
					// To avoid removing spaces in code
					retainLines: true,
					retainFunctionParens: true
				},
				content
			).code

			if (dryRun) {
				logger.info(`[dry-run] Would update imports in ${filePath}`)
				const diff = formatImportDiff({
					filePath,
					before: content,
					after: output
				})
				if (diff) logger.info(diff)
			} else {
				await writeFile(filePath, output)
				logger.verbose(`Writing changes to ${filePath}`)
			}

			changedFiles?.push(filePath)

			return { status: 'updated', importsMigrated }
		}

		return { status: 'unchanged', importsMigrated }
	} catch (error) {
		recordParseError({ filePath, error, parseErrors, logger })
		return { status: 'failed', importsMigrated }
	}
}

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
	const updatedFiles = new Set<string>()

	// Track warnings
	const warnings: string[] = []

	// Track files that could not be parsed
	const parseErrors: ParseError[] = []

	// Track which target files this run rewrote and which it left alone
	const changedFiles: string[] = []

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
					parseErrors,
					changedFiles
				})
				stats.importsMigrated += result.importsMigrated

				if (result.status === 'failed') {
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

		// Derive the target file counters so they cannot contradict each other
		stats.targetFilesFound = candidateFiles.size
		stats.targetFilesSkipped = skippedFiles.size
		stats.targetFilesProcessed = examinedFiles.size
		stats.importsUpdated = updatedFiles.size
		stats.noChangesNeeded = examinedFiles.size - updatedFiles.size
		stats.targetFilesFailed = candidateFiles.size - examinedFiles.size

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
			changedFiles,
			skippedFiles: Array.from(skippedFiles).toSorted()
		}
	} catch (error) {
		logger.error(`Error during migration: ${formatError(error)}`)
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
	const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))
	return typeof packageJson.name === 'string' && packageJson.name.length > 0
		? packageJson.name
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
): Promise<string[]> {
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
