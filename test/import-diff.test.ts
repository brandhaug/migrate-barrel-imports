// fallow-ignore-file unused-file
// Reason: executed directly by `bun test`; not reachable from the bin entry
// point, so the reachability analysis flags it as unused.
import { describe, expect, it } from 'bun:test'
import { formatImportDiff } from '../src/import-diff'

describe('formatImportDiff', (): void => {
	it('emits a unified-style diff of a replaced import statement', (): void => {
		const before = `import { add, PI } from "@test/source-lib";

export const area = (r: number): number => PI * add(r, r);
`
		const after = `import { add } from "@test/source-lib/src/utils.ts";
import { PI } from "@test/source-lib/src/constants.ts";

export const area = (r: number): number => PI * add(r, r);
`

		expect(
			formatImportDiff({ filePath: 'src/calculator.ts', before, after })
		).toBe(
			[
				'--- a/src/calculator.ts',
				'+++ b/src/calculator.ts',
				'-import { add, PI } from "@test/source-lib";',
				'+import { add } from "@test/source-lib/src/utils.ts";',
				'+import { PI } from "@test/source-lib/src/constants.ts";'
			].join('\n')
		)
	})

	it('omits import statements that did not change', (): void => {
		const before = `import { readFile } from "node:fs/promises";
import { add } from "@test/source-lib";
`
		const after = `import { readFile } from "node:fs/promises";
import { add } from "@test/source-lib/src/utils.ts";
`

		expect(formatImportDiff({ filePath: 'src/a.ts', before, after })).toBe(
			[
				'--- a/src/a.ts',
				'+++ b/src/a.ts',
				'-import { add } from "@test/source-lib";',
				'+import { add } from "@test/source-lib/src/utils.ts";'
			].join('\n')
		)
	})

	it('renders every line of a multi-line import statement', (): void => {
		const before = `import {
	add,
	PI
} from "@test/source-lib";
`
		const after = `import { add } from "@test/source-lib/src/utils.ts";
`

		expect(formatImportDiff({ filePath: 'src/a.ts', before, after })).toBe(
			[
				'--- a/src/a.ts',
				'+++ b/src/a.ts',
				'-import {',
				'-\tadd,',
				'-\tPI',
				'-} from "@test/source-lib";',
				'+import { add } from "@test/source-lib/src/utils.ts";'
			].join('\n')
		)
	})

	it('returns an empty string when no import statement changed', (): void => {
		const code = `import { add } from "@test/source-lib/src/utils.ts";

export const twice = (n: number): number => add(n, n);
`

		expect(
			formatImportDiff({ filePath: 'src/a.ts', before: code, after: code })
		).toBe('')
	})

	it('does not double the separator for an absolute file path', (): void => {
		const before = 'import { add } from "@test/source-lib";\n'
		const after = 'import { add } from "@test/source-lib/src/utils.ts";\n'

		const diff = formatImportDiff({
			filePath: '/tmp/app/src/a.ts',
			before,
			after
		})

		expect(diff.split('\n').slice(0, 2)).toEqual([
			'--- a/tmp/app/src/a.ts',
			'+++ b/tmp/app/src/a.ts'
		])
	})
})
