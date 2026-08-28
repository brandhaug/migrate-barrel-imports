import { readFile, writeFile } from 'node:fs/promises'
import { generate } from '@babel/generator'
import { parse } from '@babel/parser'
import traverse, { type NodePath } from '@babel/traverse'
import {
	type ExportNamedDeclaration,
	type ExportSpecifier,
	type ImportDeclaration,
	type ImportDefaultSpecifier,
	type ImportNamespaceSpecifier,
	type ImportSpecifier,
	exportNamedDeclaration,
	importDeclaration,
	importSpecifier,
	isExportSpecifier,
	isIdentifier,
	isImportSpecifier,
	stringLiteral
} from '@babel/types'
import { getBabelConfig } from './babel-config.js'
import { formatImportDiff } from './import-diff.js'
import { resolveTarget } from './resolve.js'
import {
	type ImportSpec,
	type UpdateImportsParams,
	type UpdateImportsResult,
	defaultLogger,
	isPackageImport,
	recordParseError
} from './types.js'

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
export async function updateImports({
	filePath,
	packageName,
	exports,
	logger = defaultLogger,
	includeExtension = true,
	dryRun = false,
	warnings,
	parseErrors
}: UpdateImportsParams): Promise<UpdateImportsResult> {
	logger.verbose(`\nProcessing file: ${filePath}`)
	let modified = false
	let importsMigrated = 0

	try {
		const content = await readFile(filePath, 'utf8')
		const ast = parse(content, getBabelConfig(filePath))
		const importDeclarations: Array<ImportDeclaration> = []

		// First pass: collect all import declarations
		traverse(ast, {
			ImportDeclaration(nodePath: NodePath<ImportDeclaration>) {
				const importSource = nodePath.node.source.value
				if (isPackageImport(importSource, packageName)) {
					importDeclarations.push(nodePath.node)
				}
			}
		})

		const importsBySource = new Map<string, Array<ImportSpec>>()
		const remainingSpecifiers: Array<
			ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier
		> = []

		for (const declaration of importDeclarations) {
			for (const specifier of declaration.specifiers) {
				if (!isImportSpecifier(specifier)) {
					continue
				}

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

				if (resolved.kind === 'drop') {
					continue
				}

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
					const hasOriginalImport = [...importsBySource.values()].some(
						(specs) =>
							specs.some(
								(spec) =>
									isIdentifier(spec.imported) &&
									spec.imported.name === importName
							)
					)

					// Only add the import if it is not aliased or if we do not have the original import yet
					if (isAliased && hasOriginalImport) {
						continue
					}
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
			ImportDeclaration(nodePath: NodePath<ImportDeclaration>) {
				const importSource = nodePath.node.source.value
				if (isPackageImport(importSource, packageName)) {
					// Remove the original import declaration
					nodePath.remove()
				}
			}
		})

		// Add new import declarations
		const newImports: Array<ImportDeclaration> = []
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
			ExportNamedDeclaration(nodePath: NodePath<ExportNamedDeclaration>) {
				const source = nodePath.node.source
				if (source && isPackageImport(source.value, packageName)) {
					reExportPaths.push(nodePath)
				}
			}
		})

		for (const reExportPath of reExportPaths) {
			const node = reExportPath.node
			const exportsBySource = new Map<string, Array<ExportSpecifier>>()
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

			if (movedCount === 0) {
				continue
			}

			const replacements: Array<ExportNamedDeclaration> = []
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
				if (diff) {
					logger.info(diff)
				}
			} else {
				await writeFile(filePath, output)
				logger.verbose(`Writing changes to ${filePath}`)
			}

			return { status: 'updated', importsMigrated }
		}

		return { status: 'unchanged', importsMigrated }
	} catch (error) {
		recordParseError({ filePath, error, parseErrors, logger })
		return { status: 'failed', importsMigrated }
	}
}
