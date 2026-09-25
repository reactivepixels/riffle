import type { Page } from '@playwright/test'
import { stepTravelPx } from './engine-constants'

/**
 * The three target examples, each served on a fixed port
 * so tests run against a real build (see playwright.config.ts's `webServer`
 * entries), not the dev server.
 *
 * The readout and the front card are located the same way in every example
 * without touching card markup:
 *  - front card: `[aria-roledescription="carousel"] [tabindex="0"]`. Both
 *    attributes are written by the engine's own a11y module
 *    (packages/core/src/a11y.ts: container gets role=group plus
 *    aria-roledescription=carousel; the active card alone gets tabindex=0,
 *    every other card gets tabindex=-1 and inert). This is a product signal,
 *    not a test convenience, and it is the exact element that receives the
 *    pose transform (packages/core/src/riffle.ts applyPose(el, ...) writes
 *    to the same `el` that a11y.update() attributes, confirmed via
 *    packages/core/src/adapter.ts's cardRef -> registerNode wiring, shared
 *    by both adapters and by vanilla-basic's direct registerNode calls).
 *  - readout: the two movie-stack examples already rendered `{index+1} /
 *    {count}`; vanilla-basic rendered nothing. All three now carry
 *    `data-testid="readout"`.
 *  - the "next" control: `data-testid="next-button"` on all three, since
 *    react/vue label it "Next film" and vanilla labels it "Next card".
 */
export interface ExampleDescriptor {
  name: 'react' | 'vue' | 'vanilla'
  url: string
  /** The example's `gap` option (none of the three passes one, so DEFAULTS.gap). */
  gap: number
}

const READOUT = '[data-testid="readout"]'
const NEXT_BUTTON = '[data-testid="next-button"]'
const FRONT_CARD = '[aria-roledescription="carousel"] [tabindex="0"]'
const STACK_ROOT = '[aria-roledescription="carousel"]'

export const SELECTORS = {
  readout: READOUT,
  nextButton: NEXT_BUTTON,
  frontCard: FRONT_CARD,
  stackRoot: STACK_ROOT,
} as const

// None of the three examples passes a `gap` option, so all three use
// DEFAULTS.gap (packages/core/src/riffle.ts). Card width is NOT listed here:
// react-movie-stack and vue-movie-stack switch cardWidth from 220 to 150 at
// 520px and below, so any fixed number is wrong on one project or another.
// Specs read it from the page instead; see measureStepTravelPx below.
const DEFAULT_GAP = 20

export const EXAMPLES: readonly ExampleDescriptor[] = [
  { name: 'react', url: 'http://localhost:4301/', gap: DEFAULT_GAP },
  { name: 'vue', url: 'http://localhost:4302/', gap: DEFAULT_GAP },
  { name: 'vanilla', url: 'http://localhost:4303/', gap: DEFAULT_GAP },
]

/**
 * One step of travel in pixels (`cardExtent + gap`, see stepTravelPx), with
 * cardExtent measured from the front card's own layout width at this
 * viewport, not assumed. offsetWidth, not getBoundingClientRect(): it is the
 * untransformed layout box, so the front card's scale and rotation never
 * leak into the number. Every example sizes its card element to exactly the
 * cardWidth it gives the engine, so this is the same number the engine
 * divides a drag by. Call it once the stack has mounted.
 */
export async function measureStepTravelPx(page: Page, gap: number): Promise<number> {
  const cardExtent = await page.evaluate(
    (sel) => (document.querySelector(sel) as HTMLElement | null)?.offsetWidth ?? 0,
    FRONT_CARD,
  )
  if (!(cardExtent > 0)) {
    throw new Error(`measureStepTravelPx: front card (${FRONT_CARD}) has no layout width`)
  }
  return stepTravelPx({ cardExtent, gap })
}

/**
 * A named example target, for specs that only need a name and a URL (no
 * geometry).
 *
 * `advance` is a CSS selector for the element that moves the target's stack
 * to its next card, for the targets whose own product surface has no "Next"
 * button at all (react-recipes' programmatic-control page: its whole point
 * is that a stack can be driven entirely from a sibling component, so it
 * deliberately has no next/prev pair of its own; see
 * ExternalControlStack.tsx's own top comment). Every other target leaves
 * this unset and is advanced through the ordinary Next button, by role and
 * accessible name.
 */
export interface ExampleTarget {
  name: string
  url: string
  advance?: string
}

/**
 * Moves `target`'s stack forward by one card: clicks `target.advance` when
 * the target sets one, otherwise the ordinary Next button (by role and
 * accessible name, matching every example's and every docs demo's own
 * "Next ..." label). a11y.spec.ts's `next()` and overflow.spec.ts's examples
 * loop both call this rather than hardcoding a Next-button click, so a
 * target with no Next button of its own does not have to grow one just to
 * satisfy these two specs.
 */
export async function advanceTarget(page: Page, target: ExampleTarget): Promise<void> {
  if (target.advance) {
    await page.locator(target.advance).first().click()
    return
  }
  await page.getByRole('button', { name: /^next/i }).first().click()
}

/**
 * The full example list. Ports match playwright.config.ts's webServer
 * entries; see its ports comment for how each was chosen and checked for
 * collisions. Shared by a11y.spec.ts and overflow.spec.ts rather than each
 * keeping its own copy, so the two lists can never drift apart.
 */
export const ALL_EXAMPLE_TARGETS: readonly ExampleTarget[] = [
  { name: 'react-movie-stack', url: 'http://localhost:4301/' },
  { name: 'vue-movie-stack', url: 'http://localhost:4302/' },
  { name: 'vanilla-basic', url: 'http://localhost:4303/' },
  { name: 'vue-clamp-controls', url: 'http://localhost:4304/' },
  { name: 'vertical-stack', url: 'http://localhost:4305/' },
  { name: 'custom-layout', url: 'http://localhost:4306/' },
  { name: 'react-infinite-feed', url: 'http://localhost:4307/' },
  { name: 'vanilla-movie-stack', url: 'http://localhost:4308/' },
  { name: 'vanilla-recipes (vertical)', url: 'http://localhost:4309/vertical.html' },
  { name: 'vanilla-recipes (clamp)', url: 'http://localhost:4309/clamp.html' },
  { name: 'vanilla-recipes (infinite-feed)', url: 'http://localhost:4309/infinite-feed.html' },
  {
    name: 'vanilla-recipes (programmatic-control)',
    url: 'http://localhost:4309/programmatic-control.html',
    // No Next button by design: the rail's second thumbnail advances the stack.
    advance: '[data-rail-index="1"]',
  },
  { name: 'vanilla-recipes (forms-in-cards)', url: 'http://localhost:4309/forms-in-cards.html' },
  { name: 'nextjs-app-router (/)', url: 'http://localhost:4310/' },
  { name: 'nextjs-app-router (/static)', url: 'http://localhost:4310/static' },
  { name: 'nuxt-example', url: 'http://localhost:4320/' },
  // react-recipes: one Vite app, four hash routes, one target per recipe
  // page (see playwright.config.ts's port 4350 webServer entry). Hash
  // routing means every one of these is the same served index.html; the
  // route is picked up client-side from `location.hash` on mount, so
  // navigating straight to a hash URL (as every spec here does) works with
  // no server-side rewrite.
  { name: 'react-recipes (clamp)', url: 'http://localhost:4350/#/clamp' },
  {
    name: 'react-recipes (programmatic-control)',
    url: 'http://localhost:4350/#/programmatic-control',
    // No Next button on this page, on purpose (see ExternalControlStack.tsx's
    // own top comment): its thumbnail rail's second button both advances the
    // stack and exercises the recipe's own point, that a sibling component
    // can drive it.
    advance: '[data-rail-index="1"]',
  },
  { name: 'react-recipes (forms-in-cards)', url: 'http://localhost:4350/#/forms-in-cards' },
  { name: 'react-recipes (custom-layout)', url: 'http://localhost:4350/#/custom-layout' },
  // vue-recipes: one Vite app, five hash routes, one target per recipe page
  // (see playwright.config.ts's port 4360 webServer entry), the same shape
  // as react-recipes above.
  { name: 'vue-recipes (vertical)', url: 'http://localhost:4360/#/vertical' },
  { name: 'vue-recipes (infinite-feed)', url: 'http://localhost:4360/#/infinite-feed' },
  {
    name: 'vue-recipes (programmatic-control)',
    url: 'http://localhost:4360/#/programmatic-control',
    // No Next button on this page, on purpose (see ExternalControlStack.vue's
    // own top comment): its thumbnail rail's second button both advances the
    // stack and exercises the recipe's own point, that a sibling component
    // can drive it.
    advance: '[data-rail-index="1"]',
  },
  { name: 'vue-recipes (forms-in-cards)', url: 'http://localhost:4360/#/forms-in-cards' },
  { name: 'vue-recipes (custom-layout)', url: 'http://localhost:4360/#/custom-layout' },
]
