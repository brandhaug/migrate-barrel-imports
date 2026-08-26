import path from 'node:path'
import type { ParserOptions } from '@babel/parser'

/** Common Babel configuration for parsing TypeScript and JavaScript files */
const BABEL_CONFIG: ParserOptions = {
	sourceType: 'module',
	plugins: [
		'typescript',
		'decorators-legacy',
		'exportDefaultFrom',
		'functionBind',
		'functionSent',
		'doExpressions',
		'importMeta',
		'moduleBlocks',
		'partialApplication',
		'throwExpressions'
	]
}

// Extensions where `<` starts JSX rather than a type parameter list. Enabling
// the jsx plugin for plain .ts files breaks generic arrow functions such as
// `<T>(value: T) => value`.
const JSX_EXTENSIONS = new Set(['.jsx', '.tsx'])

/**
 * Builds the Babel parser options for a file, enabling the jsx plugin only for
 * .jsx/.tsx files.
 *
 * @param {string} filePath - Path of the file being parsed
 * @returns {ParserOptions} Parser options for that file
 */
export function getBabelConfig(filePath: string): ParserOptions {
	if (!JSX_EXTENSIONS.has(path.extname(filePath))) {
		return BABEL_CONFIG
	}

	return {
		...BABEL_CONFIG,
		plugins: [...(BABEL_CONFIG.plugins ?? []), 'jsx']
	}
}
