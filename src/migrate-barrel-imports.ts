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
import path from 'node:path'
import _generate from '@babel/generator'
import type { ParserOptions } from '@babel/parser'
import { parse } from '@babel/parser'
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
  isImportDefaultSpecifier,
  isImportNamespaceSpecifier,
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
 * @property {Record<string, string>} [reExports] - Map of export names to their original source package
 * @property {Record<string, string>} [exportSources] - Map of export names to their source files
 * @property {string[]} [defaultExportNames] - Names of entities exported as default
 * @property {boolean} [isBarrelFile] - Whether this file is a barrel file
 * @property {Record<string, string[]>} [exportFiles] - Map of export names to all files that export them
 */
interface ExportInfo {
  source: string
  exports: string[]
  isIgnored?: boolean
  reExports?: Record<string, string>
  exportSources?: Record<string, string>
  defaultExportNames?: string[]
  isBarrelFile?: boolean
  exportFiles?: Record<string, string[]>
}

interface MigrationStats {
  sourcePackagesFound: number
  sourcePackagesProcessed: number
  sourcePackagesSkipped: number
  sourceFilesFound: number
  sourceFilesWithExports: number
  sourceFilesSkipped: number
  exportsFound: number
  targetFilesFound: number
  targetFilesProcessed: number
  importsUpdated: number
  noChangesNeeded: number
  targetFilesSkipped: number
  importsMigrated: number
}

interface FindExportsParams {
  packagePath: string
  ignoreSourceFiles?: string[]
  stats?: MigrationStats
}

interface FindImportsParams {
  packageName: string
  targetPath: string
  stats?: MigrationStats
}

interface ImportSpec {
  local: ImportSpecifier['local']
  imported: ImportSpecifier['imported']
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
 * Checks if a file is a barrel file by analyzing its exports
 *
 * @param {string} filePath - Path to the file to check
 * @returns {Promise<boolean>} Whether the file is a barrel file
 */
async function isBarrelFile(filePath: string): Promise<boolean> {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const ast = parse(content, BABEL_CONFIG)
    let hasReExports = false
    let hasDirectExports = false

    traverse(ast, {
      ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
        if (path.node.source) {
          hasReExports = true
        } else {
          hasDirectExports = true
        }
      },
      ExportDefaultDeclaration() {
        hasDirectExports = true
      }
    })

    // A barrel file typically has re-exports and may or may not have direct exports
    return hasReExports
  } catch (error) {
    console.error(`Error checking if ${filePath} is a barrel file:`, error)
    return false
  }
}

/**
 * Recursively finds all exports in a package by scanning all TypeScript files
 *
 * This function:
 * 1. Scans all .ts and .tsx files in the package
 * 2. Identifies both named exports and default exports
 * 3. Skips re-exports to avoid circular dependencies
 * 4. Filters out ignored files based on patterns
 * 5. Handles barrel files by tracking their re-exports
 *
 * @param {FindExportsParams} params - Parameters for finding exports
 * @returns {Promise<ExportInfo[]>} Array of export information, including source file and exported names
 */
async function findExports({ packagePath, ignoreSourceFiles = [], stats }: FindExportsParams): Promise<ExportInfo[]> {
  const exports: ExportInfo[] = []
  const barrelFiles = new Set<string>()
  const processedFiles = new Set<string>()
  const exportSources: Record<string, string> = {}
  const exportFiles: Record<string, string[]> = {}

  console.log(`Scanning for TypeScript and JavaScript files in: ${packagePath}`)
  const allFiles = await fg('**/*.{ts,tsx,js,jsx}', {
    cwd: packagePath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
  })
  console.log(`Found ${allFiles.length} files`)

  // First pass: identify barrel files
  for (const file of allFiles) {
    const fullPath = path.join(packagePath, file)
    if (await isBarrelFile(fullPath)) {
      barrelFiles.add(file)
      console.log(`Identified barrel file: ${file}`)
    }
  }

  // Second pass: process all files
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
      const fileExports: string[] = []
      const reExports: Record<string, string> = {}
      const fileExportSources: Record<string, string> = {}
      const defaultExportNames: string[] = []

      traverse(ast, {
        ExportNamedDeclaration(nodePath: NodePath<ExportNamedDeclaration>) {
          // Handle re-exports from external packages
          if (nodePath.node.source) {
            const sourceValue = nodePath.node.source.value
            if (sourceValue.includes('node_modules') || !sourceValue.startsWith('.')) {
              // Extract export names and their original source
              nodePath.node.specifiers.forEach((specifier) => {
                if (isExportSpecifier(specifier)) {
                  const exported = specifier.exported
                  const exportName = isIdentifier(exported) ? exported.name : exported.value
                  reExports[exportName] = sourceValue
                  fileExports.push(exportName)
                  fileExportSources[exportName] = file

                  // Track all files that export this symbol
                  if (!exportFiles[exportName]) {
                    exportFiles[exportName] = []
                  }
                  exportFiles[exportName].push(file)
                }
              })
              return
            }
          }

          // Handle variable declarations with exports
          if (nodePath.node.declaration) {
            const exportNames = getExportNames(nodePath.node.declaration)
            if (exportNames.length > 0) {
              fileExports.push(...exportNames)
              exportNames.forEach((name) => {
                fileExportSources[name] = file

                // Track all files that export this symbol
                if (!exportFiles[name]) {
                  exportFiles[name] = []
                }
                exportFiles[name].push(file)
              })
            }
          }

          // Handle export specifiers
          const exportNames = nodePath.node.specifiers
            .map((s) => {
              if (isExportSpecifier(s)) {
                const exported = s.exported
                const exportName = isIdentifier(exported) ? exported.name : exported.value
                if (nodePath.node.source) {
                  // If it's a re-export from another file, track the source
                  const sourceValue = nodePath.node.source.value
                  if (sourceValue.startsWith('.')) {
                    const resolvedPath = path.join(path.dirname(file), sourceValue)
                    fileExportSources[exportName] = resolvedPath.replace(/\.[^/.]+$/, '')

                    // Track all files that export this symbol
                    if (!exportFiles[exportName]) {
                      exportFiles[exportName] = []
                    }
                    exportFiles[exportName].push(file)
                  }
                }
                return exportName
              }
              return null
            })
            .filter((name: string | null): name is string => name !== null)

          if (exportNames.length > 0) {
            fileExports.push(...exportNames)
            exportNames.forEach((name) => {
              if (!fileExportSources[name]) {
                fileExportSources[name] = file
              }
            })
          }
        },
        ExportDefaultDeclaration(path: NodePath<ExportDefaultDeclaration>) {
          const exported = path.node.declaration
          const exportName = isIdentifier(exported)
            ? exported.name
            : isFunctionDeclaration(exported) && exported.id
              ? exported.id.name
              : isClassDeclaration(exported) && exported.id
                ? exported.id.name
                : 'default'

          fileExports.push(exportName)
          fileExportSources[exportName] = file

          // If this is a named entity (class, function) being exported as default, track its name
          if (exportName !== 'default') {
            defaultExportNames.push(exportName)
          }
        }
      })

      if (fileExports.length > 0 || Object.keys(reExports).length > 0) {
        exports.push({
          source: file,
          exports: fileExports,
          isIgnored,
          ...(Object.keys(reExports).length > 0 && { reExports }),
          ...(Object.keys(fileExportSources).length > 0 && { exportSources: fileExportSources }),
          ...(defaultExportNames.length > 0 && { defaultExportNames }),
          ...((await isBarrelFile(fullPath)) && { isBarrelFile: true }),
          ...(Object.keys(exportFiles).length > 0 && { exportFiles })
        })

        // Print exports in a single line
        if (fileExports.length > 0) {
          console.log(`Found exports ${fileExports.join(', ')} in ${file}`)
        }
      }
    } catch (error) {
      console.error(`Error parsing ${file}:`, error)
    }
  }

  console.log(`\nTotal exports found: ${exports.length}`)
  console.log(`Barrel files found: ${barrelFiles.size}`)
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
async function findImports({ packageName, targetPath, stats }: FindImportsParams): Promise<string[]> {
  try {
    const allFiles = new Set<string>()

    // Find all TypeScript and JavaScript files in the monorepo
    const files = await fg(['**/*.{ts,tsx,js,jsx}'], {
      cwd: targetPath,
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
  let modified = false

  try {
    const ast = parse(content, BABEL_CONFIG)
    const importDeclarations: ImportDeclaration[] = []

    // First pass: collect all import declarations
    traverse(ast, {
      ImportDeclaration(path: NodePath<ImportDeclaration>) {
        const importSource = path.node.source.value
        if (importSource.startsWith(packageName)) {
          importDeclarations.push(path.node)
        }
      }
    })

    const importsBySource = new Map<string, ImportSpec[]>()
    const remainingSpecifiers: Array<ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier> = []

    for (const declaration of importDeclarations) {
      const importSource = declaration.source.value
      const specifiers = declaration.specifiers

      for (const specifier of specifiers) {
        if (isImportSpecifier(specifier)) {
          const imported = specifier.imported
          const importName = isIdentifier(imported) ? imported.name : imported.value
          const exportInfo = exports.find((e) => e.exports.includes(importName))

          if (exportInfo) {
            if (exportInfo.isIgnored) {
              remainingSpecifiers.push(specifier)
              continue
            }

            // Check if this is a re-export from an external package
            if (exportInfo.reExports?.[importName]) {
              const reExportSource = exportInfo.reExports[importName]
              if (!reExportSource.startsWith('.')) {
                // Keep the original import from the external package
                const sourcePath = reExportSource
                if (!importsBySource.has(sourcePath)) {
                  importsBySource.set(sourcePath, [])
                }
                importsBySource.get(sourcePath)?.push({ local: specifier.local, imported: specifier.imported })
                modified = true
                continue
              }
            }

            // Then check if it's a direct export from index.ts
            if (
              exportInfo.source === 'src/index.ts' &&
              exportInfo.exports.includes(importName) &&
              !exportInfo.reExports?.[importName]
            ) {
              // Handle entities that are exported as default
              const isDefaultExportedEntity = exportInfo.defaultExportNames?.includes(importName)

              if (isDefaultExportedEntity) {
                // For entities that are exported as default, import directly from the package
                const sourcePath = packageName
                if (!importsBySource.has(sourcePath)) {
                  importsBySource.set(sourcePath, [])
                }
                importsBySource.get(sourcePath)?.push({ local: specifier.local, imported: specifier.imported })
                modified = true
                continue
              }

              // Check if this is a named export or default export
              if (importName !== 'default') {
                // For each named export from index.ts, create a separate import source path
                const sourcePath = includeExtension
                  ? `${packageName}/${exportInfo.source}`
                  : `${packageName}/${exportInfo.source.replace(/\.[^/.]+$/, '')}`

                if (!importsBySource.has(sourcePath)) {
                  importsBySource.set(sourcePath, [])
                }
                importsBySource.get(sourcePath)?.push({ local: specifier.local, imported: specifier.imported })
                modified = true
                continue
              }
            }

            // Find the best source file for this export
            const exportFiles = exportInfo.exportFiles?.[importName] || []
            let bestSourceFile = exportFiles[0] // Default to first file if no better option

            // Prefer main source files over auxiliary files
            if (exportFiles.length > 1) {
              // Remove story files, test files, and other auxiliary files from consideration
              const mainFiles = exportFiles.filter(
                (file: string) =>
                  !file.includes('.stories.') &&
                  !file.includes('.test.') &&
                  !file.includes('.spec.') &&
                  !file.includes('.stories/') &&
                  !file.includes('.test/') &&
                  !file.includes('.spec/')
              )

              if (mainFiles.length > 0) {
                bestSourceFile = mainFiles[0]
              }
            }

            if (bestSourceFile) {
              const sourcePath = includeExtension
                ? `${packageName}/${bestSourceFile}`
                : `${packageName}/${bestSourceFile.replace(/\.[^/.]+$/, '')}`

              // Check if this import is aliased and if we already have the original import
              const isAliased = specifier.local.name !== importName
              const hasOriginalImport = Array.from(importsBySource.values()).some((specs) =>
                specs.some((spec) => spec.imported && isIdentifier(spec.imported) && spec.imported.name === importName)
              )

              // Only add the import if it's not aliased or if we don't have the original import yet
              if (!isAliased || !hasOriginalImport) {
                if (!importsBySource.has(sourcePath)) {
                  importsBySource.set(sourcePath, [])
                }
                importsBySource.get(sourcePath)?.push({ local: specifier.local, imported: specifier.imported })
                modified = true
              }
              continue
            }

            remainingSpecifiers.push(specifier)
          } else if (isImportDefaultSpecifier(specifier) || isImportNamespaceSpecifier(specifier)) {
            remainingSpecifiers.push(specifier)
          }
        }
      }
    }

    // Second pass: update the AST with new imports
    traverse(ast, {
      ImportDeclaration(path: NodePath<ImportDeclaration>) {
        const importSource = path.node.source.value
        if (importSource.startsWith(packageName)) {
          // Remove the original import declaration
          path.remove()
        }
      }
    })

    // Add new import declarations
    const newImports: ImportDeclaration[] = []
    for (const [source, specifiers] of importsBySource) {
      if (specifiers.length > 0) {
        newImports.push(
          importDeclaration(
            specifiers.map(({ local, imported }) => importSpecifier(local, imported)),
            stringLiteral(source)
          )
        )
        if (stats) {
          stats.importsMigrated += specifiers.length
        }
      }
    }

    // Add remaining specifiers if any
    if (remainingSpecifiers.length > 0) {
      newImports.push(importDeclaration(remainingSpecifiers, stringLiteral(packageName)))
    }

    // Add all new imports at the top of the file
    if (newImports.length > 0) {
      ast.program.body.unshift(...newImports)
      modified = true
    }

    if (modified) {
      // Write changes back to file
      const output = generate(
        ast,
        {
          // To avoid removing spaces in code
          retainLines: true,
          retainFunctionParens: true
        },
        content
      ).code
      writeFileSync(filePath, output)
      console.log(`Writing changes to ${filePath}`)

      if (stats) {
        stats.importsUpdated++
      }
    } else if (stats) {
      stats.noChangesNeeded++
    }
  } catch (error) {
    console.error(`Error updating imports in ${filePath}:`, error)
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
  const { sourcePath, targetPath, includeExtension = true } = options

  // Track migration statistics
  const stats: MigrationStats = {
    sourcePackagesFound: 0,
    sourcePackagesProcessed: 0,
    sourcePackagesSkipped: 0,
    sourceFilesFound: 0,
    sourceFilesWithExports: 0,
    sourceFilesSkipped: 0,
    exportsFound: 0,
    targetFilesFound: 0,
    targetFilesProcessed: 0,
    importsUpdated: 0,
    noChangesNeeded: 0,
    targetFilesSkipped: 0,
    importsMigrated: 0
  }

  // Track warnings
  const warnings: string[] = []

  try {
    // Find source packages
    const sourcePackages = await findSourcePackages(sourcePath)
    stats.sourcePackagesFound = sourcePackages.length

    for (const packagePath of sourcePackages) {
      console.log(`\nProcessing package: ${packagePath}`)

      // Find exports in source package
      const exports = await findExports({ packagePath, stats })
      stats.exportsFound = exports.reduce((total, info) => total + info.exports.length, 0)
      stats.sourceFilesWithExports = exports.length

      // Find files that import from this package
      const packageName = await getPackageName(packagePath)
      const targetFiles = await findImports({ packageName, targetPath, stats })
      stats.targetFilesFound = targetFiles.length

      // Update imports in target files
      for (const filePath of targetFiles) {
        stats.targetFilesProcessed++
        await updateImports({
          filePath,
          packageName,
          exports,
          includeExtension,
          warnings,
          stats
        })
      }

      stats.sourcePackagesProcessed++
    }

    // Print migration summary
    console.log('\nMigration Summary')
    console.log(`Source packages found: ${stats.sourcePackagesFound}`)
    console.log(`Source packages processed: ${stats.sourcePackagesProcessed}`)
    console.log(`Source packages skipped: ${stats.sourcePackagesSkipped}`)
    console.log(`Source files found: ${stats.sourceFilesFound}`)
    console.log(`Source files with exports: ${stats.sourceFilesWithExports}`)
    console.log(`Source files skipped: ${stats.sourceFilesSkipped}`)
    console.log(`Exports found: ${stats.exportsFound}`)
    console.log(`Target files found: ${stats.targetFilesFound}`)
    console.log(`Target files processed: ${stats.targetFilesProcessed}`)
    console.log(`Target files with imports updated: ${stats.importsUpdated}`)
    console.log(`Target files with no changes needed: ${stats.noChangesNeeded}`)
    console.log(`Target files skipped: ${stats.targetFilesSkipped}`)
    console.log(`Total imports migrated: ${stats.importsMigrated}`)

    if (warnings.length > 0) {
      console.log('\nWarnings:')
      warnings.forEach((warning) => console.log(`  - ${warning}`))
    }
  } catch (error) {
    console.error('Error during migration:', error)
    throw error
  }
}

/**
 * Gets the package name from package.json
 *
 * @param {string} packagePath - Path to the package directory
 * @returns {Promise<string>} Package name
 */
async function getPackageName(packagePath: string): Promise<string> {
  const packageJsonPath = path.join(packagePath, 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  return packageJson.name
}

/**
 * Finds all source packages in the given path
 *
 * @param {string} sourcePath - Path to search for source packages
 * @returns {Promise<string[]>} Array of package paths
 */
async function findSourcePackages(sourcePath: string): Promise<string[]> {
  // Use a local variable instead of reassigning the parameter
  const resolvedPath = path.isAbsolute(sourcePath) ? path.resolve(sourcePath) : path.join(process.cwd(), sourcePath)

  console.log(`Looking for source packages in: ${resolvedPath}`)

  const packageJsonFiles = await fg('{package.json,**/package.json}', {
    cwd: resolvedPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    absolute: true
  })

  console.log(`Found ${packageJsonFiles.length} package.json files:`)
  packageJsonFiles.forEach((file) => console.log(`  - ${file}`))

  return packageJsonFiles.map(path.dirname)
}
