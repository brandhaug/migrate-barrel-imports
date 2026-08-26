import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from '@babel/parser'
import type { NodePath } from '@babel/traverse'
import _traverse from '@babel/traverse'
import {
	type ExportDefaultDeclaration,
	type ExportNamedDeclaration,
	type VariableDeclarator,
	isClassDeclaration,
	isExportSpecifier,
	isFunctionDeclaration,
	isIdentifier,
	isTSEnumDeclaration,
	isTSInterfaceDeclaration,
	isTSTypeAliasDeclaration,
	isVariableDeclaration
} from '@babel/types'
import fg from 'fast-glob'
import micromatch from 'micromatch'
import { getBabelConfig } from './babel-config.js'
import { isBarrelFile } from './barrel.js'
import { recordExportFile } from './resolve.js'
import {
	type ExportInfo,
	type FindExportsParams,
	defaultLogger,
	recordParseError
} from './types.js'

// @ts-expect-error
const traverse: typeof _traverse = _traverse.default || _traverse

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
