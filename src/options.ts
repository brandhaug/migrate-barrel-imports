/**
 * Configuration options for the migration process
 * @property {string} sourcePath - Glob pattern for source packages to migrate
 * @property {string} targetPath - Path to the monorepo root to search for imports
 * @property {string[]} ignoreSourceFiles - Patterns to ignore when scanning source files
 * @property {string[]} ignoreTargetFiles - Patterns to ignore when scanning target files
 * @property {boolean} [includeExtension] - Whether to include file extensions in imports
 */
export type Options = {
	sourcePath: string
	targetPath: string
	ignoreSourceFiles: string[]
	ignoreTargetFiles: string[]
	includeExtension?: boolean
}

export const defaultOptions: Omit<Options, 'sourcePath'> = {
	targetPath: '.',
	ignoreSourceFiles: [],
	ignoreTargetFiles: [],
	includeExtension: false
}
