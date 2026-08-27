# Changelog

## [4.0.1](https://github.com/brandhaug/migrate-barrel-imports/compare/v4.0.0...v4.0.1) (2026-08-26)

### Bug Fixes

- **migrate:** derive changedFiles from updated files so each file is listed once ([#46](https://github.com/brandhaug/migrate-barrel-imports/issues/46)) ([f465e07](https://github.com/brandhaug/migrate-barrel-imports/commit/f465e07815611bbc2fff36e757c47dfea09bd114))
- **migrate:** only exclude self-imports from the target scan ([#45](https://github.com/brandhaug/migrate-barrel-imports/issues/45)) ([3fda414](https://github.com/brandhaug/migrate-barrel-imports/commit/3fda414394734341388e08c54233779fd5194ab7))

## [4.0.0](https://github.com/brandhaug/migrate-barrel-imports/compare/v3.0.0...v4.0.0) (2026-08-26)

### ⚠ BREAKING CHANGES

- files inside the source directories are no longer rewritten, even when target-path contains them.

### Features

- **cli:** add --json flag for machine-readable output ([#40](https://github.com/brandhaug/migrate-barrel-imports/issues/40)) ([bb11307](https://github.com/brandhaug/migrate-barrel-imports/commit/bb113076a3137f24d6ea3de191614c73ed244222))
- **cli:** add --quiet and --verbose output verbosity control ([#38](https://github.com/brandhaug/migrate-barrel-imports/issues/38)) ([f6ab2c0](https://github.com/brandhaug/migrate-barrel-imports/commit/f6ab2c08bd05f21c1099152645c6c600be6a91c4))
- **dry-run:** print a diff of changed import statements ([#37](https://github.com/brandhaug/migrate-barrel-imports/issues/37)) ([6d9cfef](https://github.com/brandhaug/migrate-barrel-imports/commit/6d9cfefe0f8fa4c6aa6023b0b20d9e75cd122212))
- exclude source dirs from target scan and add --target-glob ([#34](https://github.com/brandhaug/migrate-barrel-imports/issues/34)) ([796f706](https://github.com/brandhaug/migrate-barrel-imports/commit/796f70678ad72b310c781ece9d3a72cc3c15fd0f))
- **migrate:** skip barrel files as rewrite targets by default ([#39](https://github.com/brandhaug/migrate-barrel-imports/issues/39)) ([3aa54d5](https://github.com/brandhaug/migrate-barrel-imports/commit/3aa54d5bb9e5b67ced9e89fdd3b42f51b9f7cc53))

### Bug Fixes

- **cli:** validate source-path as a directory and skip prompts without a TTY ([#42](https://github.com/brandhaug/migrate-barrel-imports/issues/42)) ([39ab801](https://github.com/brandhaug/migrate-barrel-imports/commit/39ab801badf1fdc72a4511753636b118f1a08b4d))
- **detection:** only classify entry points or pure re-export files as barrels ([#33](https://github.com/brandhaug/migrate-barrel-imports/issues/33)) ([11b655e](https://github.com/brandhaug/migrate-barrel-imports/commit/11b655e78e1df49ce386135f4eb7a0376af70b8c))
- **exports:** deduplicate collected exports and resolve one canonical source ([#36](https://github.com/brandhaug/migrate-barrel-imports/issues/36)) ([9c61db2](https://github.com/brandhaug/migrate-barrel-imports/commit/9c61db2d3bc2a048fb3e06de2e0005b0c2b43721))
- make migration summary counters internally consistent ([#43](https://github.com/brandhaug/migrate-barrel-imports/issues/43)) ([9a15765](https://github.com/brandhaug/migrate-barrel-imports/commit/9a15765bd75fa8b57250bfbfb27618dd572b499b))
- **migration:** keep migrating when a file cannot be parsed ([#35](https://github.com/brandhaug/migrate-barrel-imports/issues/35)) ([0184f6e](https://github.com/brandhaug/migrate-barrel-imports/commit/0184f6ea13f223df416e21bf8f7e990b82a3d7fc))
- **parser:** enable jsx plugin only for .tsx/.jsx files ([#32](https://github.com/brandhaug/migrate-barrel-imports/issues/32)) ([b70c4c0](https://github.com/brandhaug/migrate-barrel-imports/commit/b70c4c0631b0f248465ae84362d7790f938d2e56))

## [3.0.0](https://github.com/brandhaug/migrate-barrel-imports/compare/v2.1.0...v3.0.0) (2026-08-24)

### ⚠ BREAKING CHANGES

- replace commander with @clack/prompts ([#24](https://github.com/brandhaug/migrate-barrel-imports/issues/24))

### Features

- add support for glob pattern in source path argument ([224388c](https://github.com/brandhaug/migrate-barrel-imports/commit/224388c067a0e1e47fac839031ece1de5e16b614))
- add support for js files ([d3b9793](https://github.com/brandhaug/migrate-barrel-imports/commit/d3b9793fb5aae6b8ef688329caad4e8dcc67de9f))
- bundle optimization ([7de5c11](https://github.com/brandhaug/migrate-barrel-imports/commit/7de5c11327f59af3df45eb590650bb1a4274b103))
- **cli:** support non-interactive CLI arguments ([#27](https://github.com/brandhaug/migrate-barrel-imports/issues/27)) ([4fa3fd8](https://github.com/brandhaug/migrate-barrel-imports/commit/4fa3fd8e8a22e1734cc790fd9aab334a9eeb6cdb))
- force release ([18c24f0](https://github.com/brandhaug/migrate-barrel-imports/commit/18c24f0c5d5997fa05be9f503b91f7bee6e68197))
- handle complex cases ([b46275e](https://github.com/brandhaug/migrate-barrel-imports/commit/b46275e4d57a0b16dd5c3f8297cad189cc122c2c))
- handle enums, types, interfaces, classes etc ([7f3d63b](https://github.com/brandhaug/migrate-barrel-imports/commit/7f3d63bcaa27752cbd58188ffbf38012defd58ae))
- lint and formatting ([3d7f72d](https://github.com/brandhaug/migrate-barrel-imports/commit/3d7f72df889a0ba51986174a19d363d0c2e86f9a))
- replace commander with @clack/prompts ([#24](https://github.com/brandhaug/migrate-barrel-imports/issues/24)) ([a7bc7e2](https://github.com/brandhaug/migrate-barrel-imports/commit/a7bc7e216eeda9bd0a72f467b082f198dc923f36))

### Bug Fixes

- add missing @types/node and build step to PR checks ([#6](https://github.com/brandhaug/migrate-barrel-imports/issues/6)) ([663c719](https://github.com/brandhaug/migrate-barrel-imports/commit/663c719b95ca064b1302bce468c74d5e1c8278d2))
- babel types ([cf129b0](https://github.com/brandhaug/migrate-barrel-imports/commit/cf129b0a7dc49285c98aa0838fdbb5afab0d876f))
- restore tooling removed by mistake, trim AGENTS.md ([#4](https://github.com/brandhaug/migrate-barrel-imports/issues/4)) ([1b00bd5](https://github.com/brandhaug/migrate-barrel-imports/commit/1b00bd53981315e411d5c52566ebce5a4fd97e2e))
- retain lines ([c242ddb](https://github.com/brandhaug/migrate-barrel-imports/commit/c242ddb44e9c135531b7e881f6928baafaba620d))
- set package version to match npm registry ([#2](https://github.com/brandhaug/migrate-barrel-imports/issues/2)) ([892363c](https://github.com/brandhaug/migrate-barrel-imports/commit/892363c436d19123723a4d8e6d3a74fb8f9abe24))

## [2.1.0](https://github.com/brandhaug/migrate-barrel-imports/compare/v2.0.0...v2.1.0) (2026-08-24)

### Features

- **cli:** support non-interactive CLI arguments ([#27](https://github.com/brandhaug/migrate-barrel-imports/issues/27)) ([4fa3fd8](https://github.com/brandhaug/migrate-barrel-imports/commit/4fa3fd8e8a22e1734cc790fd9aab334a9eeb6cdb))

## [2.1.0](https://github.com/brandhaug/migrate-barrel-imports/compare/v2.0.0...v2.1.0) (2026-08-23)

### Features

- **cli:** support non-interactive CLI arguments ([#27](https://github.com/brandhaug/migrate-barrel-imports/issues/27)) ([74d8992](https://github.com/brandhaug/migrate-barrel-imports/commit/74d8992ec45889ce8db5b06482278d8c89437ae9))

## [2.0.0](https://github.com/brandhaug/migrate-barrel-imports/compare/v1.7.3...v2.0.0) (2026-08-22)

### ⚠ BREAKING CHANGES

- replace commander with @clack/prompts ([#24](https://github.com/brandhaug/migrate-barrel-imports/issues/24))

### Features

- replace commander with @clack/prompts ([#24](https://github.com/brandhaug/migrate-barrel-imports/issues/24)) ([ff45102](https://github.com/brandhaug/migrate-barrel-imports/commit/ff4510201526a8885acb40f486536a904a5c3f0d))

## [1.7.3](https://github.com/brandhaug/migrate-barrel-imports/compare/v1.7.2...v1.7.3) (2026-04-09)

### Bug Fixes

- add missing @types/node and build step to PR checks ([#6](https://github.com/brandhaug/migrate-barrel-imports/issues/6)) ([663c719](https://github.com/brandhaug/migrate-barrel-imports/commit/663c719b95ca064b1302bce468c74d5e1c8278d2))

## [1.7.2](https://github.com/brandhaug/migrate-barrel-imports/compare/v1.7.1...v1.7.2) (2026-04-09)

### Bug Fixes

- restore tooling removed by mistake, trim AGENTS.md ([#4](https://github.com/brandhaug/migrate-barrel-imports/issues/4)) ([1b00bd5](https://github.com/brandhaug/migrate-barrel-imports/commit/1b00bd53981315e411d5c52566ebce5a4fd97e2e))
