import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('index', (): void => {
	it('should work', async (): Promise<void> => {
		const cliPath = path.resolve(__dirname, '../src/index.ts')

		await execa('tsx', [cliPath, '.'], {
			preferLocal: true
		})
	})
})
