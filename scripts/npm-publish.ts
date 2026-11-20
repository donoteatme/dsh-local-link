import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

async function readPublishFiles(root: string) {
  const [original, readme] = await Promise.all([
    readFile(resolve(root, 'package.json'), 'utf8'),
    readFile(resolve(root, 'README.md'), 'utf8'),
  ])
  if (!readme.trim()) throw new Error('The English README.md is empty')
  return { original, readme, metadata: JSON.parse(original) as Record<string, unknown> }
}

/** Guard the registry metadata: readmeFilename alone does not override npm's discovery. */
export async function assertEnglishReadme(root: string): Promise<void> {
  const { metadata, readme } = await readPublishFiles(root)
  if (metadata.readme !== readme || metadata.readmeFilename !== 'README.md') {
    throw new Error('Publish with npm run release:publish to select the English README')
  }
}

/** Keep English registry metadata explicit, without leaving generated content in the checkout. */
export async function withEnglishReadme<T>(root: string, publish: () => Promise<T>): Promise<T> {
  const { original, readme, metadata } = await readPublishFiles(root)
  try {
    await writeFile(resolve(root, 'package.json'), JSON.stringify({ ...metadata, readme, readmeFilename: 'README.md' }, null, 2) + '\n')
    return await publish()
  } finally {
    await writeFile(resolve(root, 'package.json'), original)
  }
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..')
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--check') {
    await assertEnglishReadme(root)
    console.log('npm README: README.md (English)')
    return
  }
  if (args.some(argument => argument !== '--dry-run')) throw new Error('Only --dry-run is supported')
  const npmCli = process.env.npm_execpath
  if (!npmCli?.endsWith('npm-cli.js')) throw new Error('Run this command through npm run release:publish')
  process.exitCode = await withEnglishReadme(root, () => new Promise<number>((resolveExit, reject) => {
    const child = spawn(process.execPath, [npmCli, 'publish', '--access', 'public', ...args], { cwd: root, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => resolveExit(code ?? 1))
  }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
}
