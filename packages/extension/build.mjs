import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const outputRoot = resolve(packageRoot, 'build')
const outputDist = resolve(outputRoot, 'dist')

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputDist, { recursive: true })

await Promise.all([
  bundle({
    entry: 'src/background.ts',
    outfile: 'dist/background.js',
    format: 'esm',
  }),
  bundle({
    entry: 'src/content-script.ts',
    outfile: 'dist/content-script.js',
    format: 'iife',
  }),
  bundle({
    entry: 'src/popup.ts',
    outfile: 'dist/popup.js',
    format: 'esm',
  }),
])

await copyStatic('manifest.json')
await copyStatic('popup.html')
await assertManifestOutputs()

async function bundle({ entry, outfile, format }) {
  await build({
    absWorkingDir: packageRoot,
    bundle: true,
    entryPoints: [entry],
    format,
    outfile: resolve(outputRoot, outfile),
    platform: 'browser',
    target: ['chrome120'],
    logLevel: 'info',
  })
}

async function copyStatic(relativePath) {
  const source = resolve(packageRoot, relativePath)
  const destination = resolve(outputRoot, relativePath)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, await readFile(source))
}

async function assertManifestOutputs() {
  const manifest = JSON.parse(await readFile(resolve(outputRoot, 'manifest.json'), 'utf8'))
  const requiredPaths = [
    manifest.background?.service_worker,
    ...(manifest.content_scripts ?? []).flatMap((script) => script.js ?? []),
    manifest.action?.default_popup,
  ].filter((path) => typeof path === 'string')

  const popup = await readFile(resolve(outputRoot, manifest.action.default_popup), 'utf8')
  for (const match of popup.matchAll(/\bsrc=["']([^"']+)["']/g)) {
    requiredPaths.push(match[1])
  }

  for (const relativePath of requiredPaths) {
    if (!existsSync(resolve(outputRoot, relativePath))) {
      throw new Error(`Manifest declares ${relativePath}, but the build did not produce it.`)
    }
  }
}
