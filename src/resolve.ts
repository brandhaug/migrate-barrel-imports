import {
	type ResolveExportSourceParams,
	type ResolvedTarget,
	type ResolveTargetParams
} from './types.js'

const AUXILIARY_FILE_MARKERS = [
	'.stories.',
	'.test.',
	'.spec.',
	'.stories/',
	'.test/',
	'.spec/'
]

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

export { resolveTarget, recordExportFile }
