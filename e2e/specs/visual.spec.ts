/**
 * Pixel baselines of the settled stack. Chromium only:
 * cross-engine font rendering makes pixel baselines across engines noise,
 * and interaction.spec.ts already covers the engines behaviourally. See
 * playwright.config.ts's `testIgnore` on the other projects.
 *
 * Settled poses come from the product's own reduced-motion option, applied
 * the same way interaction.spec.ts's "reduced motion" describe block does
 * (`test.use({ reducedMotion: 'reduce' })`, which drives the exact
 * `window.matchMedia('(prefers-reduced-motion: reduce)')` read
 * packages/core/src/riffle.ts's `prefersReducedMotion()` makes; both
 * examples here use the engine's default `reducedMotion: 'auto'`, i.e. the
 * system preference, so a real reduced-motion preference is emulated
 * when an example otherwise relies on the system default). Never the engine
 * stubbed: this is the same real spring-vs-no-spring switch a real user's OS
 * setting flips, just forced on for a deterministic screenshot instead of
 * left to whatever the CI runner's own OS preference happens to be. As a
 * side effect it also freezes each example's own CSS `:hover`/`:active`
 * transitions on the prev/next buttons, which are themselves gated behind
 * the identical `@media (prefers-reduced-motion: no-preference)` query.
 *
 * Screenshots are taken of each example's `.stage` element, not the whole
 * page: `.stage`'s padding is sized (in each example's own CSS) to contain
 * the fanned stack's full background-card offset without clipping, so this
 * is the smallest region that still shows every card the break-it proof
 * (changing the fan layout's default offset by 4px) needs to
 * move. `.stage` is product markup (each example's own src/app.css `.stage`
 * rule), not a test-only wrapper.
 */
import { expect, test } from '@playwright/test'
import { SELECTORS } from '../utils/examples'
import { readsSameAcrossTwoFrames, waitForFrontCardSettledX } from '../utils/settle'
import type { Page } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

// Only `-chromium-linux.png` baselines are committed,
// matching CI's ubuntu-latest runner; Playwright's
// snapshot filenames are platform-suffixed, so this suite has no baseline
// to compare against on any other platform. Without this, running the full
// suite on macOS used to write a fresh, unreviewed `-chromium-darwin.png`
// next to the committed Linux ones and still fail the run that wrote it
// (Playwright's default `updateSnapshots: 'missing'` behaviour), leaving
// untracked snapshot files behind either way. Skip here instead, with the
// exact command to regenerate and review baselines on a platform that has
// them.
const DOCKER_UPDATE_SNAPSHOTS =
  'docker run --platform linux/amd64 --rm -v "$(pwd)":/work -w /work ' +
  "mcr.microsoft.com/playwright:v1.63.0-noble bash -lc '" +
  'corepack enable && corepack prepare pnpm@10.11.1 --activate && ' +
  'pnpm install --frozen-lockfile --filter "@rpxl/riffle-e2e..." --filter "react-movie-stack..." ' +
  '--filter "vue-clamp-controls..." --filter "vue-movie-stack..." && ' +
  'pnpm -r --filter "./packages/*" build && ' +
  "cd e2e && npx playwright test --project=chromium visual.spec.ts --update-snapshots'"

test.beforeEach(() => {
  test.skip(
    process.platform !== 'linux',
    `No committed visual baseline for this platform (only *-chromium-linux.png is tracked). ` +
      `Regenerate and review baselines with: ${DOCKER_UPDATE_SNAPSHOTS}`,
  )
})

const STAGE = '.stage'

async function waitFontsReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
}

/**
 * Settled means two things here, both asserted as preconditions before the
 * screenshot is trusted: the front card's own rect has stopped moving
 * (waitForFrontCardSettledX, the same settle detector interaction.spec.ts
 * uses), and, because reduced motion means no spring at all, two consecutive
 * frames already agree (readsSameAcrossTwoFrames: an animated transition
 * would still be moving). The second check is what actually distinguishes
 * "reduced motion is really engaged" from "the spring happened to finish
 * before this line ran"; without it, a regression that silently dropped
 * `reducedMotion: 'reduce'` handling could still produce a screenshot that
 * looks settled by coincidence of timing.
 */
async function waitSettled(page: Page): Promise<void> {
  await waitForFrontCardSettledX(page, SELECTORS.frontCard)
  const stable = await readsSameAcrossTwoFrames(page, SELECTORS.frontCard)
  expect(stable).toBe(true)
  await waitFontsReady(page)
}

test.describe('react-movie-stack', () => {
  const URL = 'http://localhost:4301/'

  test('at rest (index 0), settled', async ({ page }) => {
    await page.goto(URL)
    await expect(page.locator(SELECTORS.frontCard)).toBeVisible()
    await expect(page.locator(SELECTORS.readout)).toHaveText('1 / 8')
    await waitSettled(page)
    await expect(page.locator(STAGE)).toHaveScreenshot('react-movie-stack-rest.png', {
      maxDiffPixelRatio: 0.001,
    })
  })

  test('after one next(), settled', async ({ page }) => {
    await page.goto(URL)
    await expect(page.locator(SELECTORS.frontCard)).toBeVisible()
    const readout = page.locator(SELECTORS.readout)
    await expect(readout).toHaveText('1 / 8')
    await page.locator(SELECTORS.nextButton).click()
    await expect(readout).toHaveText('2 / 8')
    await waitSettled(page)
    await expect(page.locator(STAGE)).toHaveScreenshot('react-movie-stack-after-next.png', {
      maxDiffPixelRatio: 0.001,
    })
  })
})

test.describe('vue-clamp-controls', () => {
  const URL = 'http://localhost:4304/'

  test('at index 0 under bounds: clamp, settled', async ({ page }) => {
    await page.goto(URL)
    await expect(page.locator(SELECTORS.frontCard)).toBeVisible()
    // Precondition: this is genuinely the clamped-at-the-start pose the
    // screenshot claims to be, not merely "whatever loaded" - the prev
    // button is truly disabled (App.vue binds `:disabled="!canPrev"" to the
    // engine's own `state.canPrev`, not a CSS affordance), which only holds
    // at index 0 under `bounds: 'clamp'`.
    await expect(page.getByRole('button', { name: 'Previous waypoint' })).toBeDisabled()
    await expect(page.getByText('Card 1 of 5')).toBeVisible()
    await waitSettled(page)
    await expect(page.locator(STAGE)).toHaveScreenshot('vue-clamp-controls-index-0.png', {
      maxDiffPixelRatio: 0.001,
    })
  })
})
