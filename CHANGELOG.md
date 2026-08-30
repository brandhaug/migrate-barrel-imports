# Changelog

## [5.0.1](https://github.com/brandhaug/migrate-barrel-imports/compare/migrate-barrel-imports-v5.0.0...migrate-barrel-imports-v5.0.1) (2026-08-30)


### Miscellaneous

* **deps:** bump @types/node from 26.2.0 to 26.3.0 ([#58](https://github.com/brandhaug/migrate-barrel-imports/issues/58)) ([42d6146](https://github.com/brandhaug/migrate-barrel-imports/commit/42d6146f1ece0fd9a45b304a85c8de5bfff111f2))
* **deps:** bump @types/node from 26.3.0 to 26.4.0 ([#60](https://github.com/brandhaug/migrate-barrel-imports/issues/60)) ([bf7e819](https://github.com/brandhaug/migrate-barrel-imports/commit/bf7e8191c5054b3acc8f9649b342914b4ea3ae60))
* **deps:** bump oxlint from 1.79.0 to 1.80.0 ([#54](https://github.com/brandhaug/migrate-barrel-imports/issues/54)) ([0d4a8fc](https://github.com/brandhaug/migrate-barrel-imports/commit/0d4a8fc1f39000dacdc2985d4e69ccecb0f45155))
* **deps:** bump ultracite from 7.10.6 to 7.10.7 ([#61](https://github.com/brandhaug/migrate-barrel-imports/issues/61)) ([966a4f3](https://github.com/brandhaug/migrate-barrel-imports/commit/966a4f36b1670d0b24884458f722ea3ff3b586fb))
* enable strict oxlint rules and fix violations ([#56](https://github.com/brandhaug/migrate-barrel-imports/issues/56)) ([fa4b55c](https://github.com/brandhaug/migrate-barrel-imports/commit/fa4b55c1fb7dcac1dbcf7dc28d2b77287ec0fd31))
* remove dead code and unused dependencies surfaced by fallow ([#64](https://github.com/brandhaug/migrate-barrel-imports/issues/64)) ([2206a22](https://github.com/brandhaug/migrate-barrel-imports/commit/2206a22a98ad921806c8376a1dc5967c771558be))

## [5.0.0](https://github.com/brandhaug/migrate-barrel-imports/compare/migrate-barrel-imports-v4.0.1...migrate-barrel-imports-v5.0.0) (2026-08-27)

### ⚠ BREAKING CHANGES

- files inside the source directories are no longer rewritten, even when target-path contains them.
- replace commander with @clack/prompts ([#24](https://github.com/brandhaug/migrate-barrel-imports/issues/24))

### Features

- add support for glob pattern in source path argument ([224388c](https://github.com/brandhaug/migrate-barrel-imports/commit/224388c067a0e1e47fac839031ece1de5e16b614))
- add support for js files ([d3b9793](https://github.com/brandhaug/migrate-barrel-imports/commit/d3b9793fb5aae6b8ef688329caad4e8dcc67de9f))
- bundle optimization ([7de5c11](https://github.com/brandhaug/migrate-barrel-imports/commit/7de5c11327f59af3df45eb590650bb1a4274b103))
- **cli:** add --json flag for machine-readable output ([#40](https://github.com/brandhaug/migrate-barrel-imports/issues/40)) ([bb11307](https://github.com/brandhaug/migrate-barrel-imports/commit/bb113076a3137f24d6ea3de191614c73ed244222))
- **cli:** add --quiet and --verbose output verbosity control ([#38](https://github.com/brandhaug/migrate-barrel-imports/issues/38)) ([f6ab2c0](https://github.com/brandhaug/migrate-barrel-imports/commit/f6ab2c08bd05f21c1099152645c6c600be6a91c4))
- **cli:** support non-interactive CLI arguments ([#27](https://github.com/brandhaug/migrate-barrel-imports/issues/27)) ([4fa3fd8](https://github.com/brandhaug/migrate-barrel-imports/commit/4fa3fd8e8a22e1734cc790fd9aab334a9eeb6cdb))
- **dry-run:** print a diff of changed import statements ([#37](https://github.com/brandhaug/migrate-barrel-imports/issues/37)) ([6d9cfef](https://github.com/brandhaug/migrate-barrel-imports/commit/6d9cfefe0f8fa4c6aa6023b0b20d9e75cd122212))
- exclude source dirs from target scan and add --target-glob ([#34](https://github.com/brandhaug/migrate-barrel-imports/issues/34)) ([796f706](https://github.com/brandhaug/migrate-barrel-imports/commit/796f70678ad72b310c781ece9d3a72cc3c15fd0f))
- force release ([18c24f0](https://github.com/brandhaug/migrate-barrel-imports/commit/18c24f0c5d5997fa05be9f503b91f7bee6e68197))
- handle complex cases ([b46275e](https://github.com/brandhaug/migrate-barrel-imports/commit/b46275e4d57a0b16dd5c3f8297cad189cc122c2c))
- handle enums, types, interfaces, classes etc ([7f3d63b](https://github.com/brandhaug/migrate-barrel-imports/commit/7f3d63bcaa27752cbd58188ffbf38012defd58ae))
- lint and formatting ([3d7f72d](https://github.com/brandhaug/migrate-barrel-imports/commit/3d7f72df889a0ba51986174a19d363d0c2e86f9a))
- **migrate:** skip barrel files as rewrite targets by default ([#39](https://github.com/brandhaug/migrate-barrel-imports/issues/39)) ([3aa54d5](https://github.com/brandhaug/migrate-barrel-imports/commit/3aa54d5bb9e5b67ced9e89fdd3b42f51b9f7cc53))
- replace commander with @clack/prompts ([#24](https://github.com/brandhaug/migrate-barrel-imports/issues/24)) ([a7bc7e2](https://github.com/brandhaug/migrate-barrel-imports/commit/a7bc7e216eeda9bd0a72f467b082f198dc923f36))

### Bug Fixes

- add missing @types/node and build step to PR checks ([#6](https://github.com/brandhaug/migrate-barrel-imports/issues/6)) ([663c719](https://github.com/brandhaug/migrate-barrel-imports/commit/663c719b95ca064b1302bce468c74d5e1c8278d2))
- babel types ([cf129b0](https://github.com/brandhaug/migrate-barrel-imports/commit/cf129b0a7dc49285c98aa0838fdbb5afab0d876f))
- **cli:** validate source-path as a directory and skip prompts without a TTY ([#42](https://github.com/brandhaug/migrate-barrel-imports/issues/42)) ([39ab801](https://github.com/brandhaug/migrate-barrel-imports/commit/39ab801badf1fdc72a4511753636b118f1a08b4d))
- **detection:** only classify entry points or pure re-export files as barrels ([#33](https://github.com/brandhaug/migrate-barrel-imports/issues/33)) ([11b655e](https://github.com/brandhaug/migrate-barrel-imports/commit/11b655e78e1df49ce386135f4eb7a0376af70b8c))
- **exports:** deduplicate collected exports and resolve one canonical source ([#36](https://github.com/brandhaug/migrate-barrel-imports/issues/36)) ([9c61db2](https://github.com/brandhaug/migrate-barrel-imports/commit/9c61db2d3bc2a048fb3e06de2e0005b0c2b43721))
- make migration summary counters internally consistent ([#43](https://github.com/brandhaug/migrate-barrel-imports/issues/43)) ([9a15765](https://github.com/brandhaug/migrate-barrel-imports/commit/9a15765bd75fa8b57250bfbfb27618dd572b499b))
- **migrate:** derive changedFiles from updated files so each file is listed once ([#46](https://github.com/brandhaug/migrate-barrel-imports/issues/46)) ([f465e07](https://github.com/brandhaug/migrate-barrel-imports/commit/f465e07815611bbc2fff36e757c47dfea09bd114))
- **migrate:** only exclude self-imports from the target scan ([#45](https://github.com/brandhaug/migrate-barrel-imports/issues/45)) ([3fda414](https://github.com/brandhaug/migrate-barrel-imports/commit/3fda414394734341388e08c54233779fd5194ab7))
- **migration:** keep migrating when a file cannot be parsed ([#35](https://github.com/brandhaug/migrate-barrel-imports/issues/35)) ([0184f6e](https://github.com/brandhaug/migrate-barrel-imports/commit/0184f6ea13f223df416e21bf8f7e990b82a3d7fc))
- **parser:** enable jsx plugin only for .tsx/.jsx files ([#32](https://github.com/brandhaug/migrate-barrel-imports/issues/32)) ([b70c4c0](https://github.com/brandhaug/migrate-barrel-imports/commit/b70c4c0631b0f248465ae84362d7790f938d2e56))
- restore tooling removed by mistake, trim AGENTS.md ([#4](https://github.com/brandhaug/migrate-barrel-imports/issues/4)) ([1b00bd5](https://github.com/brandhaug/migrate-barrel-imports/commit/1b00bd53981315e411d5c52566ebce5a4fd97e2e))
- retain lines ([c242ddb](https://github.com/brandhaug/migrate-barrel-imports/commit/c242ddb44e9c135531b7e881f6928baafaba620d))
- set package version to match npm registry ([#2](https://github.com/brandhaug/migrate-barrel-imports/issues/2)) ([892363c](https://github.com/brandhaug/migrate-barrel-imports/commit/892363c436d19123723a4d8e6d3a74fb8f9abe24))

### Documentation

- **agents:** sync AGENTS.md with bun tooling and trim ([#49](https://github.com/brandhaug/migrate-barrel-imports/issues/49)) ([63fc2c1](https://github.com/brandhaug/migrate-barrel-imports/commit/63fc2c17c58b729a46671ce697e711ac3ed34e92))
- sync README with current CLI and switch dev setup to bun ([#48](https://github.com/brandhaug/migrate-barrel-imports/issues/48)) ([7d1cbba](https://github.com/brandhaug/migrate-barrel-imports/commit/7d1cbbac72efc9771947f6dafb175385116b926f))

### Miscellaneous

- adopt Bun 1.4 with dependency catalogs and catalog-update automation ([#8](https://github.com/brandhaug/migrate-barrel-imports/issues/8)) ([b22745e](https://github.com/brandhaug/migrate-barrel-imports/commit/b22745ea7478fcc899cd12c2e1ef1e8c43fd30e5))
- align tooling with canonical setup ([#52](https://github.com/brandhaug/migrate-barrel-imports/issues/52)) ([293b485](https://github.com/brandhaug/migrate-barrel-imports/commit/293b4858f41eeceb2e6277f4eb52c74657c7dd37))
- bump deps ([7c58343](https://github.com/brandhaug/migrate-barrel-imports/commit/7c58343080bfccd122bc4a476cea6bbac96a3505))
- **deps:** bump @babel/generator from 7.28.0 to 8.0.0 ([#9](https://github.com/brandhaug/migrate-barrel-imports/issues/9)) ([bfd0c9b](https://github.com/brandhaug/migrate-barrel-imports/commit/bfd0c9b80ba95b2e8607242969de88f5f7b5e8f2))
- **deps:** bump @babel/parser from 7.28.0 to 8.0.4 ([#10](https://github.com/brandhaug/migrate-barrel-imports/issues/10)) ([df9c56d](https://github.com/brandhaug/migrate-barrel-imports/commit/df9c56dba19b7b7aff85d53af02d197e4c44c95a))
- **deps:** bump @babel/traverse from 7.28.0 to 8.0.4 ([#11](https://github.com/brandhaug/migrate-barrel-imports/issues/11)) ([59aaf7b](https://github.com/brandhaug/migrate-barrel-imports/commit/59aaf7b8786ae2b2c426b0639f26b8fa8b5ebf19))
- **deps:** bump @babel/types from 7.28.2 to 8.0.4 ([#12](https://github.com/brandhaug/migrate-barrel-imports/issues/12)) ([1534f10](https://github.com/brandhaug/migrate-barrel-imports/commit/1534f1099ca81af33b15de0ce72109f6e685ecff))
- **deps:** bump @types/micromatch from 4.0.9 to 4.0.10 ([#14](https://github.com/brandhaug/migrate-barrel-imports/issues/14)) ([8e6344d](https://github.com/brandhaug/migrate-barrel-imports/commit/8e6344d3123c9881a275a0af4dd249285f35e23f))
- **deps:** bump @types/node from 22.15.29 to 26.2.0 ([#15](https://github.com/brandhaug/migrate-barrel-imports/issues/15)) ([e2e196f](https://github.com/brandhaug/migrate-barrel-imports/commit/e2e196f92cd989998fcc2abb38be37c3e8def773))
- **deps:** bump commander from 14.0.0 to 15.0.0 ([#13](https://github.com/brandhaug/migrate-barrel-imports/issues/13)) ([bd51e08](https://github.com/brandhaug/migrate-barrel-imports/commit/bd51e089da853c2786d04b6e6eef3b69e2e9a79c))
- **deps:** bump execa from 9.6.0 to 10.0.1 ([#16](https://github.com/brandhaug/migrate-barrel-imports/issues/16)) ([a424c72](https://github.com/brandhaug/migrate-barrel-imports/commit/a424c72fe4419effc938bcb4e4833e867afb33a5))
- **deps:** bump oxfmt from 0.44.0 to 0.64.0 ([#17](https://github.com/brandhaug/migrate-barrel-imports/issues/17)) ([6a5d867](https://github.com/brandhaug/migrate-barrel-imports/commit/6a5d867f51cf3516c6288606ec4ee3c2cf882e33))
- **deps:** bump oxfmt from 0.64.0 to 0.65.0 ([#53](https://github.com/brandhaug/migrate-barrel-imports/issues/53)) ([593b32d](https://github.com/brandhaug/migrate-barrel-imports/commit/593b32d8da5ecfd9f235002b72400df3daa86f07))
- **deps:** bump oxlint from 1.59.0 to 1.79.0 ([#18](https://github.com/brandhaug/migrate-barrel-imports/issues/18)) ([c3dcc97](https://github.com/brandhaug/migrate-barrel-imports/commit/c3dcc971a1b7560c87b3676e91a9ed104c940b9e))
- **deps:** bump oxlint-tsgolint from 0.20.0 to 7.0.2001 ([#19](https://github.com/brandhaug/migrate-barrel-imports/issues/19)) ([7b394da](https://github.com/brandhaug/migrate-barrel-imports/commit/7b394da4433fc8011053604773f9d3b830ae48f6))
- **deps:** bump tsx from 4.20.3 to 4.23.12 ([#20](https://github.com/brandhaug/migrate-barrel-imports/issues/20)) ([d80eb13](https://github.com/brandhaug/migrate-barrel-imports/commit/d80eb13bc9257ce105916426ac8e16f5c53fdddd))
- **deps:** bump typescript from 5.9.2 to 7.0.2 ([#21](https://github.com/brandhaug/migrate-barrel-imports/issues/21)) ([bab2eaf](https://github.com/brandhaug/migrate-barrel-imports/commit/bab2eaf61a506bf2043fc822fdf6d3054b94f902))
- **deps:** bump vitest from 3.2.4 to 4.1.11 ([#22](https://github.com/brandhaug/migrate-barrel-imports/issues/22)) ([4374b09](https://github.com/brandhaug/migrate-barrel-imports/commit/4374b0969cfa2e4d84c8c413d2151213d669bd1b))
- init ([55a364b](https://github.com/brandhaug/migrate-barrel-imports/commit/55a364b30d72c2538521d6275d08b3f17dd37631))
- **lint:** enable strict oxlint rules and anti-slop from ultracite ([#50](https://github.com/brandhaug/migrate-barrel-imports/issues/50)) ([ba55fa7](https://github.com/brandhaug/migrate-barrel-imports/commit/ba55fa7a354a20255ec1bd898503bbcb00716c59))
- **master:** release 1.7.2 ([#5](https://github.com/brandhaug/migrate-barrel-imports/issues/5)) ([49afd4c](https://github.com/brandhaug/migrate-barrel-imports/commit/49afd4c51c2e6e69135285cd1c3785caae9e024d))
- **master:** release 1.7.3 ([#7](https://github.com/brandhaug/migrate-barrel-imports/issues/7)) ([a39fe6d](https://github.com/brandhaug/migrate-barrel-imports/commit/a39fe6dd6b53be28d21e3299bbc5ec9099fa3aa5))
- **master:** release 2.0.0 ([#25](https://github.com/brandhaug/migrate-barrel-imports/issues/25)) ([e2b65d0](https://github.com/brandhaug/migrate-barrel-imports/commit/e2b65d055d5d6920dcfe035b7d3bf299013d91e1))
- **master:** release 2.1.0 ([#28](https://github.com/brandhaug/migrate-barrel-imports/issues/28)) ([4cb87d5](https://github.com/brandhaug/migrate-barrel-imports/commit/4cb87d50520547be5200a78331f9db63bc491d86))
- **master:** release 2.1.0 ([#29](https://github.com/brandhaug/migrate-barrel-imports/issues/29)) ([6c8fc88](https://github.com/brandhaug/migrate-barrel-imports/commit/6c8fc88be4d03a1beba386c8ed19c776e6a03b58))
- **master:** release 3.0.0 ([#31](https://github.com/brandhaug/migrate-barrel-imports/issues/31)) ([bb23fa0](https://github.com/brandhaug/migrate-barrel-imports/commit/bb23fa09a53d87f039c83c2a894a6b02bf5ab4b6))
- **master:** release 4.0.0 ([#41](https://github.com/brandhaug/migrate-barrel-imports/issues/41)) ([3b8af1f](https://github.com/brandhaug/migrate-barrel-imports/commit/3b8af1fd94ce8695f697673653d3f2b56ac7b116))
- **master:** release 4.0.1 ([#47](https://github.com/brandhaug/migrate-barrel-imports/issues/47)) ([81dcbc0](https://github.com/brandhaug/migrate-barrel-imports/commit/81dcbc033a4cbbef7539c10c3ef7676bf5cbd9bb))
- no bundling ([a57dd34](https://github.com/brandhaug/migrate-barrel-imports/commit/a57dd34d09f3c67bb6ec577adb1b1a875db71197))
- release v0.0.1 ([5ef585b](https://github.com/brandhaug/migrate-barrel-imports/commit/5ef585b415556ea634db193ac0e82d5ac857c091))
- release v1.7.1 ([f44c88d](https://github.com/brandhaug/migrate-barrel-imports/commit/f44c88d0e874194ce35e3ece81173a88d079c9db))
- trigger release-please after retargeting release SHAs ([37a734d](https://github.com/brandhaug/migrate-barrel-imports/commit/37a734df999ca9b1e40c72d1d99fef28fa832a9c))

### Code Refactoring

- clean up tests ([f770aab](https://github.com/brandhaug/migrate-barrel-imports/commit/f770aabe8988824b1a4166338f9ad739a07bfa3d))
- cleanup ([134e78f](https://github.com/brandhaug/migrate-barrel-imports/commit/134e78f6b82c4398526a990d70b577003bdaf986))
- **migrate:** reconcile codebase review onto strict-oxlint ([#51](https://github.com/brandhaug/migrate-barrel-imports/issues/51)) ([002ea7f](https://github.com/brandhaug/migrate-barrel-imports/commit/002ea7fab06736a62b0498d69ec10b3b2cdfba06))
- **migrate:** use Array.prototype.toSorted for sorted copies ([#44](https://github.com/brandhaug/migrate-barrel-imports/issues/44)) ([d27f52c](https://github.com/brandhaug/migrate-barrel-imports/commit/d27f52cbd9c68794db8430f0c7973bd24ff6b1f1))
- replace Biome with oxlint and oxfmt ([#3](https://github.com/brandhaug/migrate-barrel-imports/issues/3)) ([b7e83b0](https://github.com/brandhaug/migrate-barrel-imports/commit/b7e83b0d325cbfe93f95516596b402f9f3e590db))

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
