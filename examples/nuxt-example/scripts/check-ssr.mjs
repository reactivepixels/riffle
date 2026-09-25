#!/usr/bin/env node
/**
 * Proves this page's server render never touches window or document, and
 * that the stack is already stacked before any client JavaScript runs.
 *
 * Starts the built Nitro server (so run `nuxt build` first), polls a fixed
 * port until it accepts connections, fetches the page with plain fetch (no
 * JavaScript executes), and asserts against the raw HTML. The server is
 * always killed, even when an assertion fails.
 */
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(DIR, '..')
const PORT = 4320
const URL = `http://localhost:${PORT}/`
const READY_TIMEOUT_MS = 30_000
const POLL_INTERVAL_MS = 200

const FIRST_FILM_TITLE = 'Neon Harbor'
const EXPECTED_READOUT = '1 / 8'

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exitCode = 1
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
      await fetch(URL)
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
 * defined" checks further down are dead code on this
 * framework: verified directly that a top-level `document.title` read does
 * NOT throw that text here. Nitro's node-server preset (via unenv) defines
 * `window` and `document` as globals that are themselves `undefined`,
 * rather than leaving them unresolved identifiers, so a property read on
 * either throws "TypeError: Cannot read properties of undefined (reading
 * '...')" instead, and the response is Nitro's own JSON error body:
 * `{"error":true,"statusCode":500,"statusMessage":"Server Error",...}`.
 * This detector catches the failure generally: wrong status, or
 * stdout/stderr/response containing any common failure signature, so a
 * defect that never produces the literal "is not defined" text still fails
 * check:ssr, and fails it by name.
 */
function detectServerError(status, html, output) {
  if (status !== 200) return `response status was ${status}, expected 200`
  const combined = `${output}\n${html}`
  const SIGNS = [
    ['ReferenceError', /ReferenceError/],
    ['TypeError', /TypeError/],
    ['"is not defined"', /is not defined/],
    ['a Nitro JSON error response ("statusCode":5xx)', /"statusCode"\s*:\s*5\d\d/],
  ]
  for (const [name, re] of SIGNS) {
    if (re.test(combined)) return `matched ${name}`
  }
  return null
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, '.output/server/index.mjs')], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), HOST: 'localhost' },
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

    const response = await fetch(URL)
    const html = await response.text()

    const serverError = detectServerError(response.status, html, output)
    if (serverError) {
      fail(`server render error: ${serverError}`)
    }

    // Specific, friendlier message, kept for parity with the Next script.
    // Does not fire on this framework for a window/document leak: see the
    // doc comment on detectServerError above.
    if (/window is not defined/.test(output)) {
      fail('server output contains "window is not defined"')
    }

    if (/document is not defined/.test(output)) {
      fail('server output contains "document is not defined"')
    }

    const activeTitleTag = html.match(/<h1[^>]*\bdata-active-title\b[^>]*>([\s\S]*?)<\/h1>/)
    if (!activeTitleTag) {
      fail('no element with "data-active-title" found in server HTML')
    } else {
      const activeTitle = activeTitleTag[1].trim()
      if (activeTitle !== FIRST_FILM_TITLE) {
        fail(`active title element contains "${activeTitle}", expected "${FIRST_FILM_TITLE}"`)
      }
    }

    if (!html.includes(EXPECTED_READOUT)) {
      fail(`readout "${EXPECTED_READOUT}" not found in server HTML`)
    }

    // Scoped to the marked elements' own opening tags, not to the page as a
    // whole: Nuxt inlines this page's <style scoped> block into the document
    // head, and that block's own ".control { display: grid; ... }" rule
    // would satisfy a page-wide "display:grid" search whether or not the
    // root element itself is actually stacked.
    const rootTag = html.match(/<[^>]*\bdata-riffle-root\b[^>]*>/)?.[0]
    if (!rootTag) {
      fail('no element with "data-riffle-root" found in server HTML')
    } else if (!/display\s*:\s*grid/i.test(rootTag)) {
      fail(`root element lacks "display:grid" in server HTML: ${rootTag}`)
    }

    const cardTags = html.match(/<[^>]*\bdata-riffle-card="\d+"[^>]*>/g) ?? []
    if (cardTags.length === 0) {
      fail('no "data-riffle-card" elements found in server HTML')
    } else {
      const unstacked = cardTags.filter((tag) => !/grid-area\s*:\s*1\s*\/\s*1/i.test(tag))
      if (unstacked.length > 0) {
        fail(
          `${unstacked.length} of ${cardTags.length} cards lack "grid-area:1 / 1": ${unstacked[0]}`,
        )
      }
    }

    if (process.exitCode) {
      console.error('\n--- server output ---')
      console.error(output)
    } else {
      console.log('check:ssr passed: title, readout, and stacking markup are present server side')
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
    console.error('\n--- server output ---')
    console.error(output)
  } finally {
    await cleanup()
  }
}

await main()
