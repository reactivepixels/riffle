#!/usr/bin/env node
/**
 * Generates the static preview images the per-track examples galleries
 * (apps/docs/src/tracks/examples.mdx, rendered from src/lib/track-examples.ts)
 * use for every shipped example, one screenshot per app: react-movie-stack
 * and vue-movie-stack once used live islands, replaced with screenshots
 * too, since a live island and a static image never look consistent side by
 * side (different vertical rhythm, a light card background against the
 * gallery's dark card chrome, and a `client:idle`/`client:visible` race the
 * docs axe scan had already caught once). Every card gets the same
 * treatment. A multi-page or multi-route app (the three recipes apps) sets
 * `path` to send the browser straight to one representative page, since its
 * own root is a nav/index page with no carousel to frame.
 *
 * Each screenshot is clipped to a tight box around the stack's own cards
 * (every element the engine marks `aria-roledescription="slide"`, unioned
 * and padded), not the whole page, then expanded to a fixed 4:3 ratio around
 * that same center: the stack fills the frame at a consistent scale on every
 * card, whatever the surrounding page's own chrome looks like.
 *
 * Not part of the docs build: a screenshot is a checked-in asset, refreshed
 * by hand when an example's visuals actually change, not derived data
 * regenerated on every build the way the API reference or bundle sizes are.
 * Run it with `pnpm --filter @rpxl/riffle-e2e run generate-example-screenshots`,
 * which resolves `@playwright/test`'s `chromium` from e2e's own
 * node_modules. The PNG-to-webp conversion shells out to
 * apps/docs/scripts/convert-to-webp.mjs instead (see that file's own doc
 * comment for why): `sharp` is a dependency of apps/docs, not of e2e, and
 * this avoids adding it to e2e just for this one script.
 *
 * Ports: 5501-5513, picked fresh for this script and checked with
 * `lsof -iTCP -sTCP:LISTEN` against every port already named in
 * e2e/playwright.config.ts (4301-4307, 4310, 4320), lighthouserc.json
 * (4173), and apps/docs' own a11y target (4340); none collide. Never start
 * a webServer on a port another suite already owns.
 */
import { chromium } from '@playwright/test'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const outDir = join(repoRoot, 'apps/docs/public/examples')
const convertScript = join(repoRoot, 'apps/docs/scripts/convert-to-webp.mjs')

// Generous relative to any single example's own fan spread, so the clip
// computed below (see computeClip) never has to clamp against the viewport
// edge before it gets a chance to center the stack.
const VIEWPORT = { width: 1400, height: 1000 }

// The fixed output ratio every preview is expanded to, and the padding
// added around the unioned content before that expansion: a fraction of the
// union's own larger dimension, not a fixed pixel count, so a small
// example's card and a large one both end up padded proportionally rather
// than one being swamped by a padding amount sized for the other.
const TARGET_RATIO = 4 / 3
const PADDING_FRACTION = 0.03
// The stack (and its meta text, where the example has one) should read as
// most of the frame: 60 to 80% of the frame's
// width. Used only to log a warning if a generated frame falls outside
// that band, not to force it: forcing it after the fact would silently
// reintroduce the cropping this whole computation exists to avoid.
const STACK_WIDTH_FRACTION_MIN = 0.6
const STACK_WIDTH_FRACTION_MAX = 0.8

const CDN_PREFIX = 'https://esm.sh/@rpxl/riffle@0.1'
const CORE_DIST_INDEX = join(repoRoot, 'packages/core/dist/index.js')

// Matches react-movie-stack's own `--bg` (examples/react-movie-stack/src/app.css)
// and every other example's dark page background. vanilla-basic's own page is
// deliberately light (`#f6f6f7`, a plain unstyled-looking demo, matching its
// "no build step, no framework" pitch on the docs site), which is correct for
// anyone actually running it, but was the one light preview in an otherwise
// all-dark gallery. Rather than change the shipped example, `screenshotOne`
// injects this background into the page it screenshots only: a page.addStyleTag
// call, never written to examples/vanilla-basic/index.html itself.
const GALLERY_DARK_BG = '#121218'

const TARGETS = [
  { slug: 'react-movie-stack', kind: 'vite', filterName: 'react-movie-stack', port: 5501 },
  { slug: 'vue-movie-stack', kind: 'vite', filterName: 'vue-movie-stack', port: 5502 },
  {
    slug: 'vanilla-basic',
    kind: 'static',
    root: join(repoRoot, 'examples/vanilla-basic'),
    port: 5503,
  },
  { slug: 'react-infinite-feed', kind: 'vite', filterName: 'react-infinite-feed', port: 5504 },
  { slug: 'vue-clamp-controls', kind: 'vite', filterName: 'vue-clamp-controls', port: 5505 },
  { slug: 'custom-layout', kind: 'vite', filterName: 'custom-layout', port: 5506 },
  { slug: 'vertical-stack', kind: 'vite', filterName: 'vertical-stack', port: 5507 },
  { slug: 'nextjs-app-router', kind: 'next', filterName: 'nextjs-app-router', port: 5508 },
  {
    slug: 'nuxt-example',
    kind: 'nuxt',
    dir: 'examples/nuxt-example',
    filterName: 'nuxt-example',
    port: 5509,
  },
  // The three recipes apps: each is a multi-page/multi-route shell
  // with no carousel on its own root (an index/nav page), so `path` sends
  // the browser straight to one representative recipe instead. The same
  // recipe (forms-in-cards, or its own nearest equivalent) is picked in
  // every framework, so the three "recipes app" gallery cards read as the
  // same kind of thing.
  {
    slug: 'vanilla-recipes',
    kind: 'vite',
    filterName: 'vanilla-recipes',
    path: '/forms-in-cards.html',
    port: 5510,
  },
  {
    slug: 'react-recipes',
    kind: 'vite',
    filterName: 'react-recipes',
    path: '/#/forms-in-cards',
    port: 5511,
  },
  {
    slug: 'vue-recipes',
    kind: 'vite',
    filterName: 'vue-recipes',
    path: '/#/infinite-feed',
    port: 5512,
  },
  {
    slug: 'vanilla-movie-stack',
    kind: 'vite',
    filterName: 'vanilla-movie-stack',
    port: 5513,
  },
]

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

function run(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('exit', (code) => {
      if (code === 0) resolvePromise(undefined)
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 404) return
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function killTree(child) {
  if (!child.pid) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

/** A minimal static file server for vanilla-basic: no build step to run. */
function serveStatic(root, port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    const rel = url.pathname === '/' ? '/index.html' : url.pathname
    try {
      const body = await readFile(join(root, rel))
      const type = MIME_TYPES[extname(rel)] ?? 'application/octet-stream'
      res.writeHead(200, { 'content-type': type })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  server.listen(port)
  return server
}

/**
 * The clip box a screenshot uses: every VISIBLE card the engine has marked
 * `aria-roledescription="slide"` (both adapters and the vanilla core write
 * this, see packages/core/src/a11y.ts, so this works identically across
 * every example regardless of framework), plus that example's own title
 * and/or readout text where it renders one (`.meta` and/or `.readout`,
 * the two class names every example that has either of these uses, checked
 * directly against each example's own source), unioned, padded evenly, then
 * expanded around that same center to `TARGET_RATIO` so every example's
 * preview lands at the same aspect ratio without distorting or off-center
 * cropping a fan that is naturally wider (horizontal axis) or taller
 * (vertical axis) than the target frame.
 *
 * "Visible" excludes any card with computed `opacity` at or near 0, not just
 * ones with a truthy bounding box: every card in an example's own `cards`
 * array is registered and present in the DOM (packages/core/src/layout/fan.ts's
 * default layout does not remove cards outside `maxVisible`, it fades them),
 * so a `react-movie-stack`-shaped example with 8 films registers 8 slides,
 * most invisible at any one time. Two invisible ones skewed the union badly
 * before this filter existed: the depth -1 "exit slot" card,
 * which `fan()` places a full card-width to the right of the front card at
 * exactly `opacity: 0` at rest, and every card beyond `maxVisible`, faded to
 * `opacity: 0` and positioned further left than any visible card. Checked
 * again directly when this filter was suspected as the cause of a later
 * regression: it was
 * not. react-movie-stack's own 8 registered cards measured opacity exactly
 * 1 for the front card and its 3 fanned neighbours, and exactly 0 for the
 * other 4 (3 beyond maxVisible, 1 exit slot); nothing landed between 0.01
 * and 1, so this filter was already selecting the right 4 cards, not the
 * front card alone. See `.example-card__preview`'s own comment in
 * custom.css for the bug this filter was wrongly suspected of:
 * a CSS box-sizing bug in the gallery page itself, not this script.
 */
async function computeClip(page) {
  const cards = page.locator('[aria-roledescription="carousel"] [aria-roledescription="slide"]')
  const count = await cards.count()
  if (count === 0) {
    throw new Error('computeClip: found no [aria-roledescription="slide"] cards to frame')
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const visibleBoxes = []
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i)
    const opacity = await card.evaluate((el) => Number(getComputedStyle(el).opacity))
    if (!(opacity > 0.01)) continue
    const box = await card.boundingBox()
    if (!box) continue
    visibleBoxes.push(box)
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.width)
    maxY = Math.max(maxY, box.y + box.height)
  }
  if (visibleBoxes.length === 0) {
    throw new Error('computeClip: every card had opacity 0, nothing visible to frame')
  }
  const cardsOnlyBounds = { minX, minY, maxX, maxY }

  // The example's own title and/or readout, where it renders one, unioned
  // separately from the cards-only bounds above: react-movie-stack-shaped
  // examples (react-movie-stack, vue-movie-stack, nextjs-app-router, nuxt-example)
  // render a large `.meta` title block AND a `.readout` further below it,
  // together reaching more than 150px past the cards' own bottom edge, deep
  // enough that including both and still hitting the 60-80% stack-width
  // band is not simultaneously possible (confirmed by computing both: with
  // react-movie-stack's real numbers, a frame that fits the cards plus that
  // text lands the stack at 34.9% of the frame's width, no matter how
  // little padding is added, since the frame's required HEIGHT alone
  // already forces a wider frame than 60% would allow). Where the two goals
  // conflict, the numeric one wins and the text is left out; every example
  // where they do not conflict (vue-clamp-controls, custom-layout,
  // vertical-stack, vanilla-basic's readout all sit close enough to their
  // cards) keeps its title/readout in frame.
  let extraMinX = Infinity
  let extraMinY = Infinity
  let extraMaxX = -Infinity
  let extraMaxY = -Infinity
  const extras = page.locator('.meta, .readout')
  const extrasCount = await extras.count()
  for (let i = 0; i < extrasCount; i++) {
    const box = await extras.nth(i).boundingBox()
    if (!box) continue
    extraMinX = Math.min(extraMinX, box.x)
    extraMinY = Math.min(extraMinY, box.y)
    extraMaxX = Math.max(extraMaxX, box.x + box.width)
    extraMaxY = Math.max(extraMaxY, box.y + box.height)
  }
  const withExtrasBounds =
    extrasCount > 0
      ? {
          minX: Math.min(minX, extraMinX),
          minY: Math.min(minY, extraMinY),
          maxX: Math.max(maxX, extraMaxX),
          maxY: Math.max(maxY, extraMaxY),
        }
      : null

  /** Pads `bounds` evenly and expands around its own center to TARGET_RATIO. */
  function frameFor(bounds) {
    const unionWidth = bounds.maxX - bounds.minX
    const unionHeight = bounds.maxY - bounds.minY
    const padding = Math.max(unionWidth, unionHeight) * PADDING_FRACTION
    let x = bounds.minX - padding
    let y = bounds.minY - padding
    let width = unionWidth + padding * 2
    let height = unionHeight + padding * 2
    if (width / height > TARGET_RATIO) {
      const newHeight = width / TARGET_RATIO
      y -= (newHeight - height) / 2
      height = newHeight
    } else {
      const newWidth = height * TARGET_RATIO
      x -= (newWidth - width) / 2
      width = newWidth
    }
    return { x, y, width, height, cardsWidthFraction: (maxX - minX) / width }
  }

  const cardsOnlyFrame = frameFor(cardsOnlyBounds)
  const withExtrasFrame = withExtrasBounds ? frameFor(withExtrasBounds) : null
  // Prefer including the title/readout, but only when doing so still lands
  // in (or reasonably close to) the intended band; otherwise the numeric
  // requirement wins. 0.45 is partway between "clearly failed" and the 0.6
  // floor: close enough to the band that the extra context is worth a
  // slightly tighter fill, far enough that react-movie-stack's 0.349 does
  // not qualify.
  const useExtras = withExtrasFrame !== null && withExtrasFrame.cardsWidthFraction >= 0.45
  const chosen = useExtras ? withExtrasFrame : cardsOnlyFrame
  console.log(
    `computeClip: ${useExtras ? 'included' : 'excluded'} title/readout ` +
      `(cards-only fraction ${(cardsOnlyFrame.cardsWidthFraction * 100).toFixed(1)}%` +
      (withExtrasFrame
        ? `, with-extras fraction ${(withExtrasFrame.cardsWidthFraction * 100).toFixed(1)}%)`
        : ', no title/readout on this page)'),
  )

  let { x, y, width, height } = chosen

  // Clamp to the viewport: VIEWPORT is sized generously (see its own
  // comment) so this only ever trims a sub-pixel rounding overshoot, not a
  // real crop.
  x = Math.max(0, Math.min(x, VIEWPORT.width - width))
  y = Math.max(0, Math.min(y, VIEWPORT.height - height))
  width = Math.min(width, VIEWPORT.width - x)
  height = Math.min(height, VIEWPORT.height - y)

  // Fails loudly, rather than silently shipping a bad crop, if any visible
  // card ends up outside the frame this same function just computed: the
  // one guarantee a screenshot preview absolutely has to keep. Added after
  // a real regression (a CSS bug elsewhere, not this
  // function, but this check would have caught its symptom immediately
  // instead of needing a human to notice a zoomed-in gallery screenshot).
  for (const box of visibleBoxes) {
    const fullyInside =
      box.x >= x - 0.5 &&
      box.y >= y - 0.5 &&
      box.x + box.width <= x + width + 0.5 &&
      box.y + box.height <= y + height + 0.5
    if (!fullyInside) {
      throw new Error(
        `computeClip: a visible card's box ${JSON.stringify(box)} falls outside the ` +
          `computed clip ${JSON.stringify({ x, y, width, height })}`,
      )
    }
  }

  const stackWidthFraction = (maxX - minX) / width
  if (
    stackWidthFraction < STACK_WIDTH_FRACTION_MIN ||
    stackWidthFraction > STACK_WIDTH_FRACTION_MAX
  ) {
    console.warn(
      `computeClip: stack occupies ${(stackWidthFraction * 100).toFixed(1)}% of the frame's ` +
        `width, outside the intended ${STACK_WIDTH_FRACTION_MIN * 100}-` +
        `${STACK_WIDTH_FRACTION_MAX * 100}% band.`,
    )
  }

  return { x, y, width, height }
}

async function screenshotOne(browser, target) {
  const url = `http://localhost:${target.port}${target.path ?? '/'}`
  const page = await browser.newPage({ viewport: VIEWPORT })

  if (target.slug === 'vanilla-basic') {
    const body = await readFile(CORE_DIST_INDEX, 'utf8')
    await page.route('https://esm.sh/**', async (route) => {
      const reqUrl = route.request().url()
      if (reqUrl.startsWith(CDN_PREFIX)) {
        await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body })
      } else {
        await route.abort()
      }
    })
  }

  await page.goto(url, { waitUntil: 'networkidle' })

  if (target.slug === 'vanilla-basic') {
    // See GALLERY_DARK_BG's own comment: this page only, this screenshot
    // only, never the checked-in example file.
    await page.addStyleTag({ content: `body { background: ${GALLERY_DARK_BG} !important; }` })
  }

  await page.locator('[aria-roledescription="carousel"]').first().waitFor({ state: 'visible' })
  // Let the initial mount settle (a fresh stack's own entrance is instant,
  // but web fonts and the gradient backgrounds paint a frame or two late).
  await page.waitForTimeout(400)

  const clip = await computeClip(page)
  const pngPath = join(outDir, `${target.slug}.png`)
  await page.screenshot({ path: pngPath, clip })
  await page.close()

  const webpPath = join(outDir, `${target.slug}.webp`)
  execFileSync(
    'pnpm',
    ['--filter', '@rpxl/docs', 'exec', 'node', convertScript, pngPath, webpPath],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    },
  )
  console.log(`generate-example-screenshots: wrote ${webpPath}`)
}

async function withServer(target, fn) {
  let server
  let child
  try {
    if (target.kind === 'static') {
      server = serveStatic(target.root, target.port)
    } else if (target.kind === 'vite') {
      await run('pnpm', ['--filter', target.filterName, 'run', 'build'], { cwd: repoRoot })
      child = spawn(
        'pnpm',
        [
          '--filter',
          target.filterName,
          'exec',
          'vite',
          'preview',
          '--port',
          String(target.port),
          '--strictPort',
        ],
        { cwd: repoRoot, detached: true, stdio: 'inherit' },
      )
    } else if (target.kind === 'next') {
      await run('pnpm', ['--filter', target.filterName, 'run', 'build'], { cwd: repoRoot })
      child = spawn(
        'pnpm',
        ['--filter', target.filterName, 'exec', 'next', 'start', '-p', String(target.port)],
        { cwd: repoRoot, detached: true, stdio: 'inherit' },
      )
    } else if (target.kind === 'nuxt') {
      await run('pnpm', ['--filter', target.filterName, 'run', 'build'], { cwd: repoRoot })
      child = spawn('node', [join(repoRoot, target.dir, '.output/server/index.mjs')], {
        cwd: join(repoRoot, target.dir),
        env: { ...process.env, PORT: String(target.port) },
        detached: true,
        stdio: 'inherit',
      })
    }

    await waitForServer(`http://localhost:${target.port}/`)
    await fn()
  } finally {
    if (server) server.close()
    if (child) killTree(child)
  }
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch()

  const only = process.argv[2]
  const targets = only ? TARGETS.filter((t) => t.slug === only) : TARGETS
  if (targets.length === 0) {
    throw new Error(`generate-example-screenshots: no target named "${only}"`)
  }

  try {
    for (const target of targets) {
      console.log(`generate-example-screenshots: ${target.slug}`)
      await withServer(target, () => screenshotOne(browser, target))
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
