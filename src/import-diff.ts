/**
 * @fileoverview Compact unified-style diffs of changed import statements
 *
 * Used by dry-run mode so users can validate a migration before applying it.
 * Only import statements that actually changed are rendered, never whole files.
 */

import { parse } from '@babel/parser'
import { getBabelConfig } from './babel-config.js'

interface FormatImportDiffParams {
	filePath: string
	before: string
	after: string
}

/**
 * Extracts the verbatim source text of every import statement in a file
 */
function collectImportStatements(code: string, filePath: string): string[] {
	const ast = parse(code, getBabelConfig(filePath))

	return ast.program.body
		.filter((node) => node.type === 'ImportDeclaration')
		.map((node) =>
			node.start === null || node.end === null
				? ''
				: code.slice(node.start, node.end)
		)
		.filter((statement) => statement.length > 0)
}

/**
 * Renders a compact unified-style diff of the import statements that changed
 *
 * @returns The diff, or an empty string when no import statement changed
 */
export function formatImportDiff({
	filePath,
	before,
	after
}: FormatImportDiffParams): string {
	const beforeImports = collectImportStatements(before, filePath)
	const afterImports = collectImportStatements(after, filePath)

	const removed = beforeImports.filter(
		(statement) => !afterImports.includes(statement)
	)
	const added = afterImports.filter(
		(statement) => !beforeImports.includes(statement)
	)

	if (removed.length === 0 && added.length === 0) return ''

	// Unified diff headers already carry the `a/`/`b/` prefix, so a leading
	// separator on an absolute path would double it up
	const headerPath = filePath.replace(/^\/+/, '')

	return [
		`--- a/${headerPath}`,
		`+++ b/${headerPath}`,
		...removed.flatMap((statement) =>
			statement.split('\n').map((line) => `-${line}`)
		),
		...added.flatMap((statement) =>
			statement.split('\n').map((line) => `+${line}`)
		)
	].join('\n')
}
