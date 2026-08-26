/**
 * Configuration options for the migration process
 * @property {string} sourcePath - Glob pattern for source packages to migrate
 * @property {string} targetPath - Path to the monorepo root to search for imports
 * @property {string[]} ignoreSourceFiles - Patterns to ignore when scanning source files
 * @property {string[]} ignoreTargetFiles - Patterns to ignore when scanning target files
 * @property {boolean} [includeExtension] - Whether to include file extensions in imports
 * @property {boolean} [includeBarrels] - Whether to rewrite imports inside barrel files as well
 * @property {Verbosity} [verbosity] - How much output the migration prints
 */
import type { Verbosity } from './logger.js'

export type Options = {
	sourcePath: string
	targetPath: string
	ignoreSourceFiles: string[]
	ignoreTargetFiles: string[]
	includeExtension?: boolean
	includeBarrels?: boolean
	dryRun?: boolean
	verbosity?: Verbosity
}

export const defaultOptions: Omit<Options, 'sourcePath'> = {
	targetPath: '.',
	ignoreSourceFiles: [],
	ignoreTargetFiles: [],
	includeExtension: false,
	includeBarrels: false,
	verbosity: 'normal'
}
