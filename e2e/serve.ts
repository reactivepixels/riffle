/**
 * A dependency-free static file server for the two examples that have no
 * build step of their own: `vanilla-basic` (a single HTML file, no bundler)
 * and this package's own `fixtures/` page (image and link cards, built
 * against the workspace core rather than a showcase example). Also exposes `packages/core/dist` directly,
 * so the fixture page can import the real build with a plain relative path
 * and Playwright's CDN routing (see specs/interaction.spec.ts) has a local
 * file to fulfil `https://esm.sh/@rpxl/riffle@0.1` from.
 *
 * `react-movie-stack` and `vue-movie-stack` are real Vite apps and are
 * served by `vite preview` instead (see playwright.config.ts); this server
 * only covers the two roots Vite cannot build.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(here, '..')

const PORT = Number(process.env.RIFFLE_E2E_STATIC_PORT ?? 4303)

// URL prefix -> filesystem root. Checked longest-prefix-first so
// `/core-dist/` does not fall through to the vanilla-basic root.
const ROUTES: Array<{ prefix: string; root: string }> = [
  { prefix: '/core-dist/', root: join(repoRoot, 'packages/core/dist') },
  { prefix: '/fixtures/', root: join(here, 'fixtures') },
  { prefix: '/', root: join(repoRoot, 'examples/vanilla-basic') },
]

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

function resolveRoute(pathname: string): { root: string; relative: string } {
  const sorted = [...ROUTES].sort((a, b) => b.prefix.length - a.prefix.length)
  for (const route of sorted) {
    if (pathname.startsWith(route.prefix)) {
      return { root: route.root, relative: pathname.slice(route.prefix.length) }
    }
  }
  // Unreachable: '/' is always present as a fallback.
  throw new Error(`no route for ${pathname}`)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let { root, relative } = resolveRoute(url.pathname)
    if (relative === '' || relative.endsWith('/')) relative += 'index.html'

    // Reject traversal outside the resolved root (normalize collapses ../).
    const filePath = normalize(join(root, relative))
    if (!filePath.startsWith(normalize(root))) {
      res.writeHead(403).end('Forbidden')
      return
    }

    const info = await stat(filePath).catch(() => null)
    if (!info || !info.isFile()) {
      res.writeHead(404).end('Not found')
      return
    }

    const body = await readFile(filePath)
    const type = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
    res.end(body)
  } catch (error) {
    res.writeHead(500).end(String(error))
  }
})

server.listen(PORT, () => {
  // Playwright's webServer waits on this exact line via its `url` health
  // check hitting the port, not this log; it is here for local debugging.
  console.log(`e2e static server on http://localhost:${PORT}`)
})
