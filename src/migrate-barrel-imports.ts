/**
 * Public API for migrating barrel imports to direct file imports.
 *
 * Implementation lives in focused modules (`barrel`, `resolve`, `find-exports`,
 * `find-imports`, `update-imports`, `migrate`); this module re-exports the
 * functions and types used by the CLI and by library consumers.
 */

export { isBarrelFile } from './barrel.js'
export { findExports } from './find-exports.js'
export { migrateBarrelImports } from './migrate.js'
export { resolveExportSource } from './resolve.js'
export type {
	ExportInfo,
	IsBarrelFileParams,
	MigrationResult,
	MigrationStats,
	ParseError
} from './types.js'
