#!/usr/bin/env node
/**
 * Proves this example's server render never touches window or document, and
 * that the stack is already stacked before any client JavaScript runs.
 * Checks two routes against one running server:
 *
 * - "/": request-time SSR. Forced dynamic (see app/page.tsx), built on the
 *   headless useRiffle + useRiffleState composition.
 * - "/static": build-time SSG (the default for a route with no dynamic
 *   data), built on the drop-in <Riffle> component with an onChange-driven
 *   readout. This is the only place in this example <Riffle> itself gets
 *   server rendered, and the only route where a window or document leak
 *   shows up at `next build` time rather than at request time (see the
 *   break-it proof for this route in the task report).
 *
 * Starts `next start` (the production server, so run `next build` first),
 * polls a fixed port until it accepts connections, fetches each route with
 * plain fetch (no JavaScript executes), and asserts against the raw HTML.
 * The server is always killed, even when an assertion fails.
 */
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(DIR, '..')
const PORT = 4310
const READY_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 200

const FIRST_FILM_TITLE = 'Neon Harbor'
const EXPECTED_READOUT = '1 / 8'

const ROUTES = [
  { path: '/', label: 'home (request-time SSR)' },
  { path: '/static', label: 'static (build-time SSG, drop-in <Riffle>)' },
]

let failed = false
function fail(message) {
  console.error(`FAIL: ${message}`)
  failed = true
}

/**
 * Waits for the server to accept connections on PORT, or throws after the
 * timeout. "Ready" means it answers at all, not that it answers with a 200:
 * a page that throws server side still produces an HTTP response (a 500),
 * and that response is exactly what the assertions below need to see, so a
 * broken render must count as ready rather than as a readiness timeout.
 */
async function waitUntilReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      await fetch(`http://localhost:${PORT}/`)
      return
    } catch {
      // Not listening yet. Keep polling.
    }
    await delay(POLL_INTERVAL_MS)
  }
  throw new Error(`server did not become ready on port ${PORT} within ${READY_TIMEOUT_MS}ms`)
}

/**
 * General server-error detector. The two literal "window/document is not
 * defined" checks further down are specific to how Next's Turbopack SSR
 * bundle actually fails: a bare, never-shimmed `window` or `document`
 * identifier throws a plain ReferenceError with exactly that text (verified
 * directly: a top-level `document.title` read logs
 * "ReferenceError: document is not defined" to stderr, digest included, and
 * the response body is `<html id="__next_error__">...`). That is not the
 * only way a server render can fail, and is not even how every framework's
 * runtime fails the same defect (Nuxt's Nitro server shims `window` and
 * `document` as defined-but-undefined globals, so the same defect there
 * throws a TypeError on property access instead, never that literal
 * string). This detector catches the failure generally: wrong status, or
 * stdout/stderr/response containing any common failure signature.
 */
function detectServerError(status, html, output) {
  if (status !== 200) return `response status was ${status}, expected 200`
  const combined = `${output}\n${html}`
  const SIGNS = [
    ['ReferenceError', /ReferenceError/],
    ['TypeError', /TypeError/],
    ['"is not defined"', /is not defined/],
    ['a Next.js error page (id="__next_error__")', /id="__next_error__"/],
  ]
  for (const [name, re] of SIGNS) {
    if (re.test(combined)) return `matched ${name}`
  }
  return null
}

/** Strips HTML comment markers, e.g. React's "1<!-- --> /<!-- --> 8". */
function visibleText(html) {
  return html.replace(/<!--.*?-->/gs, '')
}

async function checkRoute(routePath, label, getOutput) {
  // Captured before the fetch: the server may log the request's own errors
  // asynchronously, slightly after the response is sent, so a short fixed
  // wait after the fetch gives that write time to land before this route's
  // slice of output is read.
  const before = getOutput().length
  const url = `http://localhost:${PORT}${routePath}`
  const response = await fetch(url)
  const html = await response.text()
  await delay(300)
  // Scoped to what this route's own request logged, not to the server's
  // whole lifetime: the previous route's error text (if any) is still
  // sitting in the combined log buffer, and a route that itself rendered
  // fine must not fail because an earlier route did not.
  const output = getOutput().slice(before)
  const prefix = `[${label}]`

  const serverError = detectServerError(response.status, html, output)
  if (serverError) {
    fail(`${prefix} server render error: ${serverError}`)
  }

  // Specific, friendlier message where it can actually fire. See the doc
  // comment on detectServerError for why this is Next-specific and does not
  // generalize to every framework's failure shape.
  if (/window is not defined/.test(output)) {
    fail(`${prefix} server output contains "window is not defined"`)
  }
  if (/document is not defined/.test(output)) {
    fail(`${prefix} server output contains "document is not defined"`)
  }

  const activeTitleTag = html.match(/<h1[^>]*\bdata-active-title\b[^>]*>([\s\S]*?)<\/h1>/)
  if (!activeTitleTag) {
    fail(`${prefix} no element with "data-active-title" found in server HTML`)
  } else {
    const activeTitle = visibleText(activeTitleTag[1]).trim()
    if (activeTitle !== FIRST_FILM_TITLE) {
      fail(
        `${prefix} active title element contains "${activeTitle}", expected "${FIRST_FILM_TITLE}"`,
      )
    }
  }

  if (!visibleText(html).includes(EXPECTED_READOUT)) {
    fail(`${prefix} readout "${EXPECTED_READOUT}" not found in server HTML`)
  }

  // Scoped to the marked elements' own opening tags, not to the page as a
  // whole: a stray "display:grid" or "grid-area:1 / 1" elsewhere on the
  // page (embedded CSS, an unrelated element) must not make this pass.
  const rootTag = html.match(/<[^>]*\bdata-riffle-root\b[^>]*>/)?.[0]
  if (!rootTag) {
    fail(`${prefix} no element with "data-riffle-root" found in server HTML`)
  } else if (!/display\s*:\s*grid/i.test(rootTag)) {
    fail(`${prefix} root element lacks "display:grid" in server HTML: ${rootTag}`)
  }

  const cardTags = html.match(/<[^>]*\bdata-riffle-card="\d+"[^>]*>/g) ?? []
  if (cardTags.length === 0) {
    fail(`${prefix} no "data-riffle-card" elements found in server HTML`)
  } else {
    const unstacked = cardTags.filter((tag) => !/grid-area\s*:\s*1\s*\/\s*1/i.test(tag))
    if (unstacked.length > 0) {
      fail(
        `${prefix} ${unstacked.length} of ${cardTags.length} cards lack "grid-area:1 / 1": ${unstacked[0]}`,
      )
    }
  }
}

async function main() {
  const server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  server.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  server.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  const cleanup = () =>
    new Promise((resolve) => {
      if (server.exitCode !== null || server.killed) {
        resolve()
        return
      }
      server.once('exit', () => resolve())
      server.kill('SIGTERM')
      // Belt and braces: force it if it ignores SIGTERM.
      delay(5000).then(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
      })
    })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      await cleanup()
      process.exit(1)
    })
  }

  try {
    await waitUntilReady()

    for (const route of ROUTES) {
      await checkRoute(route.path, route.label, () => output)
    }

    if (failed) {
      process.exitCode = 1
      console.error('\n--- server output ---')
      console.error(output)
    } else {
      console.log(
        `check:ssr passed for ${ROUTES.map((r) => r.path).join(' and ')}: title, readout, and stacking markup are present server side`,
      )
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    console.error('\n--- server output ---')
    console.error(output)
  } finally {
    await cleanup()
  }
}

await main()
