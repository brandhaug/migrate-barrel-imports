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

import { readFileSync, writeFileSync } from 'node:fs'
import path, { join } from 'node:path'
import _generate from '@babel/generator'
import { parse } from '@babel/parser'
import type { NodePath } from '@babel/traverse'
import _traverse from '@babel/traverse'
import type {
	ExportDefaultDeclaration,
	ExportNamedDeclaration,
	ImportDeclaration,
	VariableDeclarator
} from '@babel/types'
import * as t from '@babel/types'
import fg from 'fast-glob'
import micromatch from 'micromatch'
import type { Options } from './options'

// @ts-expect-error
const generate = _generate.default || _generate
// @ts-expect-error
const traverse = _traverse.default || _traverse

/**
 * @property {string} name - Package name
 * @property {Record<string, string>} [exports] - Package exports configuration
 * @property {string} [main] - Main entry point
 * @property {string} [types] - TypeScript types entry point
 */
interface PackageJson {
	name: string
	exports?: Record<string, string>
	main?: string
	types?: string
}

/**
 * @property {string} source - Source file path containing exports
 * @property {string[]} exports - Array of exported names from the file
 * @property {boolean} [isIgnored] - Whether the file is ignored
 */
interface ExportInfo {
	source: string
	exports: string[]
	isIgnored?: boolean
}

interface FindExportsParams {
	packagePath: string
	ignoreSourceFiles?: string[]
	stats?: {
		sourceFilesSkipped: number
	}
}

interface FindImportsParams {
	packageName: string
	monorepoRoot: string
}

interface UpdateImportsParams {
	filePath: string
	packageName: string
	exports: ExportInfo[]
	includeExtension?: boolean
}

/**
 * Reads and parses the package.json file for a given package path
 *
 * @param {string} packagePath - The path to the package directory
 * @returns {Promise<PackageJson>} The parsed package.json contents
 * @throws {Error} If package.json cannot be read or parsed
 */
async function getPackageInfo(packagePath: string): Promise<PackageJson> {
	const packageJsonPath = join(packagePath, 'package.json')
	const content = readFileSync(packageJsonPath, 'utf-8')
	return JSON.parse(content)
}

/**
 * Recursively finds all exports in a package by scanning all TypeScript files
 *
 * This function:
 * 1. Scans all .ts and .tsx files in the package
 * 2. Identifies both named exports and default exports
 * 3. Skips re-exports to avoid circular dependencies
 * 4. Filters out ignored files based on patterns
 *
 * @param {FindExportsParams} params - Parameters for finding exports
 * @returns {Promise<ExportInfo[]>} Array of export information, including source file and exported names
 */
async function findExports({
	packagePath,
	ignoreSourceFiles = [],
	stats
}: FindExportsParams): Promise<ExportInfo[]> {
	const exports: ExportInfo[] = []

	console.log(`Scanning for TypeScript files in: ${packagePath}`)
	const allFiles = await fg('**/*.{ts,tsx}', {
		cwd: packagePath,
		ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
	})
	console.log(`Found ${allFiles.length} TypeScript files`)

	for (const file of allFiles) {
		// Mark files that match ignore patterns but still process them
		const isIgnored = ignoreSourceFiles.some((pattern) =>
			micromatch.isMatch(file, pattern)
		)
		if (isIgnored) {
			console.log(`File matches ignore pattern but will be preserved: ${file}`)
			if (stats) {
				stats.sourceFilesSkipped++
			}
		}

		const fullPath = join(packagePath, file)
		console.log(`\nProcessing file: ${file}`)
		const content = readFileSync(fullPath, 'utf-8')

		try {
			const ast = parse(content, {
				sourceType: 'module',
				plugins: [
					'typescript',
					'jsx',
					'decorators-legacy',
					'classProperties',
					'classPrivateProperties',
					'classPrivateMethods',
					'exportDefaultFrom',
					'exportNamespaceFrom',
					'functionBind',
					'functionSent',
					'dynamicImport',
					'nullishCoalescingOperator',
					'optionalChaining',
					'objectRestSpread',
					'asyncGenerators',
					'doExpressions',
					'importMeta',
					'logicalAssignment',
					'moduleBlocks',
					'moduleStringNames',
					'numericSeparator',
					'partialApplication',
					'privateIn',
					'throwExpressions',
					'topLevelAwait'
				]
			})

			traverse(ast, {
				ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
					console.log(`Found named export in ${file}`)
					// Skip exports from other files (we only want direct exports)
					if (path.node.source) {
						console.log(`Skipping re-export from ${path.node.source.value}`)
						return
					}

					// Handle variable declarations with exports
					if (path.node.declaration) {
						if (t.isVariableDeclaration(path.node.declaration)) {
							const declarations = path.node.declaration.declarations
							const namedExports = declarations
								.map((d: VariableDeclarator) => {
									if (t.isIdentifier(d.id)) {
										return d.id.name
									}
									return null
								})
								.filter((name: string | null): name is string => name !== null)

							if (namedExports.length > 0) {
								console.log(`Named exports found: ${namedExports.join(', ')}`)
								exports.push({
									source: file,
									exports: namedExports,
									isIgnored
								})
							}
						}
						return
					}

					// Handle export specifiers
					const namedExports = path.node.specifiers
						.map((s) => {
							if (t.isExportSpecifier(s)) {
								const exported = s.exported
								return t.isIdentifier(exported) ? exported.name : exported.value
							}
							return null
						})
						.filter((name: string | null): name is string => name !== null)

					if (namedExports.length > 0) {
						console.log(`Named exports found: ${namedExports.join(', ')}`)
						exports.push({
							source: file,
							exports: namedExports,
							isIgnored
						})
					}
				},
				ExportDefaultDeclaration(path: NodePath<ExportDefaultDeclaration>) {
					console.log(`Found default export in ${file}`)
					const exported = path.node.declaration
					if (t.isIdentifier(exported)) {
						console.log(`Default export name: ${exported.name}`)
						exports.push({
							source: file,
							exports: [exported.name],
							isIgnored
						})
					} else if (t.isFunctionDeclaration(exported) && exported.id) {
						console.log(`Default export name: ${exported.id.name}`)
						exports.push({
							source: file,
							exports: [exported.id.name],
							isIgnored
						})
					} else {
						console.log('Default export is not an identifier or named function')
					}
				}
			})
		} catch (error) {
			console.error(`Error parsing ${file}:`, error)
		}
	}

	console.log(`\nTotal exports found: ${exports.length}`)
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
 *
 * @param {FindImportsParams} params - Parameters for finding imports
 * @returns {Promise<string[]>} Array of file paths that import from the package
 */
async function findImports({
	packageName,
	monorepoRoot
}: FindImportsParams): Promise<string[]> {
	try {
		const allFiles = new Set<string>()

		// Find all TypeScript files in the monorepo
		const files = await fg(['**/*.{ts,tsx}'], {
			cwd: monorepoRoot,
			absolute: true,
			ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
			followSymbolicLinks: false
		})

		console.log(`Found ${files.length} TypeScript files to scan`)

		// Scan each file for imports
		for (const file of files) {
			try {
				const content = readFileSync(file, 'utf-8')
				const ast = parse(content, {
					sourceType: 'module',
					plugins: ['typescript', 'jsx']
				})

				traverse(ast, {
					ImportDeclaration(path: NodePath<ImportDeclaration>) {
						const source = path.node.source.value
						// Check for exact package import or subpath import
						if (
							source === packageName ||
							source.startsWith(`${packageName}/`)
						) {
							allFiles.add(file)
						}
					}
				})
			} catch (error) {
				console.error(`Error processing file ${file}:`, error)
			}
		}

		const uniqueFiles = Array.from(allFiles)
		if (uniqueFiles.length > 0) {
			console.log(
				`Found total of ${uniqueFiles.length} files with imports from ${packageName}`
			)
			console.log('Files found:')
			for (const file of uniqueFiles) {
				console.log(`  ${file}`)
			}
		} else {
			console.log(`No files found importing from ${packageName}`)
		}

		return uniqueFiles
	} catch (error) {
		console.error('Error finding imports:', error)
		return []
	}
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
 * @returns {Promise<void>}
 */
async function updateImports({
	filePath,
	packageName,
	exports,
	includeExtension = true
}: UpdateImportsParams): Promise<void> {
	console.log(`\nProcessing file: ${filePath}`)
	const content = readFileSync(filePath, 'utf-8')

	try {
		const ast = parse(content, {
			sourceType: 'module',
			plugins: [
				'typescript',
				'jsx',
				'decorators-legacy',
				'classProperties',
				'classPrivateProperties',
				'classPrivateMethods',
				'exportDefaultFrom',
				'exportNamespaceFrom',
				'functionBind',
				'functionSent',
				'dynamicImport',
				'nullishCoalescingOperator',
				'optionalChaining',
				'objectRestSpread',
				'asyncGenerators',
				'doExpressions',
				'importMeta',
				'logicalAssignment',
				'moduleBlocks',
				'moduleStringNames',
				'numericSeparator',
				'partialApplication',
				'privateIn',
				'throwExpressions',
				'topLevelAwait'
			]
		})

		let modified = false
		let importCount = 0

		traverse(ast, {
			ImportDeclaration(path: NodePath<ImportDeclaration>) {
				if (path.node.source.value === packageName) {
					importCount++
					console.log(`Found import from ${packageName}`)
					const specifiers = path.node.specifiers
					const newImports: t.ImportDeclaration[] = []

					for (const specifier of specifiers) {
						if (t.isImportSpecifier(specifier)) {
							const imported = specifier.imported
							const importName = t.isIdentifier(imported)
								? imported.name
								: imported.value
							const exportInfo = exports.find((e) =>
								e.exports.includes(importName)
							)

							if (exportInfo) {
								console.log(
									`  Found export ${importName} in ${exportInfo.source}`
								)
								// Skip modifying imports from ignored files
								if (exportInfo.isIgnored) {
									console.log(
										`  Keeping original import for ignored file: ${exportInfo.source}`
									)
									continue
								}
								const importPath = includeExtension
									? `${packageName}/${exportInfo.source}`
									: `${packageName}/${exportInfo.source.replace(/\.(js|jsx|ts|tsx|mjs|cjs)$/, '')}`
								newImports.push(
									t.importDeclaration(
										[t.importSpecifier(specifier.local, specifier.imported)],
										t.stringLiteral(importPath)
									)
								)
								modified = true
							} else {
								console.log(`  Warning: Could not find export ${importName}`)
							}
						}
					}

					if (newImports.length > 0) {
						// If there are any remaining specifiers that weren't moved to direct imports,
						// create a new import declaration for them
						const remainingSpecifiers = specifiers.filter((s) => {
							if (!t.isImportSpecifier(s)) return true
							const importName = t.isIdentifier(s.imported)
								? s.imported.name
								: s.imported.value
							const exportInfo = exports.find((e) =>
								e.exports.includes(importName)
							)
							return !exportInfo || exportInfo.isIgnored
						})

						if (remainingSpecifiers.length > 0) {
							newImports.unshift(
								t.importDeclaration(
									remainingSpecifiers,
									t.stringLiteral(packageName)
								)
							)
						}

						path.replaceWithMultiple(newImports)
						console.log(
							'  Replaced import with direct imports from source files'
						)
					}
				}
			}
		})

		if (modified) {
			console.log(`Writing changes to ${filePath}`)
			const output = generate(
				ast,
				{
					retainLines: false,
					retainFunctionParens: true
				},
				content
			)
			writeFileSync(filePath, output.code)
		} else if (importCount > 0) {
			console.log(`No changes needed for ${importCount} imports`)
		} else {
			console.log('No imports found to update')
		}
	} catch (error) {
		console.error(`Error processing ${filePath}:`, error)
	}
}

/**
 * Main migration function that orchestrates the barrel file migration process
 *
 * Process flow:
 * 1. Reads package.json to get package name and configuration
 * 2. Scans source package for all exports (named and default)
 * 3. Finds all files in the monorepo that import from the package
 * 4. Updates each import to point directly to source files
 *
 * @param {Options} options - Migration configuration options
 * @returns {Promise<void>}
 */
export async function migrateBarrelImports(options: Options): Promise<void> {
	const { sourcePath, targetPath, ignoreSourceFiles, ignoreTargetFiles } =
		options

	// Track migration statistics
	const stats = {
		totalFiles: 0,
		filesProcessed: 0,
		filesSkipped: 0,
		importsUpdated: 0,
		filesWithNoUpdates: 0,
		errors: 0,
		totalExports: 0,
		sourceFilesScanned: 0,
		sourceFilesWithExports: 0,
		sourceFilesSkipped: 0,
		targetFilesFound: [] as string[]
	}

	const packageInfo = await getPackageInfo(sourcePath)
	const exports = await findExports({
		packagePath: sourcePath,
		ignoreSourceFiles: ignoreSourceFiles,
		stats
	})

	// Calculate total number of unique exports and source files
	stats.totalExports = exports.reduce(
		(total, exp) => total + exp.exports.length,
		0
	)
	stats.sourceFilesWithExports = new Set(exports.map((exp) => exp.source)).size
	stats.sourceFilesScanned = (
		await fg('**/*.{ts,tsx}', {
			cwd: sourcePath,
			ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
		})
	).length

	const files = await findImports({
		packageName: packageInfo.name,
		monorepoRoot: targetPath
	})

	stats.totalFiles = files.length
	stats.targetFilesFound = files

	for (const file of files) {
		const relativeFile = path.relative(targetPath, file)
		if (
			ignoreTargetFiles.some((pattern) =>
				micromatch.isMatch(relativeFile, pattern)
			)
		) {
			console.log(
				`Skipping ignored file: ${file} (matches pattern in ${ignoreTargetFiles.join(', ')})`
			)
			stats.filesSkipped++
			continue
		}

		try {
			const originalContent = readFileSync(file, 'utf-8')
			await updateImports({
				filePath: file,
				packageName: packageInfo.name,
				exports: exports,
				includeExtension: options.includeExtension
			})
			const updatedContent = readFileSync(file, 'utf-8')

			if (originalContent !== updatedContent) {
				stats.importsUpdated++
			} else {
				stats.filesWithNoUpdates++
			}
			stats.filesProcessed++
		} catch (error) {
			stats.errors++
			console.error(`Error processing ${file}:`, error)
		}
	}

	// Print migration summary
	console.log('\nMigration Summary')
	console.log(`Source files found: ${stats.sourceFilesScanned}`)
	console.log(`Source files with exports: ${stats.sourceFilesWithExports}`)
	console.log(`Source files skipped: ${stats.sourceFilesSkipped}`)
	console.log(`Exports found: ${stats.totalExports}`)
	console.log(`Target files found: ${stats.totalFiles}`)
	console.log(`Target files processed: ${stats.filesProcessed}`)
	console.log(`Target files with imports updated: ${stats.importsUpdated}`)
	console.log(
		`Target files with no changes needed: ${stats.filesWithNoUpdates}`
	)
	console.log(`Target files skipped: ${stats.filesSkipped}`)

	if (stats.errors > 0) {
		console.log(
			`\nWarning: ${stats.errors} errors encountered during processing`
		)
	}
}
