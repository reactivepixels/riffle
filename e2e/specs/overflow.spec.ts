/**
 * Verifies that a 375px-wide page never scrolls horizontally. Every example
 * and every built docs page (its sitemap, so a new page is covered without
 * a hand-maintained list) is checked at rest, whether or not it embeds a
 * card stack: a static image can overflow a narrow viewport just as easily
 * as a live one. Wherever a page does embed a card stack, it is also
 * checked mid-animation, since a card stack is never as small as it looks.
 *
 * A card stack is never as small as it looks: the fanned cards behind the
 * front one, and whichever card is mid-flight during a drag or a settle,
 * both extend past the space the front card alone occupies. Two things keep
 * that from widening the page on a narrow phone:
 *
 * - Every example's own page CSS scales its card size and the room it
 *   reserves for the fan down at narrow widths (a `@media (max-width: 520px)`
 *   query, plus the card's own size read from the same breakpoint in JS,
 *   since it is set inline for the engine to measure). This spec asserts the
 *   *settled*, at-rest page fits.
 * - While the exiting card animates toward the depth -1 exit slot, it is
 *   still visible and genuinely extends outside the stack's own box: that is
 *   real motion, not a bug, and it can widen the page's scrollable area for
 *   that moment on a real phone. Every example's page, and every docs demo
 *   island's content-column wrapper, sets `overflow-x: clip` on a wide
 *   ancestor (the page itself, or the content column for a docs island) to
 *   contain that motion without cutting it short; see the docs Getting
 *   Started page's "Layout" note for why the clip belongs there and not on
 *   the stack's own narrow box. This spec samples `scrollWidth`/`clientWidth`
 *   on every animation frame from the moment `next()` is clicked through to
 *   settle, not only at the end, since a transient mid-animation overflow
 *   would never show up in an end-of-animation-only check.
 *
 * Also verifies core's own behaviour that makes the settled case possible at
 * all: an invisible card (resolved pose opacity 0, the depth -1 exit slot
 * chief among them) still carries its real layout offset in its pose, often
 * well outside the container; `packages/core/src/render/transform.ts`'s
 * `applyPose` writes such a card's CSS transform as the neutral
 * translate/rotate/scale instead of that offset, so an invisible card never
 * contributes to the page's scrollable width on its own.
 *
 * Chromium and mobile-chromium only, the same reasoning a11y.spec.ts's own
 * comment gives for its own Chromium-only scope: `scrollWidth`/`clientWidth`
 * is a layout measurement, not a rendering-engine-specific one, and
 * interaction.spec.ts already covers Firefox and WebKit behaviourally. Both
 * projects are checked (not just chromium) because touch-driven mobile
 * viewports are exactly where a 375px-wide page is real, not synthetic.
 */
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { routeCdnToLocalBuild } from '../utils/cdn-route'
import { ALL_EXAMPLE_TARGETS, SELECTORS, advanceTarget } from '../utils/examples'
import { createPointerDriver, smoothMove } from '../utils/gestures'
import { SLOP_PX } from '../utils/engine-constants'
import { waitForFrontCardSettledX } from '../utils/settle'

const VIEWPORT = { width: 375, height: 800 }
const NEXT_BUTTON_NAME = /^next/i
// 120 rAF callbacks is 2s at 60fps: every example's default spring (or
// vertical-stack's/vanilla-basic's own) settles well inside that, and the
// loop below also stops early once the front card itself has stopped
// moving, so this is a safety cap, not the typical sample count.
const MAX_ANIMATION_FRAMES = 120

interface OverflowSample {
  frame: number
  scrollWidth: number
  clientWidth: number
}

async function measureOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
}

function assertSample(sample: { scrollWidth: number; clientWidth: number }, label: string): void {
  expect(
    sample.scrollWidth,
    `${label}: document.documentElement.scrollWidth (${sample.scrollWidth}) should equal ` +
      `clientWidth (${sample.clientWidth}); a card is still contributing to the page's ` +
      `scrollable width`,
  ).toBe(sample.clientWidth)
}

/**
 * Samples `scrollWidth`/`clientWidth` on every animation frame from right
 * now until the front card's own transform stops changing (settled), or
 * `maxFrames` is reached, whichever comes first. Runs entirely inside the
 * page via one `evaluate` (not one Playwright round trip per frame): a
 * round trip per `requestAnimationFrame` callback would itself be slow
 * enough to change the timing being sampled.
 */
async function sampleOverflowThroughSettle(
  page: Page,
  frontCardSelector: string,
  maxFrames: number,
): Promise<OverflowSample[]> {
  return page.evaluate(
    async ({ frontCardSelector, maxFrames }) => {
      const frontCard = document.querySelector(frontCardSelector)
      const readTransform = () => (frontCard as HTMLElement | null)?.style.transform ?? ''
      const samples: { frame: number; scrollWidth: number; clientWidth: number }[] = []
      let lastTransform = readTransform()
      let stableFrames = 0
      for (let frame = 0; frame < maxFrames; frame += 1) {
        await new Promise<number>((resolve) => requestAnimationFrame(resolve))
        samples.push({
          frame,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        })
        const transform = readTransform()
        stableFrames = transform === lastTransform ? stableFrames + 1 : 0
        lastTransform = transform
        if (stableFrames >= 3) break
      }
      return samples
    },
    { frontCardSelector, maxFrames },
  )
}

function assertEverySample(samples: OverflowSample[], label: string): void {
  // Precondition: the animation actually produced samples to check, so a
  // selector that stopped matching (and so an empty sample array) cannot
  // silently read as "every frame passed".
  expect(samples.length, `${label}: sampled zero animation frames`).toBeGreaterThan(0)
  for (const sample of samples) {
    assertSample(sample, `${label}, frame ${sample.frame}`)
  }
}

async function gotoExample(page: Page, url: string): Promise<void> {
  await routeCdnToLocalBuild(page)
  await page.goto(url)
}

test.describe('no horizontal overflow at 375px: examples', () => {
  for (const target of ALL_EXAMPLE_TARGETS) {
    test(`${target.name}: at rest, and on every frame from next() through settle`, async ({
      page,
    }) => {
      await page.setViewportSize(VIEWPORT)
      await gotoExample(page, target.url)
      // Precondition: the carousel actually mounted before measuring it.
      await expect(page.locator(SELECTORS.stackRoot).first()).toBeVisible()

      assertSample(await measureOverflow(page), `${target.name} (at rest)`)

      await advanceTarget(page, target)
      const samples = await sampleOverflowThroughSettle(
        page,
        SELECTORS.frontCard,
        MAX_ANIMATION_FRAMES,
      )
      assertEverySample(samples, `${target.name} (next())`)

      // Precondition: the sampling loop really did run until settled, not
      // just until it hit the frame cap, so "every sample passed" covers
      // the full animation, mid-transition included, not merely its start.
      await waitForFrontCardSettledX(page, SELECTORS.frontCard)
      assertSample(await measureOverflow(page), `${target.name} (settled)`)
    })
  }
})

// --- Docs site: every built page that embeds a live demo ---

const DOCS_PORT = 4340
const DOCS_ORIGIN = `http://localhost:${DOCS_PORT}`
// apps/docs/astro.config.mjs's `site`. Each sitemap <loc> is this origin
// plus the base-prefixed ("/riffle/...") path astro preview actually serves.
const DOCS_SITE_ORIGIN = 'https://reactivepixels.github.io'

const here = fileURLToPath(new URL('.', import.meta.url))
const docsSitemapPath = resolve(here, '../../apps/docs/dist/sitemap-0.xml')

/**
 * Enumerates docs pages from the built sitemap rather than a hand list,
 * exactly like a11y.spec.ts's own `docsPages()`, so a new docs page with a
 * demo is covered automatically.
 */
function docsPages(): string[] {
  const xml = readFileSync(docsSitemapPath, 'utf8')
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!)
  if (locs.length === 0) {
    throw new Error(`docsPages: no <loc> entries found in ${docsSitemapPath}`)
  }
  return locs.map((loc) => {
    if (!loc.startsWith(DOCS_SITE_ORIGIN)) {
      throw new Error(
        `docsPages: ${loc} does not start with the configured site origin ${DOCS_SITE_ORIGIN}`,
      )
    }
    return loc.slice(DOCS_SITE_ORIGIN.length)
  })
}

test.describe('no horizontal overflow at 375px: docs', () => {
  test('every built docs page at rest, plus every frame through settle after next() wherever a live demo exists', async ({
    page,
  }) => {
    // Every one of the sitemap's ~50+ pages gets a full navigation plus a
    // networkidle wait, and each page with a demo also samples every
    // animation frame from next() through settle: legitimately slower than
    // the default 30s test timeout, the same reason a11y.spec.ts's own
    // "every built docs page" test needs one.
    test.slow()
    await page.setViewportSize(VIEWPORT)
    const pages = docsPages()
    // Precondition: the sitemap enumeration actually found pages.
    expect(pages.length).toBeGreaterThan(0)

    let pagesWithDemos = 0

    for (const path of pages) {
      await test.step(path, async () => {
        await page.goto(`${DOCS_ORIGIN}${path}`)
        await page.waitForLoadState('networkidle')

        // The at-rest check runs for every page, demo or not: a page like
        // /examples has no live carousel to sample next() on, but its own
        // static preview images can still overflow the viewport, and a page
        // this check never visits cannot be asserted on at all. This used to
        // sit after the demo check below and return early with it, which
        // meant /examples, /accessibility and every other demo-less page had
        // no overflow coverage whatsoever; confirmed directly by widening a
        // gallery preview past 375px and watching this test still pass
        // before this fix, then fail after it, with the widened preview
        // still in place.
        assertSample(await measureOverflow(page), `${path} (at rest)`)

        const hasDemo = (await page.locator(SELECTORS.stackRoot).count()) > 0
        if (!hasDemo) return
        pagesWithDemos += 1

        const nextButton = page.getByRole('button', { name: NEXT_BUTTON_NAME })
        if ((await nextButton.count()) > 0) {
          await nextButton.first().click()
          const samples = await sampleOverflowThroughSettle(
            page,
            SELECTORS.frontCard,
            MAX_ANIMATION_FRAMES,
          )
          assertEverySample(samples, `${path} (next())`)
          await waitForFrontCardSettledX(page, SELECTORS.frontCard)
          assertSample(await measureOverflow(page), `${path} (settled)`)
        }
      })
    }

    // Precondition: at least the home page, adapters, gestures and layouts
    // pages carry a live demo, so a silently empty sitemap enumeration (or a
    // selector that stopped matching) cannot read as "every page passed".
    expect(pagesWithDemos).toBeGreaterThan(0)
  })
})

/**
 * Getting Started's first-stack demo renders the README quickstart file
 * unchanged (see src/components/tracks/demos/FirstStack{React,Vue}.astro and
 * quickstart-vanilla.ts): below 520px it breaks out of the content column to
 * the full viewport width instead of shrinking (custom.css's
 * `.quickstart-demo`/`.not-content[data-demo='first-stack']`), so the
 * README's 300px card plus its fan still fits. A `zoom` on an ancestor was
 * tried and reverted: `zoom` rescales an element's own rendered layout (so
 * `getBoundingClientRect()` reads the visually scaled position) without
 * scaling the pointer's own screen-pixel movement (`clientX`/`clientY` stay
 * real viewport pixels), so the card's real screen position stopped tracking
 * the finger 1:1 even though the engine's own `transform: translateX(...)`
 * value (read via a raw matrix, as `frontCardTranslateX` does elsewhere in
 * this suite) still showed the untouched, unscaled distance. Measured
 * directly: an 80px drag rendered the card moving about 56px on screen. This
 * reads the rendered box (`getBoundingClientRect()`), the only measurement
 * that would actually catch a regression back to `zoom`, and asserts it
 * tracks the finger 1:1 at 375px, on every track.
 *
 * "1:1" here means the card moves exactly as far as the pointer travelled
 * past `SLOP_PX`, not as far as the pointer travelled in total: the engine
 * only starts translating the card once a drag clears its own slop
 * threshold (packages/core/src/gesture/pointer.ts), so even a perfectly
 * tracking drag legitimately lands `SLOP_PX` short of the raw pointer
 * distance. Comparing straight to `dx` (as an earlier version of this test
 * did) measured that slop as if it were error: at `dx - SLOP_PX = 74`,
 * confirmed directly at 375px on chromium and mobile-chromium, all three
 * tracks, the card measured ~75.16px moved every time (diff ~1.16px,
 * deterministic across every run), while comparing to the raw `dx` read as
 * "~4.8px short" instead, the same number `dx`-based margin this test used
 * to carry to explain away.
 */
test.describe('the first-stack demo drags 1:1 at 375px', () => {
  const TRACKS = ['vanilla', 'react', 'vue'] as const

  for (const fw of TRACKS) {
    test(fw, async ({ page }, testInfo) => {
      const driver = createPointerDriver(page, testInfo)
      await page.setViewportSize(VIEWPORT)
      await page.goto(`${DOCS_ORIGIN}/riffle/${fw}/getting-started/`)
      await page.waitForLoadState('networkidle')

      const card = page.locator(SELECTORS.frontCard).first()
      await card.waitFor({ state: 'visible' })
      await card.scrollIntoViewIfNeeded()

      const before = await card.boundingBox()
      if (!before) throw new Error('the first-stack demo drags 1:1: no bounding box for front card')
      const center = { x: before.x + before.width / 2, y: before.y + before.height / 2 }

      const dx = 80
      await driver.down(center.x, center.y)
      await smoothMove(driver, center, { x: center.x + dx, y: center.y }, 5)
      const during = await card.boundingBox()
      await driver.up()
      if (!during) throw new Error('the first-stack demo drags 1:1: no bounding box mid-drag')

      // Precondition: the drag actually moved the card at all, so the
      // tolerance check below cannot pass on a gesture that silently never
      // engaged the engine.
      const moved = during.x - before.x
      expect(Math.abs(moved)).toBeGreaterThan(dx / 2)

      // 1:1 tracking of the pointer's own travel past slop, within a margin
      // for the front card's own slight rotation overlay during a drag
      // (which skews a bounding box a little, unlike a pure translation)
      // and subpixel rounding: measured directly at ~1.16px of that skew,
      // deterministic, with the fix in place. A regression to `zoom: 0.75`
      // misses by about 24px (25% of the 80px drag), well clear of this
      // margin.
      const expectedMove = dx - SLOP_PX
      expect(Math.abs(moved - expectedMove)).toBeLessThan(2)
    })
  }
})

/**
 * Every card a reader can see must be fully inside every clipping ancestor.
 * The overflow checks above prove nothing widens the page, but a clip on the
 * wrong box satisfies them too: it simply hides the fanned cards behind the
 * front one. This check fails if any visible card is cut off.
 */
async function clippedCards(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    for (const card of document.querySelectorAll<HTMLElement>('[aria-roledescription="slide"]')) {
      const box = card.getBoundingClientRect()
      if (box.width === 0 || Number(getComputedStyle(card).opacity) <= 0.01) continue
      for (let el = card.parentElement; el; el = el.parentElement) {
        const overflowX = getComputedStyle(el).overflowX
        if (overflowX !== 'clip' && overflowX !== 'hidden') continue
        const clip = el.getBoundingClientRect()
        if (box.left < clip.left - 1 || box.right > clip.right + 1) {
          out.push(
            `"${card.getAttribute('aria-label') ?? card.textContent?.trim()}" spans ` +
              `${Math.round(box.left)}..${Math.round(box.right)} but <${el.tagName.toLowerCase()} ` +
              `class="${el.className}"> clips at ${Math.round(clip.left)}..${Math.round(clip.right)}`,
          )
        }
      }
    }
    return out
  })
}

for (const viewport of [VIEWPORT, { width: 1440, height: 900 }]) {
  test.describe(`visible cards are never clipped at ${viewport.width}px`, () => {
    for (const target of ALL_EXAMPLE_TARGETS) {
      test(`${target.name}`, async ({ page }) => {
        await page.setViewportSize(viewport)
        await gotoExample(page, target.url)
        await expect(page.locator('[aria-roledescription="slide"]').first()).toBeVisible()
        expect(await clippedCards(page)).toEqual([])
      })
    }

    test('every docs page with a live demo, on every tab', async ({ page }) => {
      test.slow()
      await page.setViewportSize(viewport)
      let checked = 0
      for (const path of docsPages()) {
        await page.goto(`${DOCS_ORIGIN}${path}`)
        await page.waitForLoadState('networkidle')
        if ((await page.locator(SELECTORS.stackRoot).count()) === 0) continue
        checked += 1
        expect(await clippedCards(page), `${path}`).toEqual([])
        const tabs = page.getByRole('tab')
        for (let i = 0; i < (await tabs.count()); i += 1) {
          await tabs.nth(i).click()
          await page.waitForTimeout(300)
          expect(await clippedCards(page), `${path}, tab ${i + 1}`).toEqual([])
        }
      }
      expect(checked).toBeGreaterThan(0)
    })
  })
}
