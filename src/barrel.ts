import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from '@babel/parser'
import {
	isExportAllDeclaration,
	isExportNamedDeclaration,
	isImportDeclaration
} from '@babel/types'
import { getBabelConfig } from './babel-config.js'
import {
	type IsBarrelFileParams,
	type ParseError,
	defaultLogger,
	recordParseError
} from './types.js'

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
