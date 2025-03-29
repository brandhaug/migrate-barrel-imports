/**
 * @fileoverview Tool for migrating TypeScript projects from barrel file exports to direct file imports
 *
 * This tool helps migrate TypeScript projects that use barrel files (index.ts files that re-export)
 * to use direct imports from source files instead. This improves:
 * - Tree-shaking efficiency
 * - Build performance
 * - Code maintainability
 * - TypeScript compilation speed
 *
 * The migration process:
 * 1. Scans source package for all exports
 * 2. Finds all files importing from the package
 * 3. Updates imports to point directly to source files
 * 4. Preserves original import names and types
 */

import { readFileSync, writeFileSync } from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'
import _generate from '@babel/generator'
import { parse } from '@babel/parser'
import type { ParserOptions } from '@babel/parser'
import type { NodePath } from '@babel/traverse'
import _traverse from '@babel/traverse'
import {
  type ExportDefaultDeclaration,
  type ExportNamedDeclaration,
  type ImportDeclaration,
  type ImportDefaultSpecifier,
  type ImportNamespaceSpecifier,
  type ImportSpecifier,
  type VariableDeclarator,
  importDeclaration,
  importSpecifier,
  isClassDeclaration,
  isExportSpecifier,
  isFunctionDeclaration,
  isIdentifier,
  isImportSpecifier,
  isTSEnumDeclaration,
  isTSInterfaceDeclaration,
  isTSTypeAliasDeclaration,
  isVariableDeclaration,
  stringLiteral
} from '@babel/types'
import fg from 'fast-glob'
import micromatch from 'micromatch'
import type { Options as MigrationOptions } from './options'

// @ts-expect-error
const generate: typeof _generate = _generate.default || _generate
// @ts-expect-error
const traverse: typeof _traverse = _traverse.default || _traverse

// Common Babel configuration for parsing TypeScript files
const BABEL_CONFIG: ParserOptions = {
  sourceType: 'module',
  plugins: [
    'typescript',
    'jsx',
    'decorators-legacy',
    'classProperties',
    'classPrivateProperties',
    'classPrivateMethods',
    'exportDefaultFrom',
    'exportNamespaceFrom',
    'functionBind',
    'functionSent',
    'dynamicImport',
    'nullishCoalescingOperator',
    'optionalChaining',
    'objectRestSpread',
    'asyncGenerators',
    'doExpressions',
    'importMeta',
    'logicalAssignment',
    'moduleBlocks',
    'moduleStringNames',
    'numericSeparator',
    'partialApplication',
    'privateIn',
    'throwExpressions',
    'topLevelAwait'
  ]
}

/**
 * @property {string} name - Package name
 * @property {Record<string, string>} [exports] - Package exports configuration
 * @property {string} [main] - Main entry point
 * @property {string} [types] - TypeScript types entry point
 */
interface PackageJson {
  name: string
  exports?: Record<string, string>
  main?: string
  types?: string
}

/**
 * @property {string} source - Source file path containing exports
 * @property {string[]} exports - Array of exported names from the file
 * @property {boolean} [isIgnored] - Whether the file is ignored
 */
interface ExportInfo {
  source: string
  exports: string[]
  isIgnored?: boolean
}

interface MigrationStats {
  totalFiles: number
  filesProcessed: number
  filesSkipped: number
  importsUpdated: number
  filesWithNoUpdates: number
  errors: number
  totalExports: number
  sourceFilesScanned: number
  sourceFilesWithExports: number
  sourceFilesSkipped: number
  targetFilesFound: string[]
  packagesProcessed: number
  packagesSkipped: number
  warnings: string[]
}

interface FindExportsParams {
  packagePath: string
  ignoreSourceFiles?: string[]
  stats?: MigrationStats
}

interface FindImportsParams {
  packageName: string
  monorepoRoot: string
}

interface UpdateImportsParams {
  filePath: string
  packageName: string
  exports: ExportInfo[]
  includeExtension?: boolean
  warnings?: string[]
  stats?: MigrationStats
}

/**
 * Reads and parses the package.json file for a given package path
 *
 * @param {string} packagePath - The path to the package directory
 * @returns {Promise<PackageJson>} The parsed package.json contents
 * @throws {Error} If package.json cannot be read or parsed
 */
async function getPackageInfo(packagePath: string): Promise<PackageJson> {
  const packageJsonPath = path.join(packagePath, 'package.json')
  const content = readFileSync(packageJsonPath, 'utf-8')
  return JSON.parse(content)
}

/**
 * Extracts export names from a declaration node
 */
function getExportNames(declaration: ExportNamedDeclaration['declaration']): string[] {
  if (!declaration) return []

  if (isVariableDeclaration(declaration)) {
    return declaration.declarations
      .map((d: VariableDeclarator) => (isIdentifier(d.id) ? d.id.name : null))
      .filter((name: string | null): name is string => name !== null)
  }

  if (isFunctionDeclaration(declaration) && declaration.id) {
    return [declaration.id.name]
  }

  if (isTSEnumDeclaration(declaration)) {
    return [declaration.id.name]
  }

  if (isTSInterfaceDeclaration(declaration)) {
    return [declaration.id.name]
  }

  if (isTSTypeAliasDeclaration(declaration)) {
    return [declaration.id.name]
  }

  if (isClassDeclaration(declaration) && declaration.id) {
    return [declaration.id.name]
  }

  return []
}

/**
 * Recursively finds all exports in a package by scanning all TypeScript files
 *
 * This function:
 * 1. Scans all .ts and .tsx files in the package
 * 2. Identifies both named exports and default exports
 * 3. Skips re-exports to avoid circular dependencies
 * 4. Filters out ignored files based on patterns
 *
 * @param {FindExportsParams} params - Parameters for finding exports
 * @returns {Promise<ExportInfo[]>} Array of export information, including source file and exported names
 */
async function findExports({ packagePath, ignoreSourceFiles = [], stats }: FindExportsParams): Promise<ExportInfo[]> {
  const exports: ExportInfo[] = []

  console.log(`Scanning for TypeScript and JavaScript files in: ${packagePath}`)
  const allFiles = await fg('**/*.{ts,tsx,js,jsx}', {
    cwd: packagePath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
  })
  console.log(`Found ${allFiles.length} files`)

  for (const file of allFiles) {
    // Mark files that match ignore patterns but still process them
    const isIgnored = ignoreSourceFiles.some((pattern) => micromatch.isMatch(file, pattern))
    if (isIgnored) {
      console.log(`File matches ignore pattern but will be preserved: ${file}`)
      if (stats) {
        stats.sourceFilesSkipped++
      }
    }

    const fullPath = path.join(packagePath, file)
    console.log(`\nProcessing file: ${file}`)
    const content = readFileSync(fullPath, 'utf-8')

    try {
      const ast = parse(content, BABEL_CONFIG)

      traverse(ast, {
        ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
          console.log(`Found named export in ${file}`)

          // Handle re-exports from external packages
          if (path.node.source) {
            const sourceValue = path.node.source.value
            // Skip re-exports from node_modules or external packages
            if (sourceValue.includes('node_modules') || !sourceValue.startsWith('.')) {
              console.log(`Skipping re-export from external package: ${sourceValue}`)
              return
            }
          }

          // Handle variable declarations with exports
          if (path.node.declaration) {
            const exportNames = getExportNames(path.node.declaration)
            if (exportNames.length > 0) {
              console.log(`Named exports found: ${exportNames.join(', ')}`)
              exports.push({
                source: file,
                exports: exportNames,
                isIgnored
              })
            }
          }

          // Handle export specifiers
          const exportNames = path.node.specifiers
            .map((s) => {
              if (isExportSpecifier(s)) {
                const exported = s.exported
                return isIdentifier(exported) ? exported.name : exported.value
              }
              return null
            })
            .filter((name: string | null): name is string => name !== null)

          if (exportNames.length > 0) {
            console.log(`Named exports found: ${exportNames.join(', ')}`)
            exports.push({
              source: file,
              exports: exportNames,
              isIgnored
            })
          }
        },
        ExportDefaultDeclaration(path: NodePath<ExportDefaultDeclaration>) {
          console.log(`Found default export in ${file}`)
          const exported = path.node.declaration
          const exportName = isIdentifier(exported)
            ? exported.name
            : isFunctionDeclaration(exported) && exported.id
              ? exported.id.name
              : null

          if (exportName) {
            console.log(`Default export name: ${exportName}`)
            exports.push({
              source: file,
              exports: [exportName],
              isIgnored
            })
          } else {
            console.log('Default export is not an identifier or named function')
          }
        }
      })
    } catch (error) {
      console.error(`Error parsing ${file}:`, error)
    }
  }

  console.log(`\nTotal exports found: ${exports.length}`)
  return exports
}

/**
 * Finds all files in the monorepo that import from a specific package
 *
 * This function:
 * 1. Uses fast-glob to find all TypeScript files
 * 2. Parses each file's AST to find imports
 * 3. Handles both direct package imports and subpath imports
 * 4. Excludes node_modules, dist, and build directories
 *
 * @param {FindImportsParams} params - Parameters for finding imports
 * @returns {Promise<string[]>} Array of file paths that import from the package
 */
async function findImports({ packageName, monorepoRoot }: FindImportsParams): Promise<string[]> {
  try {
    const allFiles = new Set<string>()

    // Find all TypeScript and JavaScript files in the monorepo
    const files = await fg(['**/*.{ts,tsx,js,jsx}'], {
      cwd: monorepoRoot,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      followSymbolicLinks: false
    })

    console.log(`Found ${files.length} files to scan`)

    // Scan each file for imports
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8')
        const ast = parse(content, BABEL_CONFIG)

        traverse(ast, {
          ImportDeclaration(path: NodePath<ImportDeclaration>) {
            const source = path.node.source.value
            // Check for exact package import or subpath import
            if (source === packageName || source.startsWith(`${packageName}/`)) {
              allFiles.add(file)
            }
          }
        })
      } catch (error) {
        console.error(`Error processing file ${file}:`, error)
      }
    }

    const uniqueFiles = Array.from(allFiles)
    if (uniqueFiles.length > 0) {
      console.log(`Found total of ${uniqueFiles.length} files with imports from ${packageName}`)
      console.log('Files found:')
      for (const file of uniqueFiles) {
        console.log(`  ${file}`)
      }
    } else {
      console.log(`No files found importing from ${packageName}`)
    }

    return uniqueFiles
  } catch (error) {
    console.error('Error finding imports:', error)
    return []
  }
}

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
 * @returns {Promise<void>}
 */
async function updateImports({
  filePath,
  packageName,
  exports,
  includeExtension = true,
  warnings,
  stats
}: UpdateImportsParams): Promise<void> {
  console.log(`\nProcessing file: ${filePath}`)
  const content = readFileSync(filePath, 'utf-8')

  try {
    const ast = parse(content, BABEL_CONFIG)
    let modified = false
    let importCount = 0
    // Track processed imports to prevent loops
    const processedImports = new Set<string>()

    traverse(ast, {
      ImportDeclaration(path: NodePath<ImportDeclaration>) {
        const importSource = path.node.source.value
        // Skip if we've already processed this import
        if (processedImports.has(importSource)) {
          return
        }

        if (importSource === packageName) {
          importCount++
          console.log(`Found import from ${packageName}`)
          const specifiers = path.node.specifiers

          // Group imports by source file
          type ImportSpec = {
            local: ImportSpecifier['local']
            imported: ImportSpecifier['imported']
          }
          const importsBySource = new Map<string, ImportSpec[]>()
          const remainingSpecifiers: Array<ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier> = []
          let hasReExports = false
          let hasDirectExports = false

          for (const specifier of specifiers) {
            if (isImportSpecifier(specifier)) {
              const imported = specifier.imported
              const importName = isIdentifier(imported) ? imported.name : imported.value
              const exportInfo = exports.find((e) => e.exports.includes(importName))

              if (exportInfo) {
                console.log(`  Found export ${importName} in ${exportInfo.source}`)
                // Skip modifying imports from ignored files
                if (exportInfo.isIgnored) {
                  console.log(`  Keeping original import for ignored file: ${exportInfo.source}`)
                  remainingSpecifiers.push(specifier)
                  continue
                }
                const importPath = includeExtension
                  ? `${packageName}/${exportInfo.source}`
                  : `${packageName}/${exportInfo.source.replace(/\.(js|jsx|ts|tsx|mjs|cjs)$/, '')}`

                if (!importsBySource.has(importPath)) {
                  importsBySource.set(importPath, [])
                }
                importsBySource.get(importPath)?.push({ local: specifier.local, imported: specifier.imported })
                modified = true
                hasDirectExports = true
              } else {
                // Check if this is a re-export from an external package
                const isReExport = exports.some((e) => e.source.includes('node_modules') || !e.source.startsWith('.'))
                if (isReExport) {
                  const warning = `Skipping re-export from external package: ${importName} in "${filePath}"`
                  console.log(`  ${warning}`)
                  if (warnings) {
                    warnings.push(warning)
                  }
                  remainingSpecifiers.push(specifier)
                  hasReExports = true
                  continue
                }
                const warning = `Could not find export ${importName} in ${filePath}`
                console.log(`  Warning: ${warning}`)
                if (warnings) {
                  warnings.push(warning)
                }
                remainingSpecifiers.push(specifier)
              }
            } else {
              remainingSpecifiers.push(specifier)
            }
          }

          // If we have no direct exports to migrate, keep the original import
          if (!hasDirectExports) {
            console.log('  Keeping original import due to no direct exports to migrate')
            processedImports.add(importSource)
            return
          }

          // Create new import declarations
          const newImports: ImportDeclaration[] = []

          // Add remaining imports first (including re-exports)
          if (remainingSpecifiers.length > 0) {
            newImports.push(importDeclaration(remainingSpecifiers, stringLiteral(packageName)))
          }

          // Add grouped imports for direct exports
          for (const [importPath, specifiers] of importsBySource.entries()) {
            newImports.push(
              importDeclaration(
                specifiers.map((s) => importSpecifier(s.local, s.imported)),
                stringLiteral(importPath)
              )
            )
          }

          path.replaceWithMultiple(newImports)
          console.log('  Replaced import with direct imports from source files')
          // Mark the original import as processed
          processedImports.add(importSource)
        }
      }
    })

    if (modified) {
      console.log(`Writing changes to ${filePath}`)
      const output = generate(
        ast,
        {
          retainLines: true,
          retainFunctionParens: true
        },
        content
      )
      writeFileSync(filePath, output.code)
    } else if (importCount > 0) {
      console.log(`No changes needed for ${importCount} imports`)
    } else {
      console.log('No imports found to update')
    }
  } catch (error) {
    if (stats) {
      stats.errors++
    }
    console.error(`Error processing ${filePath}:`, error)
  }
}

/**
 * Main migration function that orchestrates the barrel file migration process
 *
 * Process flow:
 * 1. Finds all source packages matching the glob pattern
 * 2. For each package:
 *    - Reads package.json to get package name and configuration
 *    - Scans source package for all exports (named and default)
 *    - Finds all files in the monorepo that import from the package
 *    - Updates each import to point directly to source files
 *
 * @param {Options} options - Migration configuration options
 * @returns {Promise<void>}
 */
export async function migrateBarrelImports(options: MigrationOptions): Promise<void> {
  const { sourcePath, targetPath, ignoreSourceFiles, ignoreTargetFiles } = options

  // Track migration statistics
  const stats: MigrationStats = {
    totalFiles: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    importsUpdated: 0,
    filesWithNoUpdates: 0,
    errors: 0,
    totalExports: 0,
    sourceFilesScanned: 0,
    sourceFilesWithExports: 0,
    sourceFilesSkipped: 0,
    targetFilesFound: [],
    packagesProcessed: 0,
    packagesSkipped: 0,
    warnings: []
  }

  // Find all directories matching the glob pattern
  const sourceDirs = await fg(sourcePath, {
    cwd: targetPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/target-app/**'],
    followSymbolicLinks: false,
    onlyDirectories: true
  })

  // Find package.json files in the matched directories
  const packageJsonPaths: string[] = []
  for (const dir of sourceDirs) {
    const packageJsonPath = path.join(dir, 'package.json')
    try {
      await fs.promises.access(packageJsonPath)
      packageJsonPaths.push(packageJsonPath)
    } catch {
      console.log(`No package.json found in ${dir}, skipping`)
    }
  }

  console.log(`Found ${packageJsonPaths.length} source packages to process`)

  for (const packageJsonPath of packageJsonPaths) {
    try {
      const packageDir = path.dirname(packageJsonPath)
      console.log(`\nProcessing package: ${packageDir}`)
      const packageInfo = await getPackageInfo(packageDir)
      const exports = await findExports({
        packagePath: packageDir,
        ignoreSourceFiles: ignoreSourceFiles,
        stats
      })

      // Calculate total number of unique exports and source files
      stats.totalExports += exports.reduce((total, exp) => total + exp.exports.length, 0)
      stats.sourceFilesWithExports += new Set(exports.map((exp) => exp.source)).size
      stats.sourceFilesScanned += (
        await fg('**/*.{ts,tsx}', {
          cwd: packageDir,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
        })
      ).length

      const files = await findImports({
        packageName: packageInfo.name,
        monorepoRoot: targetPath
      })

      stats.totalFiles += files.length
      stats.targetFilesFound.push(...files)

      for (const file of files) {
        const relativeFile = path.relative(targetPath, file)
        if (ignoreTargetFiles.some((pattern) => micromatch.isMatch(relativeFile, pattern))) {
          console.log(`Skipping ignored file: ${file} (matches pattern in ${ignoreTargetFiles.join(', ')})`)
          stats.filesSkipped++
          continue
        }

        try {
          const originalContent = readFileSync(file, 'utf-8')
          await updateImports({
            filePath: file,
            packageName: packageInfo.name,
            exports: exports,
            includeExtension: options.includeExtension,
            warnings: stats.warnings,
            stats
          })
          const updatedContent = readFileSync(file, 'utf-8')

          if (originalContent !== updatedContent) {
            stats.importsUpdated++
          } else {
            stats.filesWithNoUpdates++
          }
          stats.filesProcessed++
        } catch (error) {
          stats.errors++
          console.error(`Error processing ${file}:`, error)
        }
      }

      stats.packagesProcessed++
    } catch (error) {
      stats.packagesSkipped++
      console.error(`Error processing package ${packageJsonPath}:`, error)
    }
  }

  // Print migration summary
  console.log('\nMigration Summary')
  console.log(`Source packages found: ${packageJsonPaths.length}`)
  console.log(`Source packages processed: ${stats.packagesProcessed}`)
  console.log(`Source packages skipped: ${stats.packagesSkipped}`)
  console.log(`Source files found: ${stats.sourceFilesScanned}`)
  console.log(`Source files with exports: ${stats.sourceFilesWithExports}`)
  console.log(`Source files skipped: ${stats.sourceFilesSkipped}`)
  console.log(`Exports found: ${stats.totalExports}`)
  console.log(`Target files found: ${stats.totalFiles}`)
  console.log(`Target files processed: ${stats.filesProcessed}`)
  console.log(`Target files with imports updated: ${stats.importsUpdated}`)
  console.log(`Target files with no changes needed: ${stats.filesWithNoUpdates}`)
  console.log(`Target files skipped: ${stats.filesSkipped}`)

  if (stats.warnings.length > 0) {
    console.log('\nWarnings:')
    for (const warning of stats.warnings) {
      console.log(`  - ${warning}`)
    }
  }

  if (stats.errors > 0) {
    console.log(`\nWarning: ${stats.errors} errors encountered during processing`)
  }
}
