import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const template = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8')
const entries = await readdir(dist, { recursive: true, withFileTypes: true })
const assets = entries
  .filter((entry) => entry.isFile() && entry.name !== 'sw.js')
  .map((entry) => join(entry.parentPath, entry.name).slice(dist.length).replaceAll('\\', '/'))
  .sort()

if (!assets.includes('index.html') || !assets.includes('manifest.webmanifest')) {
  throw new Error('Build the Vite app with its web app manifest before generating the service worker.')
}

const hash = createHash('sha256').update(template)
for (const asset of assets) {
  hash.update(`\0${asset}\0`).update(await readFile(join(dist, asset)))
}

const buildId = hash.digest('hex').slice(0, 16)
const urls = assets.map((asset) => asset.split('/').map(encodeURIComponent).join('/'))
const script = template
  .replace('/* BUILD_ID */ null', JSON.stringify(buildId))
  .replace('/* PRECACHE_ASSETS */ []', JSON.stringify(urls))
await writeFile(join(dist, 'sw.js'), script)
console.log(`Prepared offline cache for ${assets.length} files.`)
