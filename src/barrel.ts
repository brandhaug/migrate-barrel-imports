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
 * A package.json entry-point declaration. `exports` is a recursive
 * string/array/object tree; `main` and `module` are plain strings. Map
 * values may be null in malformed manifests; the walk skips them.
 */
type EntryPointSpec =
	| string
	| Array<EntryPointSpec>
	| { [subpath: string]: EntryPointSpec | null }

/** Fields in package.json that may declare an entry-point file. */
const ENTRY_POINT_FIELDS = ['main', 'module', 'exports'] as const

interface PackageManifest {
	main?: EntryPointSpec
	module?: EntryPointSpec
	exports?: EntryPointSpec
}

/**
 * Collects the entry-point file paths a package declares via main, module and exports
 */
async function getPackageEntryPoints(
	packagePath: string
): Promise<Array<string>> {
	try {
		const manifest: PackageManifest = JSON.parse(
			await readFile(path.join(packagePath, 'package.json'), 'utf8')
		)

		const entries: Array<string> = []
		for (const field of ENTRY_POINT_FIELDS) {
			const spec = manifest[field]
			if (spec !== undefined) {
				collectEntryPointSpecs(spec, packagePath, entries)
			}
		}

		return entries
	} catch {
		return []
	}
}

/**
 * Collects the file paths declared by an entry-point spec. A string is a
 * direct entry point; arrays and objects (subpath/condition maps) recurse.
 * Malformed values (null, numbers, booleans) are skipped so one bad field
 * never discards the entries a valid main/module already contributed.
 */
function collectEntryPointSpecs(
	spec: EntryPointSpec | null,
	packagePath: string,
	entries: Array<string>
): void {
	if (spec === null) {
		return
	}
	if (typeof spec === 'string') {
		entries.push(path.resolve(packagePath, spec))
		return
	}
	if (Array.isArray(spec)) {
		for (const item of spec) {
			collectEntryPointSpecs(item, packagePath, entries)
		}
		return
	}
	for (const item of Object.values(spec)) {
		collectEntryPointSpecs(item, packagePath, entries)
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
	parseErrors?: Array<ParseError>
): Promise<boolean> {
	try {
		const content = await readFile(filePath, 'utf8')
		const ast = parse(content, getBabelConfig(filePath))

		let reExportCount = 0
		let otherStatementCount = 0

		for (const statement of ast.program.body) {
			if (isImportDeclaration(statement)) {
				continue
			}

			if (
				isExportAllDeclaration(statement) ||
				(isExportNamedDeclaration(statement) && statement.source)
			) {
				reExportCount++
				continue
			}

			otherStatementCount++
		}

		if (reExportCount === 0) {
			return false
		}

		// Entry-point files re-exporting anything are barrels regardless of content
		if (isEntryPointFileName(filePath)) {
			return true
		}

		if (packagePath) {
			const entryPoints = await getPackageEntryPoints(packagePath)
			const resolvedPath = path.resolve(filePath)
			if (entryPoints.includes(resolvedPath)) {
				return true
			}
		}

		// Otherwise substantially all statements must be pure re-exports
		const total = reExportCount + otherStatementCount
		return reExportCount / total >= PURE_RE_EXPORT_RATIO
	} catch (error) {
		recordParseError({ filePath, error, parseErrors, logger })
		return false
	}
}
