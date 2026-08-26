import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from '@babel/parser'
import type { NodePath } from '@babel/traverse'
import _traverse from '@babel/traverse'
import type { ExportNamedDeclaration, ImportDeclaration } from '@babel/types'
import fg from 'fast-glob'
import micromatch from 'micromatch'
import { getBabelConfig } from './babel-config.js'
import type { Logger } from './logger.js'
import {
	type FindImportsParams,
	type FindImportsResult,
	defaultLogger,
	formatError,
	isPackageImport,
	recordParseError
} from './types.js'

// @ts-expect-error
const traverse: typeof _traverse = _traverse.default || _traverse

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

				traverse(ast, {
					ImportDeclaration(path: NodePath<ImportDeclaration>) {
						// Check for exact package import or subpath import
						if (isPackageImport(path.node.source.value, packageName)) {
							allFiles.add(file)
						}
					},
					ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
						// `export { x } from "<package>"` is a barrel import too
						const source = path.node.source
						if (source && isPackageImport(source.value, packageName)) {
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
				logger.verbose(`File matches ignore pattern, skipping: ${relativePath}`)
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

export { findImports, resolveScanDirectories, isInsideAnyDirectory }
