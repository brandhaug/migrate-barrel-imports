import { Command } from 'commander'
import { migrateBarrelImports } from './migrate-barrel-imports'
import { defaultOptions } from './options'

export async function main(): Promise<void> {
  const program = new Command()

  program
    .name('migrate-barrel-imports')
    .description('CLI tool to migrate barrel files imports to direct imports')
    .argument('<source-path>', 'Path to the package containing barrel files')
    .argument('[target-path]', 'Path to the directory where imports should be migrated (default: current directory)')
    .option('--ignore-source-files <patterns>', 'Comma-separated list of file patterns to ignore in source directory')
    .option('--ignore-target-files <patterns>', 'Comma-separated list of file patterns to ignore in target directory')
    .option('--no-extension', 'Exclude js|jsx|ts|tsx|mjs|cjs file extensions from import statements')
    .allowUnknownOption(false)
    .parse(process.argv)

  const args = program.args
  if (!args[0]) {
    console.error('Error: source-path is required')
    process.exit(1)
  }

  const sourcePath = args[0]
  const targetPath = args[1] || defaultOptions.targetPath
  const options = program.opts()

  await migrateBarrelImports({
    sourcePath,
    targetPath,
    ignoreSourceFiles: options.ignoreSourceFiles
      ? options.ignoreSourceFiles.split(',')
      : defaultOptions.ignoreSourceFiles,
    ignoreTargetFiles: options.ignoreTargetFiles
      ? options.ignoreTargetFiles.split(',')
      : defaultOptions.ignoreTargetFiles,
    includeExtension: options.extension !== false ? true : defaultOptions.includeExtension
  })
}
