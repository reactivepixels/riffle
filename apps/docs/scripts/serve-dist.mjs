#!/usr/bin/env node
// A minimal static file server for the built docs site, with no
// dependencies beyond Node's own http/fs modules. Exists because
// astro.config.mjs sets `base: '/riffle'` (the site is published under
// https://reactivepixels.github.io/riffle/), so every link, script and
// stylesheet in the built HTML is already an absolute /riffle/... URL;
// serving dist/ directly at "/" would 404 on all of them. This mounts
// dist/ under /riffle instead, matching production, which is what both
// Lighthouse CI (lighthouserc.json's collect.startServerCommand) and local
// Lighthouse runs serve against.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const BASE = '/riffle'
const PORT = Number(process.env.PORT) || 4173

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

async function resolveFile(pathname) {
  // Strip the base, reject anything outside it (Lighthouse and the
  // browser never request outside /riffle, but a defensive check costs
  // nothing).
  if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) return null
  let rel = pathname.slice(BASE.length) || '/'
  if (rel === '/') rel = '/index.html'

  const candidate = normalize(join(distDir, rel))
  if (!candidate.startsWith(distDir)) return null

  try {
    const stats = await stat(candidate)
    if (stats.isDirectory()) {
      const indexPath = join(candidate, 'index.html')
      await stat(indexPath)
      return indexPath
    }
    return candidate
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const filePath = await resolveFile(decodeURIComponent(url.pathname))

  if (!filePath) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  try {
    const body = await readFile(filePath)
    const type = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream'
    res.writeHead(200, { 'content-type': type })
    res.end(body)
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Internal error')
  }
})

server.listen(PORT, () => {
  console.log(`Serving ${distDir} at http://localhost:${PORT}${BASE}/`)
})
