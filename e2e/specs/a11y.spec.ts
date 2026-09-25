/**
 * Accessibility gates: axe-core
 * against every example and every built docs page, at rest and after one
 * next() (roving tabindex and inert change the tree), plus two checks
 * axe-core never makes on its own: that a background card's controls are
 * genuinely unreachable, and that the live region's announcement is
 * debounced rather than flooded under a rapid burst of navigation.
 *
 * Every test in this file runs on Chromium only (see playwright.config.ts's
 * testIgnore on firefox/webkit/mobile-chromium): axe-core inspects the
 * rendered accessibility tree, which does not vary meaningfully across
 * engines the way pixel output or raw input handling do
 * (interaction.spec.ts already covers Firefox and WebKit behaviourally), so
 * running the identical scan on three engines would not buy additional
 * coverage, only CI time.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import type { AxeResults, Result } from 'axe-core'
import { routeCdnToLocalBuild } from '../utils/cdn-route'
import {
  ALL_EXAMPLE_TARGETS,
  SELECTORS,
  advanceTarget,
  type ExampleTarget,
} from '../utils/examples'
import { waitAnimationFrames, waitForFrontCardSettledX } from '../utils/settle'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

// Every "next" control across every example and docs page shares an
// accessible name starting with "Next" ("Next film", "Next card", "Next
// track", "Next waypoint"; confirmed against each example's and each docs
// component's own source), so one role+name locator drives all of them
// rather than a per-target selector map.
const NEXT_BUTTON_NAME = /^next/i

async function scan(page: Page): Promise<AxeResults> {
  return new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
}

function formatViolations(violations: Result[]): string {
  return violations
    .map((v) => {
      const targets = v.nodes.map((n) => `    ${n.target.join(' ')}`).join('\n')
      return `${v.id} [${v.impact ?? 'unknown'}] ${v.help}\n${targets}\n    ${v.helpUrl}`
    })
    .join('\n\n')
}

async function expectNoViolations(page: Page): Promise<void> {
  const results = await scan(page)
  expect(results.violations, formatViolations(results.violations)).toEqual([])
}

/**
 * Advances `target`'s stack by one card (see `advanceTarget`; most targets
 * click their Next button, but a target with no Next button of its own,
 * such as react-recipes' programmatic-control page, sets its own `advance`
 * selector) and waits for the front card to settle. The a11y attributes
 * themselves (inert, tabindex, aria-label) are written synchronously by the
 * click handler (packages/core/src/riffle.ts's syncActive, called from
 * setTarget in the same tick), so this wait is for the visual transition,
 * not the accessibility tree: axe also reads computed styles
 * (colour-contrast, target-size), which are only correct once a card's
 * transform and opacity have actually settled.
 */
async function next(page: Page, target: ExampleTarget): Promise<void> {
  await advanceTarget(page, target)
  await waitForFrontCardSettledX(page, SELECTORS.frontCard)
  await waitAnimationFrames(page, 5)
}

/**
 * Navigates to an example, routing vanilla-basic's CDN import
 * (`https://esm.sh/@rpxl/riffle@0.1`, which does not exist until publish) to
 * the workspace build first, the same way interaction.spec.ts does. Applied
 * to every target, not just vanilla-basic: it only intercepts esm.sh
 * requests, so it is a no-op for every example that does not make one.
 */
async function gotoExample(page: Page, url: string): Promise<void> {
  await routeCdnToLocalBuild(page)
  await page.goto(url)
}

test.describe('examples: axe', () => {
  for (const target of ALL_EXAMPLE_TARGETS) {
    test(`${target.name}: no violations at rest`, async ({ page }) => {
      await gotoExample(page, target.url)
      // Precondition: the carousel actually mounted before axe scans it.
      await expect(page.locator(SELECTORS.stackRoot)).toBeVisible()
      await expectNoViolations(page)
    })

    test(`${target.name}: no violations after one next()`, async ({ page }) => {
      await gotoExample(page, target.url)
      const before = await page.locator(SELECTORS.frontCard).getAttribute('aria-label')
      await next(page, target)
      const after = await page.locator(SELECTORS.frontCard).getAttribute('aria-label')
      // Precondition: next() actually moved the stack, so this is really
      // scanning the post-navigation tree, not a no-op.
      expect(after).not.toBe(before)
      await expectNoViolations(page)
    })
  }
})

// --- Docs site ---

const DOCS_PORT = 4340
const DOCS_ORIGIN = `http://localhost:${DOCS_PORT}`
// apps/docs/astro.config.mjs's `site`. Each sitemap <loc> is this origin
// plus the base-prefixed ("/riffle/...") path astro preview actually serves.
const DOCS_SITE_ORIGIN = 'https://reactivepixels.github.io'

const here = fileURLToPath(new URL('.', import.meta.url))
const docsSitemapPath = resolve(here, '../../apps/docs/dist/sitemap-0.xml')

/**
 * Enumerates docs pages from the built sitemap rather than a hand list,
 * so a new docs page is scanned automatically. Read
 * inside the test body, not at module load: by the time a test runs, the
 * docs webServer entry (playwright.config.ts) has already finished
 * `astro build`, guaranteeing this file exists, whereas module load could
 * race that build.
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

/**
 * The adapters pages' live demos
 * (apps/docs/src/content/docs/adapters/*.mdx: `<ReactStack client:visible />`,
 * `<VueStack client:visible />`, and the react.mdx/vue.mdx pages' own extra
 * `<HeadlessStack client:visible />` / `<ScriptSetupStack client:visible />`)
 * are Astro islands: Astro defers loading their JS bundle, and so every
 * a11y attribute the adapter and a11y.ts write client-side (`aria-roledescription`,
 * `tabindex`, `inert`, the labels), until the component actually scrolls
 * into the viewport. `[data-riffle-root]` and `[data-riffle-card]` are
 * server-rendered by the adapters themselves (`packages/core/src/react/useRiffle.ts`'s
 * `getRootProps`, `packages/core/src/vue/directives.ts`'s `v-riffle-root`, both via
 * `getSSRProps`), so they exist in the initial HTML regardless of hydration,
 * which is what makes them a safe, always-present handle to scroll to and
 * poll, independent of whether the island has mounted yet.
 *
 * Scanning before hydration finishes, or mid-way through it (one card
 * processed, the rest not yet), reads a tree the a11y module never finished
 * writing: an axe violation caused by test timing, not a real defect in the
 * product (reproduced once, from a one-off
 * `/riffle/adapters/vue/` failure that did not reproduce in five idle runs;
 * root-caused here).
 *
 * Hydrated is detected from the engine's own signal, not a fixed wait: the
 * root's own `aria-roledescription="carousel"` (a11y.ts's `update()`, never
 * part of the server-rendered markup, written only client-side), and every
 * one of the root's `[data-riffle-card]` descendants carrying either
 * `tabindex="0"` (the one active card) or `inert` (every other card): the
 * same `update()` call writes both, for every registered card, in the same
 * pass, so this is true only once hydration has actually finished for that
 * root, not merely started. (`aria-current` was considered as the signal
 * instead; a11y.ts does not write that attribute at all, only
 * `tabindex`/`inert`, so this uses the attribute the module actually
 * produces rather than one it does not.)
 */
async function waitForIslandsHydrated(page: Page, pageLabel: string): Promise<void> {
  const roots = await page.locator('[data-riffle-root]').elementHandles()
  for (let i = 0; i < roots.length; i += 1) {
    const root = roots[i]!
    await root.scrollIntoViewIfNeeded()
    const deadlineMs = Date.now() + 10_000
    for (;;) {
      const hydrated = await root.evaluate((el: Element) => {
        if (el.getAttribute('aria-roledescription') !== 'carousel') return false
        const cards = Array.from(el.querySelectorAll('[data-riffle-card]'))
        if (cards.length === 0) return false
        return cards.every(
          (card) => card.getAttribute('tabindex') === '0' || card.hasAttribute('inert'),
        )
      })
      if (hydrated) break
      if (Date.now() > deadlineMs) {
        throw new Error(
          `waitForIslandsHydrated: ${pageLabel}'s [data-riffle-root] #${i} never hydrated ` +
            `(its client:visible island did not finish mounting within 10s)`,
        )
      }
    }
  }
}

test.describe('docs: axe', () => {
  test('every built docs page has no violations, at rest and after one next() where the page has one', async ({
    page,
  }) => {
    const pages = docsPages()
    // One test walks every page in the sitemap, scanning each at rest and after
    // next(), so its running time grows with the site. Budget per page rather
    // than a fixed ceiling that would need raising whenever a page is added.
    test.setTimeout(30_000 + pages.length * 5_000)
    // Precondition: the sitemap enumeration actually found pages, so a
    // silently empty list can never read as "every page passed".
    expect(pages.length).toBeGreaterThan(0)

    for (const path of pages) {
      await test.step(`${path} (at rest)`, async () => {
        await page.goto(`${DOCS_ORIGIN}${path}`)
        // Starlight's Expressive Code sets `tabindex="0"` on a scrollable
        // code block via its own client script, which runs slightly after
        // the `load` event `page.goto()` already waited for (confirmed
        // directly: reading the attribute immediately after goto() returns
        // null on every code block, then "0" once network is idle).
        // Without this wait, axe's scrollable-region-focusable flags those
        // blocks as a false positive against a script that has not run yet.
        await page.waitForLoadState('networkidle')
        await waitForIslandsHydrated(page, path)
        await expectNoViolations(page)
      })

      // Not every docs page embeds a live carousel (getting-started,
      // concepts and migration are prose only); only run the after-next()
      // scan on the ones that do (the home page's hero demo, and the
      // adapters page's side-by-side React and Vue stacks).
      const nextButton = page.getByRole('button', { name: NEXT_BUTTON_NAME })
      const nextButtonCount = await nextButton.count()
      if (nextButtonCount > 0) {
        await test.step(`${path} (after next())`, async () => {
          // Re-checked here too, not just relied on from the "at rest" step
          // above: a resolved wait is cheap (the loop inside returns on its
          // very first check once already hydrated), and this step must
          // never click a next control, or read a front card's aria-label,
          // belonging to an island that has not actually finished mounting.
          await waitForIslandsHydrated(page, path)
          // `.first()` on both sides, consistently: on the adapters page,
          // two carousels (React and Vue) are on the page at once, each with
          // its own front card and next button, and clicking the button that
          // is first in DOM order moves the carousel whose own front card is
          // also first in DOM order (each example nests its controls after
          // its own stack, so this pairing holds for every target here, not
          // just adapters). Same precondition shape the examples loop above
          // uses at "no violations after one next()": next() must actually
          // have moved something, or this is scanning the same tree twice
          // under a different name.
          const frontCard = page.locator(SELECTORS.frontCard).first()
          const before = await frontCard.getAttribute('aria-label')
          await nextButton.first().click()
          await waitAnimationFrames(page, 15)
          const after = await frontCard.getAttribute('aria-label')
          expect(after).not.toBe(before)
          await expectNoViolations(page)
        })
      }
    }
  })
})

// --- Explicit assertion, independent of axe: background card controls are
// never focusable. ---

test.describe('background card controls are unreachable', () => {
  const FIXTURE_URL = 'http://localhost:4303/fixtures/image-link-card.html'

  test('inert is on every background card, and neither a direct focus() call nor Tab (forward and back, past both ends of the stack) can reach a background card control', async ({
    page,
  }) => {
    await page.goto(FIXTURE_URL)
    const cards = page.locator('#stack > .card')
    // Precondition: the fixture actually rendered its three cards, each
    // with the <button data-testid="card-action-N"> this test depends on,
    // and the before/after focusables the Tab loop below needs somewhere
    // else on the page to move to.
    await expect(cards).toHaveCount(3)
    await expect(page.getByTestId('card-action-0')).toHaveCount(1)
    await expect(page.getByTestId('card-action-1')).toHaveCount(1)
    await expect(page.getByTestId('card-action-2')).toHaveCount(1)
    await expect(page.locator('#before-stack')).toHaveCount(1)
    await expect(page.locator('#after-stack')).toHaveCount(1)

    // Precondition: card 0 is the active (front) one; cards 1 and 2 are
    // background and genuinely inert.
    await expect(cards.nth(0)).not.toHaveAttribute('inert', '')
    await expect(cards.nth(1)).toHaveAttribute('inert', '')
    await expect(cards.nth(2)).toHaveAttribute('inert', '')

    // The active card's own control really is focusable: a genuine contrast
    // for the assertion below, not "focus() never works on this page".
    const activeButton = page.getByTestId('card-action-0')
    await activeButton.focus()
    await expect(activeButton).toBeFocused()

    // Direct assertion: a background card's control cannot receive focus
    // even when explicitly asked to.
    const backgroundButton = page.getByTestId('card-action-1')
    await backgroundButton.focus()
    await expect(backgroundButton).not.toBeFocused()

    // Identifies a background-card leak by the fixture's own per-card index
    // (`data-riffle-card`, set directly in the fixture, independent of
    // a11y.ts) compared against the currently active card's index (read
    // from `tabindex="0"`, which a11y.ts still writes regardless of the
    // `inert` break-it this test is proofed against), rather than by the
    // presence of `[inert]` itself: once `inert` is removed, an
    // `[inert]`-based check has nothing left to match, so it would read as
    // "no leak" even with every background control wide open, which is
    // exactly the false negative this replaces.
    const focusedCardLeaksIntoBackground = () =>
      page.evaluate(() => {
        const active = document.querySelector('[aria-roledescription="carousel"] [tabindex="0"]')
        const activeIndex = active?.getAttribute('data-riffle-card')
        const focusedCard = document.activeElement?.closest('[data-riffle-card]')
        const focusedIndex = focusedCard?.getAttribute('data-riffle-card')
        return focusedIndex != null && focusedIndex !== activeIndex
      })

    // Tabs through the whole page, not just around the stack, forward past
    // the stack to #after-stack and back past it to #before-stack: a
    // focusable before and after the stack (added to this fixture for this
    // fix) is what actually exercises wrap-around in both directions.
    // Without them, the fixture had nowhere else to Tab to, so a loop that
    // starts and stays on the one focusable card proves nothing about
    // leakage past either end of the stack.
    // Precondition: the forward pass actually reaches the far side of the
    // page (the active card also holds a focusable <a>, since the
    // image-and-link-card fixture adds one, so the active card alone is two tab
    // stops, not one; 8 is comfortably past before-stack + both of the
    // active card's own focusables + after-stack, with room to spare).
    // Landing on #after-stack rather than somewhere still inside the stack
    // is itself part of what proves inert is doing its job: a background
    // card's link or button would otherwise be additional, illegitimate tab
    // stops in between.
    await page.locator('#before-stack').focus()
    let reachedAfter = false
    for (let i = 0; i < 8 && !reachedAfter; i += 1) {
      await page.keyboard.press('Tab')
      expect(await focusedCardLeaksIntoBackground()).toBe(false)
      reachedAfter = await page
        .locator('#after-stack')
        .evaluate((el) => el === document.activeElement)
    }
    expect(reachedAfter).toBe(true)

    // Same pass in reverse, from the far side back to the near one: Tab and
    // Shift+Tab are independent code paths in every browser's own focus
    // order implementation, so this is not redundant with the forward pass.
    let reachedBefore = false
    for (let i = 0; i < 8 && !reachedBefore; i += 1) {
      await page.keyboard.press('Shift+Tab')
      expect(await focusedCardLeaksIntoBackground()).toBe(false)
      reachedBefore = await page
        .locator('#before-stack')
        .evaluate((el) => el === document.activeElement)
    }
    expect(reachedBefore).toBe(true)
  })
})

// --- Live-region flood check ---

test.describe('live region: debounced announcement under a rapid burst', () => {
  test('10 next() calls inside 200ms change the live region text a bounded number of times, and the final text names the final card', async ({
    page,
  }) => {
    // react-movie-stack: getLabel gives each card real, distinct text
    // (a film title), so the final announcement is a meaningful string to
    // compare, not just a bare position.
    await page.goto('http://localhost:4301/')

    const liveRegionSelector = '[aria-roledescription="carousel"] [aria-live="polite"]'
    // Precondition: the module created exactly its one live region, and
    // nothing has been announced yet.
    await expect(page.locator(liveRegionSelector)).toHaveCount(1)
    await expect(page.locator(liveRegionSelector)).toHaveText('')

    const { mutationCount, burstElapsedMs } = await page.evaluate(async () => {
      const region = document.querySelector(
        '[aria-roledescription="carousel"] [aria-live="polite"]',
      )
      if (!region) throw new Error('no live region found')
      const nextButton = document.querySelector<HTMLButtonElement>('[data-testid="next-button"]')
      if (!nextButton) throw new Error('no next button found')

      let mutations = 0
      const observer = new MutationObserver((records) => {
        mutations += records.length
      })
      observer.observe(region, { characterData: true, childList: true, subtree: true })

      const start = performance.now()
      for (let i = 0; i < 10; i += 1) nextButton.click()
      const burstElapsedMs = performance.now() - start

      // packages/core/src/riffle.ts's syncActive debounces the announce
      // (not the attribute update) 150ms after the *last* change; wait
      // comfortably past that before reading the mutation count.
      await new Promise((resolve) => setTimeout(resolve, 500))
      observer.disconnect()
      return { mutationCount: mutations, burstElapsedMs }
    })

    // Precondition: the burst really was fast (well inside the target
    // "10 in 200ms"), not spread out enough to let each announce fire on
    // its own regardless of debouncing.
    expect(burstElapsedMs).toBeLessThan(200)

    // Debounced: a burst of 10 changes announces once when it lands, not
    // ten times while it is in flight. Bounded at 2 rather than exactly 1
    // so an incidental extra write does not make this brittle, while still
    // failing hard against real flooding (10 raw calls would show up as 10
    // mutations, one per click, if the announce were not debounced).
    expect(mutationCount).toBeGreaterThan(0)
    expect(mutationCount).toBeLessThanOrEqual(2)

    const finalLiveText = await page.locator(liveRegionSelector).textContent()
    const finalCardLabel = await page.locator(SELECTORS.frontCard).getAttribute('aria-label')
    // formatCardLabel (packages/core/src/a11y.ts) is shared by the card's
    // own aria-label and the live-region announcement by construction, so
    // the final announcement names the card the burst actually landed on.
    expect(finalLiveText).not.toBe('')
    expect(finalLiveText).toBe(finalCardLabel)
  })
})
