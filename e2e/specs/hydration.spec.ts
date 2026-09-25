/**
 * SSR hydration in real browsers. Three routes, each
 * exercising a different composition:
 *
 * - nextjs-app-router `/`: request-time dynamic SSR (`export const dynamic =
 *   'force-dynamic'`), built on the headless `useRiffle` + `useRiffleState`
 *   composition.
 * - nextjs-app-router `/static`: build-time SSG, built on the drop-in
 *   `<Riffle>` component itself.
 * - nuxt `/`: SSR on every request (Nuxt has no build-time prerender for a
 *   page with no dynamic data unless an explicit `routeRules` entry asks for
 *   one, which this page does not set), built on `useRiffle` plus the
 *   `v-riffle-root`/`v-riffle-card` directives.
 *
 * Each route gets three checks:
 *
 * 1. With JavaScript disabled, the server's own HTML already carries the
 *    active film's title, the readout, and a genuinely stacked layout (a
 *    bounding-box overlap between the first two cards, not merely an
 *    attribute, since that is the stronger
 *    check). This runs on every project below (chromium, firefox, webkit):
 *    it is markup, not interaction, so there is no browser-specific input
 *    model to skip.
 * 2. With JavaScript enabled, hydration produces zero console messages of
 *    type "error" or "warning" (React hydration mismatch warnings and Vue's
 *    "[Vue warn]" both count; see engine-constants.ts's sibling files for
 *    the same real-input philosophy applied here to hydration instead of
 *    gestures). Also runs on chromium, firefox and webkit: this is cheap and
 *    each rendering engine's own console can behave differently.
 * 3. After hydration, a drag on the front card advances the readout.
 *    Desktop Chromium only; see
 *    `skipUnlessChromium`.
 *
 * `.readout` and `[data-active-title]` are product markup, not test-only
 * additions: `.readout`'s class name matches every other example in this
 * repo (each example's own App.tsx/App.vue/app.css), and `data-active-title`
 * is the exact attribute each route's own check:ssr script already asserts
 * on (examples/nextjs-app-router/scripts/check-ssr.mjs,
 * examples/nuxt-example/scripts/check-ssr.mjs). Neither route carries
 * `data-testid="readout"` the way the three target examples elsewhere do, so
 * utils/examples.ts's `SELECTORS.readout` is not reused here; its
 * `SELECTORS.frontCard` (the a11y module's own `aria-roledescription` +
 * `tabindex` output) is reused as-is, since that is genuinely
 * framework/example-agnostic product markup.
 */
import { expect, test } from '@playwright/test'
import { SELECTORS, measureStepTravelPx } from '../utils/examples'
import { createPointerDriver, release, slowDrag } from '../utils/gestures'
import { boundingBoxCenter, waitForFrontCardSettledX } from '../utils/settle'
import type { Page } from '@playwright/test'

interface HydrationRoute {
  label: string
  url: string
}

// examples/nextjs-app-router/app/PosterStack.tsx, app/static/StaticPosterStack.tsx
// and examples/nuxt-example/app/pages/index.vue pass no `gap`, so all three
// use DEFAULTS.gap (20). Card width is measured from the page (see
// measureStepTravelPx), never assumed.
const GAP = 20

const ROUTES: readonly HydrationRoute[] = [
  {
    label: 'nextjs-app-router / (request-time SSR, headless useRiffle)',
    url: 'http://localhost:4310/',
  },
  {
    label: 'nextjs-app-router /static (build-time SSG, drop-in <Riffle>)',
    url: 'http://localhost:4310/static',
  },
  {
    label: 'nuxt / (useRiffle + directives)',
    url: 'http://localhost:4320/',
  },
]

const FIRST_TITLE = 'Neon Harbor'
const EXPECTED_READOUT_BEFORE = '1 / 8'
const EXPECTED_READOUT_AFTER = '2 / 8'
const READOUT = '.readout'
const ACTIVE_TITLE = '[data-active-title]'
const CARD_0 = '[data-riffle-card="0"]'
const CARD_1 = '[data-riffle-card="1"]'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** True if two rects share any area. Used for the "already stacked" check. */
function rectsOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function skipUnlessChromium(testInfo: { project: { name: string } }): void {
  test.skip(testInfo.project.name !== 'chromium', 'drag-after-hydration is desktop Chromium only')
}

/**
 * Waits for the hydration signal: the a11y module's `tabindex`/
 * `aria-roledescription` writes (packages/core/src/a11y.ts) only ever run
 * from a client-side mount path (React's ref callback via
 * packages/core/src/react/useRiffle.ts's `cardRef`, Vue's `mounted` directive
 * hook via packages/core/src/vue/directives.ts), never from SSR itself: the
 * "with JavaScript disabled" spec in this file confirms directly that this
 * selector matches nothing in the server HTML. So its appearance is the
 * actual moment hydration completed, not a fixed wait guessing at one.
 */
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.locator(SELECTORS.frontCard)).toBeVisible()
}

for (const route of ROUTES) {
  test.describe(route.label, () => {
    test('with JavaScript disabled: title, readout and stacking are present', async ({
      browser,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false })
      try {
        const page = await context.newPage()
        await page.goto(route.url)

        await expect(page.locator(ACTIVE_TITLE)).toHaveText(FIRST_TITLE)
        await expect(page.locator(READOUT)).toHaveText(EXPECTED_READOUT_BEFORE)

        // Precondition: hydration truly never ran here. If it had, the a11y
        // module would have written tabindex/aria-roledescription, which
        // with JavaScript disabled cannot happen.
        await expect(page.locator(SELECTORS.frontCard)).toHaveCount(0)

        const box0 = await page.locator(CARD_0).boundingBox()
        const box1 = await page.locator(CARD_1).boundingBox()
        expect(box0).not.toBeNull()
        expect(box1).not.toBeNull()
        // The stronger check: a real bounding-box
        // overlap between the first two cards, not merely an attribute
        // (data-riffle-root's "display:grid" / data-riffle-card's
        // "grid-area:1 / 1", already asserted textually by each route's own
        // check:ssr script). Both cards share one grid cell with no pose
        // transform applied (no JavaScript ran to apply one), so their
        // rendered boxes should coincide almost exactly.
        expect(rectsOverlap(box0!, box1!)).toBe(true)
      } finally {
        await context.close()
      }
    })

    test('hydrates with zero console errors or warnings', async ({ page }) => {
      const messages: string[] = []
      page.on('console', (msg) => {
        const type = msg.type()
        if (type === 'error' || type === 'warning') {
          messages.push(`[console:${type}] ${msg.text()}`)
        }
      })
      // Broader than just "console messages of type error or
      // warning": verified directly (break-it proof (b))
      // that a text hydration mismatch in this Next.js production build
      // (`typeof window === 'undefined' ? Date.now() : activeIndex + 1`
      // temporarily substituted into app/PosterStack.tsx's readout) never
      // reaches `page.on('console', ...)` at all: React's production bundle
      // throws it as an uncaught exception instead ("Minified React error
      // #418"), which Playwright surfaces via `pageerror`, not `console`. A
      // console-only listener would have silently passed with a real
      // hydration mismatch on the page. Vue's own hydration-mismatch report
      // (verified the same way for break-it proof (c)) does arrive as an
      // ordinary `console.error` ("Hydration completed but contains
      // mismatches."), so both listeners are needed to cover both
      // frameworks' actual failure shapes, not just the console one.
      page.on('pageerror', (error) => {
        messages.push(`[pageerror] ${error.message}`)
      })

      await page.goto(route.url)
      await waitForHydration(page)

      // Precondition: hydration genuinely happened (both markers a JS-less
      // load cannot produce) before trusting an empty message list.
      await expect(page.locator(READOUT)).toHaveText(EXPECTED_READOUT_BEFORE)

      expect(messages).toEqual([])
    })

    test('after hydration, a drag advances the readout', async ({ page }, testInfo) => {
      skipUnlessChromium(testInfo)
      const driver = createPointerDriver(page, testInfo)

      await page.goto(route.url)
      await waitForHydration(page)
      const readout = page.locator(READOUT)
      await expect(readout).toHaveText(EXPECTED_READOUT_BEFORE)

      const card = page.locator(SELECTORS.frontCard)
      const center = await boundingBoxCenter(card)
      const baselineX = await page.evaluate(
        (sel) => document.querySelector(sel)!.getBoundingClientRect().x,
        SELECTORS.frontCard,
      )
      const dx = (await measureStepTravelPx(page, GAP)) * 0.6
      await slowDrag(driver, center, dx)
      // Precondition: the drag actually moved the card (1:1 tracking during
      // an active drag), the same check interaction.spec.ts's "short drag
      // springs back" makes. An element merely existing (the previous
      // `not.toBeUndefined()` here) proves nothing about whether the drag
      // actually engaged.
      const midDragX = await page.evaluate(
        (sel) => document.querySelector(sel)!.getBoundingClientRect().x,
        SELECTORS.frontCard,
      )
      expect(Math.abs(midDragX - baselineX)).toBeGreaterThan(dx * 0.5)
      await release(driver)

      await expect(readout).toHaveText(EXPECTED_READOUT_AFTER, { timeout: 3000 })
      await waitForFrontCardSettledX(page, SELECTORS.frontCard)
    })
  })
}
