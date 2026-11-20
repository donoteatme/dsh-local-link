import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertEnglishReadme, withEnglishReadme } from '../scripts/npm-publish.js'

const fixtures: string[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'local-link-publish-'))
  fixtures.push(root)
  const original = '{\r\n  "name": "test-local-link",\r\n  "version": "1.0.0",\r\n  "readmeFilename": "README.md"\r\n}\r\n'
  await Promise.all([
    writeFile(join(root, 'package.json'), original),
    writeFile(join(root, 'README.md'), '# Local Link\n\nEnglish documentation.\n'),
    writeFile(join(root, 'README.zh.md'), '# Local Link\n\n中文文档。\n'),
    writeFile(join(root, 'README.ru.md'), '# Local Link\n\nРусская документация.\n'),
  ])
  return { root, original }
}
afterEach(async () => { await Promise.all(fixtures.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('npm publishing README', () => {
  it('passes exact English content to npm and preserves all localized files and manifest bytes', async () => {
    const { root, original } = await fixture()
    const localized = await Promise.all(['README.zh.md', 'README.ru.md'].map(name => readFile(join(root, name), 'utf8')))
    const result = await withEnglishReadme(root, async () => {
      await expect(assertEnglishReadme(root)).resolves.toBeUndefined()
      const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
      expect(metadata.readme).toBe(await readFile(join(root, 'README.md'), 'utf8'))
      expect(metadata.readmeFilename).toBe('README.md')
      expect(await Promise.all(['README.zh.md', 'README.ru.md'].map(name => readFile(join(root, name), 'utf8')))).toEqual(localized)
      return 0
    })
    expect(result).toBe(0)
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(original)
  })

  it('restores the original manifest when publishing fails', async () => {
    const { root, original } = await fixture()
    await expect(withEnglishReadme(root, async () => { throw new Error('Registry unavailable') })).rejects.toThrow('Registry unavailable')
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(original)
  })

  it('rejects a filename-only manifest before npm can select a localized README', async () => {
    const { root } = await fixture()
    await expect(assertEnglishReadme(root)).rejects.toThrow('npm run release:publish')
  })
})
