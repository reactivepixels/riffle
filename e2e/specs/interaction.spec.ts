/**
 * The E2E interaction suite.
 * Real input against the built examples, on real engines. Most of the suite
 * (the core drag behaviors, plus hold-then-release) runs on every project,
 * including mobile-chromium with real CDP touch dispatch
 * (`Input.dispatchTouchEvent`, see utils/gestures.ts's PointerDriver): a
 * carousel's primary input is touch, so these are not desktop-only. The
 * keyboard test has no touch equivalent and stays desktop-only. The
 * vertical-scroll-over-horizontal-stack test is inherently mobile-only (a
 * vertical touch swipe over a horizontal stack) and runs only on
 * mobile-chromium.
 *
 * Most of the suite used to skip mobile-chromium
 * entirely: a real touch release there never reached a committed or
 * sprung-back outcome, which looked at the time like a CDP/Playwright
 * limitation (a spurious `lostpointercapture` on the second CDP-dispatched
 * touch event after the drag container took capture). It was not: a
 * genuine Riffle defect, fixed in
 * packages/core/src/gesture/pointer.ts (commit 916f939). A touch is
 * implicitly captured to the card it lands on (Pointer Events 3, 9.4); when
 * the drag container takes capture after slop, the browser correctly fires
 * `lostpointercapture` at the card, which bubbles to the container, whose
 * listener read it as the gesture being cancelled without checking
 * `event.target`. Every touch drag on a real phone was cancelled before it
 * could commit or spring back. With that fixed, the whole suite runs on
 * mobile-chromium like every other input-driven spec here.
 *
 * "Settled" is read from the product: the front card's own
 * getBoundingClientRect(), polled via requestAnimationFrame inside the page
 * (see utils/settle.ts), never a fixed sleep. The remaining fixed waits are
 * explicitly time-based cases (the 200ms hold, the 8ms fast-drag gap), each
 * commented at its call site.
 */
import { expect, test } from '@playwright/test'
import { routeCdnToLocalBuild } from '../utils/cdn-route'
import {
  COMMIT_THRESHOLD,
  FLING_VELOCITY_PX_MS,
  MOBILE_PROJECT,
  VELOCITY_WINDOW_MS,
} from '../utils/engine-constants'
import { EXAMPLES, SELECTORS, measureStepTravelPx, type ExampleDescriptor } from '../utils/examples'
import {
  cdpTouchSwipe,
  createPointerDriver,
  fastFlickThenHold,
  fastFlick,
  release,
  slowDrag,
  slowFlickPath,
  smoothMove,
  startVelocityRecording,
  stopVelocityRecording,
  velocityFromSamples,
  waitForVelocitySamples,
} from '../utils/gestures'
import {
  boundingBoxCenter,
  frontCardTranslateX,
  maxRatePxPerMs,
  pageNow,
  readsSameAcrossTwoFrames,
  startSampling,
  stopSampling,
  waitAnimationFrames,
  waitForFrontCardSettledX,
  tryProgressBetween,
} from '../utils/settle'
import type { Page } from '@playwright/test'

function skipUnlessMobile(testInfo: { project: { name: string } }): void {
  test.skip(testInfo.project.name !== MOBILE_PROJECT, 'mobile-only: real touch dispatch via CDP')
}

function skipKeyboardOnMobile(testInfo: { project: { name: string } }): void {
  test.skip(
    testInfo.project.name === MOBILE_PROJECT,
    'keyboard navigation (Tab/ArrowRight) is a desktop input model: mobile-chromium has no ' +
      'physical keyboard to dispatch from, and there is no touch equivalent of Tab focus order',
  )
}

function skipDragAndDropOnMobile(testInfo: { project: { name: string } }): void {
  test.skip(
    testInfo.project.name === MOBILE_PROJECT,
    'HTML5 native drag-and-drop (what this spec suppresses) is a desktop mouse concern: a bare ' +
      'touch gesture on an <img>/<a> does not start native drag the way a desktop ' +
      'mousedown-and-move on a draggable element does',
  )
}

/** "3 / 7" -> { index: 2 (0-based), count: 7 }. Throws on anything else, so a broken readout fails loudly. */
function parseReadout(text: string): { index: number; count: number } {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(text.trim())
  if (!match) throw new Error(`parseReadout: "${text}" is not "N / M"`)
  return { index: Number(match[1]) - 1, count: Number(match[2]) }
}

function readoutTextFor(index: number, count: number): string {
  return `${index + 1} / ${count}`
}

async function gotoExample(page: Page, example: ExampleDescriptor): Promise<void> {
  if (example.name === 'vanilla') await routeCdnToLocalBuild(page)
  await page.goto(example.url)
  // Precondition: the stack mounted and the a11y module already ran
  // (aria-roledescription + one card at tabindex 0) before any gesture.
  await expect(page.locator(SELECTORS.frontCard)).toBeVisible()
  await expect(page.locator(SELECTORS.readout)).toBeVisible()
}

/**
 * Precondition for a drag the pointer is still holding: the front card has
 * moved more than `minPx` from `baselineX`. Polled, not read once. The
 * engine applies a pointermove to the DOM on its next animation frame, and
 * in the CI container WebKit was measured going 350ms+ without one (both
 * pointermoves already received engine-side, at the right coordinates, with
 * zero rAF callbacks between the last one and a single read taken 200ms
 * later), so a one-shot read can see the position from before the last
 * move. Waiting is safe here: the pointer is still down and not moving, so
 * no outcome is decided until the caller releases.
 */
async function expectHeldCardMovedPast(page: Page, baselineX: number, minPx: number) {
  await expect
    .poll(
      async () =>
        Math.abs(
          (await page.evaluate(
            (sel) => document.querySelector(sel)!.getBoundingClientRect().x,
            SELECTORS.frontCard,
          )) - baselineX,
        ),
      { timeout: 3000 },
    )
    .toBeGreaterThan(minPx)
}

// Shared by both halves of "fling commits, slow drag at the same distance
// does not" below. 22%, not the original 15%:
// strictly below COMMIT_THRESHOLD (25%, so a fast-half commit can only come
// from the fling path, never distance) with 3 percentage points of headroom,
// chosen for velocity margin. The fast half's tracked window is the delta
// between the fast half's two moves (packages/core/src/gesture/velocity.ts only
// samples on pointermove, and pointer.ts's slop-clearing move already counts
// as the first sample) over whatever real time those two moves' dispatch
// actually took. A bigger dx makes that delta bigger for the same real
// elapsed time, which is the only lever available here: real dispatch
// latency is not something a test can shorten, only outrun with a larger
// numerator. 20% left one genuine (not a missing-sample retry case; see
// below) failure in 300 repeats on firefox, "Received: 0.475" against a
// 0.5 bar, real dispatch that was measurably, if only just, slow that one
// time: 22% gives roughly 10% more margin on exactly that number. The slow
// half stays safe regardless of this: its rate is dx / 500ms (20 steps at
// 25ms each), so even the largest dx any example here produces stays an
// order of magnitude under FLING_VELOCITY_PX_MS.
//
// That numerator alone is not enough at phone width. With the movie-stack
// examples' 150px card (stepTravel 170px), 22% is 37.4px, and the two moves
// land 32-69ms apart engine-side in the CI container, which measured as low
// as 0.438px/ms. No forward-only drag can fix that: ending below the 25%
// threshold caps the displacement at 42.5 - SLOP_PX = 36.5px, which is
// 0.53px/ms at 69ms. So the fast half is a flick (utils/gestures.ts's
// fastFlick): a back-swing of the same fraction first, then forward to +dx.
// The tracker then sees 2 * 37.4 = 74.8px between its two samples, which is
// 1.08px/ms at 69ms and 0.75px/ms (50% headroom over the 0.5 bar) up to
// ~100ms apart, while the release offset the threshold reads is still dx.
// The slow half walks the identical path slowly (slowFlickPath), so speed is
// the only difference between the two halves.
const FLING_DX_FRACTION = 0.22
const FLING_BACKSWING_FRACTION = FLING_DX_FRACTION

for (const example of EXAMPLES) {
  test.describe(example.name, () => {
    // One step of travel at this project's viewport, measured from the
    // mounted front card (see measureStepTravelPx): every drag distance below
    // is a fraction of it, so a spec meant to stay under the commit threshold
    // really does on a phone-width project, where the movie-stack examples'
    // cards are 150px wide rather than 220px.
    let travelPx = 0

    test.beforeEach(async ({ page }) => {
      await gotoExample(page, example)
      travelPx = await measureStepTravelPx(page, example.gap)
    })

    test('drag past threshold commits', async ({ page }, testInfo) => {
      const driver = createPointerDriver(page, testInfo)
      const readout = page.locator(SELECTORS.readout)
      const before = parseReadout(await readout.textContent().then((t) => t ?? ''))
      // Precondition: threshold (0.25) is strictly below the 60% we are about to drag,
      // so this spec is actually exercising the distance-commit path.
      expect(COMMIT_THRESHOLD).toBeLessThan(0.6)

      const card = page.locator(SELECTORS.frontCard)
      const center = await boundingBoxCenter(card)
      const baselineX = await page.evaluate(
        (sel) => document.querySelector(sel)!.getBoundingClientRect().x,
        SELECTORS.frontCard,
      )
      const dx = travelPx * 0.6
      await slowDrag(driver, center, dx)
      // Precondition: the drag actually moved the card (1:1 tracking during
      // an active drag), the same check "short drag springs back" makes
      // below. An element merely existing (the previous `not.toBeUndefined()`
      // here) proves nothing about whether the gesture actually engaged.
      await expectHeldCardMovedPast(page, baselineX, dx * 0.5)
      await release(driver)

      const expectedIndex = (before.index + 1) % before.count
      await expect(readout).toHaveText(readoutTextFor(expectedIndex, before.count), {
        timeout: 3000,
      })
      // "after the spring settles": wait for the new front card to stop moving.
      await waitForFrontCardSettledX(page, SELECTORS.frontCard)
    })

    test('short drag springs back', async ({ page }, testInfo) => {
      const driver = createPointerDriver(page, testInfo)
      const readout = page.locator(SELECTORS.readout)
      const before = await readout.textContent().then((t) => (t ?? '').trim())
      expect(before).toMatch(/^\d+\s*\/\s*\d+$/)

      const card = page.locator(SELECTORS.frontCard)
      const center = await boundingBoxCenter(card)
      const baselineX = await page.evaluate(
        (sel) => document.querySelector(sel)!.getBoundingClientRect().x,
        SELECTORS.frontCard,
      )
      const dx = travelPx * 0.1
      await slowDrag(driver, center, dx)
      // Precondition: the drag actually moved the card (1:1 tracking during
      // an active drag), so a spring-back this spec later confirms is a
      // real return, not a card that never left.
      await expectHeldCardMovedPast(page, baselineX, dx * 0.5)
      await release(driver)

      const finalX = await waitForFrontCardSettledX(page, SELECTORS.frontCard)
      expect(Math.abs(finalX - baselineX)).toBeLessThan(0.5)
      await expect(readout).toHaveText(before)
    })

    test('fling commits, slow drag at the same distance does not', async ({ page }, testInfo) => {
      const driver = createPointerDriver(page, testInfo)
      const readout = page.locator(SELECTORS.readout)
      const before = parseReadout(await readout.textContent().then((t) => t ?? ''))
      // Precondition: FLING_DX_FRACTION is strictly below the 25% distance
      // threshold, so a commit here can only come from the fling path, never
      // from distance (see FLING_DX_FRACTION's own comment for why 22%).
      expect(FLING_DX_FRACTION).toBeLessThan(COMMIT_THRESHOLD)

      const dx = travelPx * FLING_DX_FRACTION
      const backDx = travelPx * FLING_BACKSWING_FRACTION
      // Precondition: the release offset really is under the distance
      // threshold, so only the velocity path can commit the fast half.
      expect(dx).toBeLessThan(COMMIT_THRESHOLD * travelPx)

      // Records real pointermove/pointerup
      // timestamps through the whole gesture instead of reading the card's
      // position mid-drag. Reading position, however carefully (a bare read,
      // a settle wait, or a bounded poll were all tried), inherently raced
      // real event-dispatch latency: a bare read raced a slow dispatch on
      // WebKit, and anything that waited long enough to avoid that pushed
      // real elapsed time toward the velocity tracker's 100ms window
      // (packages/core/src/gesture/velocity.ts) and intermittently decayed a
      // genuine fling into a spring-back instead, on WebKit, mobile-chromium,
      // and, at a roughly 1-in-15 baseline rate present even before this
      // retry mechanism existed, firefox. See startVelocityRecording's own
      // comment in utils/gestures.ts for the full mechanism: the recording is
      // only read after release, from a record of what genuinely happened,
      // never from a value caught mid-flight. waitForVelocitySamples between
      // fastFlick and release costs the velocity calculation nothing (see its
      // own comment): it waits for the *count* of recorded events, not for
      // real time to pass.
      //
      // Retried up to 3 times, but only when velocityPxMs comes back exactly
      // 0 (the one value stopVelocityRecording returns when fewer than two
      // pointermove samples were recorded at all) AND the readout shows no
      // commit happened. That specific "0, nothing committed" case persisted
      // under sustained repeated load (--repeat-each 50) on firefox
      // regardless of how long waitForVelocitySamples was given (a much
      // longer bound made no measurable difference), while an isolated
      // script driving the identical three page.mouse calls hundreds of
      // times, including under deliberate parallel contention, never
      // reproduced it even once: a real product defect would be expected to
      // reproduce standalone, so this reads as a transient dispatch miss in
      // the browser automation channel under the test runner's own
      // concurrency, not a real signal. This is not Playwright's own
      // per-test retry (disabled project-wide by design, `retries: 0`):
      // Playwright's retry re-runs the whole test, silently, with no signal
      // of how many attempts it took; this retries only the specific,
      // narrowly-diagnosed rig-side symptom, still fails loudly if it never
      // clears, and a genuinely low but nonzero measured velocity is never
      // retried: that is the real, correctly attributed precondition
      // failure this whole mechanism exists to surface.
      //
      // Checking the readout before deciding to retry is load-bearing, not
      // a nicety: our own recording missing the events does not mean the
      // engine's own, separate listener also missed them, and it is the
      // engine's listener that actually decides whether to commit. Break-it
      // proof: the first version of this retry ignored
      // the readout and retried on velocityPxMs === 0 alone; under the same
      // 50-repeat firefox run, it fired a second, unwanted drag on top of
      // one the engine had already committed, and the outcome assertion
      // below failed with "Expected: 2 / 8, Received: 3 / 8", a double
      // commit, not a missing one.
      //
      // The retry also covers the rig delivering the flick too slowly to be
      // a fling at all, measured from the page-side record, never from the
      // outcome. In the pinned CI container under load, consecutive
      // dispatched mouse moves were recorded 100-200ms apart (for example
      // moves at 0, 174 and 295ms, pointerup at 338ms), longer than the
      // engine's whole 100ms velocity window, so the delivered gesture was
      // genuinely slow and the engine correctly read 0. Real input arrives
      // every 8-16ms; a gesture the rig failed to deliver fast says nothing
      // about the engine. So an attempt is retried (up to 5) only when the
      // recorded velocity is at or under the fling bar AND the settled
      // readout shows no commit. The readout is read only after the card
      // settles, so an attempt the engine did commit is never repeated. The
      // break-it still bites: with flingVelocity forced to 999, the recorded
      // velocity clears 0.5 and no retry happens, and the outcome assertion
      // fails on the readout.
      let velocityPxMs = 0
      let alreadyCommitted = false
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const from = await boundingBoxCenter(page.locator(SELECTORS.frontCard))
        await startVelocityRecording(page)
        await fastFlick(driver, from, backDx, dx)
        await waitForVelocitySamples(page, 2)
        await release(driver)
        const { samples, upAt } = await stopVelocityRecording(page)
        velocityPxMs = velocityFromSamples(samples, upAt)
        await waitForFrontCardSettledX(page, SELECTORS.frontCard)
        const current = parseReadout(await readout.textContent().then((t) => t ?? ''))
        alreadyCommitted = current.index !== before.index
        if (alreadyCommitted || Math.abs(velocityPxMs) > FLING_VELOCITY_PX_MS) break
      }
      // Precondition: the real, recorded pointer events show the engine's
      // own tracker would have computed a velocity above the fling bar, so
      // this is genuinely exercising the fling path, not distance (dx is
      // under COMMIT_THRESHOLD). Independent of, and a clearer failure than,
      // the outcome assertion below: if real dispatch was ever too slow to
      // produce a fling, this fails here with the actual measured velocity
      // in the message, rather than as a same-looking "readout did not
      // advance" a few lines down that gives no hint why. Skipped only when
      // the readout above already proves the engine committed despite our
      // own recording missing it (see the retry's own comment).
      if (!alreadyCommitted) {
        expect(Math.abs(velocityPxMs)).toBeGreaterThan(FLING_VELOCITY_PX_MS)
      }
      const expectedIndex = (before.index + 1) % before.count
      await expect(readout).toHaveText(readoutTextFor(expectedIndex, before.count), {
        timeout: 3000,
      })
      await waitForFrontCardSettledX(page, SELECTORS.frontCard)

      // Reload for a clean baseline before the slow half of this spec. The
      // driver is reused: it holds no state a navigation would invalidate
      // (the mouse driver is stateless, and the touch driver opens a fresh
      // CDP session on every down()).
      await gotoExample(page, example)
      const readout2 = page.locator(SELECTORS.readout)
      const before2 = await readout2.textContent().then((t) => (t ?? '').trim())
      const card2 = page.locator(SELECTORS.frontCard)
      const center2 = await boundingBoxCenter(card2)
      const baselineX2 = await page.evaluate(
        (sel) => document.querySelector(sel)!.getBoundingClientRect().x,
        SELECTORS.frontCard,
      )
      await slowFlickPath(driver, center2, backDx, dx)
      await expectHeldCardMovedPast(page, baselineX2, dx * 0.5)
      await release(driver)
      const finalX2 = await waitForFrontCardSettledX(page, SELECTORS.frontCard)
      expect(Math.abs(finalX2 - baselineX2)).toBeLessThan(0.5)
      await expect(readout2).toHaveText(before2)
    })

    test('hold-then-release springs back, not fling', async ({ page }, testInfo) => {
      const driver = createPointerDriver(page, testInfo)
      const readout = page.locator(SELECTORS.readout)
      const before = await readout.textContent().then((t) => (t ?? '').trim())

      const card = page.locator(SELECTORS.frontCard)
      const center = await boundingBoxCenter(card)
      const baselineX = await page.evaluate(
        (sel) => document.querySelector(sel)!.getBoundingClientRect().x,
        SELECTORS.frontCard,
      )
      // 15%: below the 25% distance threshold, so a commit after the hold
      // can only mean the velocity tracker did not actually age out.
      const dx = travelPx * 0.15
      await startVelocityRecording(page)
      await fastFlickThenHold(driver, center, dx, dx)
      // Precondition: the fast phase (before the hold) really did move the
      // card a meaningful distance quickly, i.e. this was genuinely a fast
      // drag and not a no-op that trivially "springs back". Polled (see
      // expectHeldCardMovedPast): the pointer is still down and still, so
      // waiting for the frame that renders the last move only lengthens the
      // hold, which can only age the velocity further, never less.
      await expectHeldCardMovedPast(page, baselineX, dx * 0.5)

      await release(driver)
      // Precondition, from the pointer events the page itself received rather
      // than from wall time on the test side: both of the flick's moves
      // arrived, and the engine really saw a hold longer than its velocity
      // window between the last move and the release, so its tracker reads
      // zero at pointerup. This is what this test is about, checked on the
      // engine's own clock instead of assumed from the 200ms wait.
      const { samples, upAt } = await stopVelocityRecording(page)
      expect(samples.length).toBeGreaterThanOrEqual(2)
      expect(upAt).not.toBeNull()
      expect(upAt! - samples[samples.length - 1]!.t).toBeGreaterThan(VELOCITY_WINDOW_MS)
      expect(velocityFromSamples(samples, upAt)).toBe(0)
      const finalX = await waitForFrontCardSettledX(page, SELECTORS.frontCard)
      expect(Math.abs(finalX - baselineX)).toBeLessThan(0.5)
      await expect(readout).toHaveText(before)
    })

    test('keyboard: Tab focuses the stack, ArrowRight advances and moves focus', async ({
      page,
    }, testInfo) => {
      skipKeyboardOnMobile(testInfo)
      const readout = page.locator(SELECTORS.readout)
      const before = parseReadout(await readout.textContent().then((t) => t ?? ''))

      let focused = false
      for (let i = 0; i < 5; i += 1) {
        await page.keyboard.press('Tab')
        focused = await page.evaluate(
          (sel) => document.activeElement === document.querySelector(sel),
          SELECTORS.frontCard,
        )
        if (focused) break
      }
      // Precondition: Tab actually reached the front card before we act on it.
      expect(focused).toBe(true)

      await page.keyboard.press('ArrowRight')
      const expectedIndex = (before.index + 1) % before.count
      await expect(readout).toHaveText(readoutTextFor(expectedIndex, before.count))
      const activeIsNewFront = await page.evaluate(
        (sel) => document.activeElement === document.querySelector(sel),
        SELECTORS.frontCard,
      )
      expect(activeIsNewFront).toBe(true)
    })

    test('grabbing mid-animation does not jump (teleport guard)', async ({ page }, testInfo) => {
      const driver = createPointerDriver(page, testInfo)
      const nextButton = page.locator(SELECTORS.nextButton)
      await expect(nextButton).toBeEnabled()

      // Grab once the incoming card has covered a meaningfully
      // mid-flight, consistent fraction of its transition (30%-70%), rather
      // than a fixed 50ms wait. How far a fixed wait lands varies by engine
      // and load: an earlier version of this test used a fixed 50ms grab and its
      // break-it proof (dragHome snapped to target) only failed in 1 of 9
      // example/engine combinations, because 50ms sometimes landed too close
      // to settled for the resulting jump to clear a fixed 20px bound.
      // Fraction is measured against the incoming card's own resting start
      // (its first sample) and known resting end (translateX 0); see
      // utils/settle.ts's tryProgressBetween.
      //
      // Up to 5 transitions: an attempt whose sampled frames step straight
      // over the band (tryProgressBetween returns null) never offered a
      // mid-flight moment to grab, so it says nothing about the engine; the
      // card is left to settle and Next is clicked again. The band itself is
      // still asserted below on the attempt that is used.
      let progress: { fraction: number; x0: number } | null = null
      for (let attempt = 1; attempt <= 5 && !progress; attempt += 1) {
        await startSampling(page, SELECTORS.frontCard)
        await nextButton.click()
        progress = await tryProgressBetween(page, 0.3, 0.7)
        if (!progress) {
          await stopSampling(page)
          await waitForFrontCardSettledX(page, SELECTORS.frontCard)
        }
      }
      if (!progress)
        throw new Error('teleport guard: no transition was sampled mid-flight in 5 tries')
      const { fraction, x0 } = progress
      // Precondition: progress is genuinely mid-flight and the fraction is
      // measuring real motion, not a degenerate 0-length transition.
      expect(fraction).toBeGreaterThanOrEqual(0.3)
      expect(fraction).toBeLessThanOrEqual(0.7)
      expect(x0).not.toBe(0)

      // Baseline motion rate (px/ms) from the frames actually leading up to
      // the grab: a critically-damped spring's velocity is highest right
      // after it starts moving and falls off approaching the grab, so only
      // the most recent samples (and none of the leading samples still
      // showing the outgoing card at translateX 0, a card-identity artefact
      // rather than real motion) represent the rate "just before the grab"
      // actually looked like. Sampling stops here: the measurement that
      // matters is the direct before/after read below, not the continuous
      // trace.
      const preGrabSamples = await stopSampling(page)
      const preGrabTrace = preGrabSamples.filter((s) => s.x !== 0).slice(-6)
      expect(preGrabTrace.length).toBeGreaterThan(1)
      const baselineRate = maxRatePxPerMs(preGrabTrace)

      const card = page.locator(SELECTORS.frontCard)
      const center = await boundingBoxCenter(card)
      const beforeX = await frontCardTranslateX(page, SELECTORS.frontCard)
      const beforeT = await pageNow(page)
      await driver.down(center.x, center.y)
      // Clear slop so the engine actually locks the gesture and onStart runs.
      await driver.move(center.x + 10, center.y)
      // A short, deterministic wait, not a correctness sleep.
      // The engine's own write from onStart is itself scheduled via
      // requestAnimationFrame (packages/core/src/animation/loop.ts's
      // kick()), so animation frames chained the same way are guaranteed
      // to run no earlier than that write (there is real, measured
      // dispatch latency between driver.move() resolving and the engine
      // actually processing the resulting pointermove, confirmed directly:
      // a naive read taken immediately after driver.move() sometimes
      // still showed the pre-grab trajectory; under real CI/CPU
      // contention that latency grows, hence 3 frames rather than the
      // bare minimum of 1), without waiting so long that ordinary
      // continued motion piles up and swamps the comparison the way a
      // longer, arbitrary real-time wait did in an earlier
      // version of this test.
      await waitAnimationFrames(page, 3)
      const afterX = await frontCardTranslateX(page, SELECTORS.frontCard)
      const afterT = await pageNow(page)
      await driver.up()

      // The bound is derived from the motion actually observed
      // in the frames leading up to the grab (as a rate, px/ms, applied to
      // the real elapsed time between the two reads above), not a fixed
      // pixel count. A teleport is a discontinuity that dwarfs normal
      // motion at whatever rate it was happening, wherever in the sampled
      // window it falls; a fixed bound close to the engine's own maximum
      // possible excursion (the fan layout's default 32px background
      // offset, for these three examples) leaves little margin to actually
      // catch a regression.
      const elapsedMs = afterT - beforeT
      // Precondition: real time actually passed between the two reads.
      expect(elapsedMs).toBeGreaterThan(0)
      // 4px of slack on top of the rate-implied allowance, for measurement
      // noise (subpixel rounding, a frame landing a few ms off its "true"
      // tick under CI/CPU contention).
      const allowed = baselineRate * elapsedMs + 4
      const jump = Math.abs(afterX - beforeX)
      expect(jump).toBeLessThan(allowed)
    })

    test.describe('reduced motion', () => {
      test.use({ reducedMotion: 'reduce' })

      test('next() lands immediately, and a drag still tracks the finger', async ({
        page,
      }, testInfo) => {
        const driver = createPointerDriver(page, testInfo)
        await gotoExample(page, example)
        const nextButton = page.locator(SELECTORS.nextButton)
        await nextButton.click()
        // No spring: two consecutive animation frames right after the
        // trigger already agree (an animated transition would still be moving).
        expect(await readsSameAcrossTwoFrames(page, SELECTORS.frontCard)).toBe(true)

        const card = page.locator(SELECTORS.frontCard)
        const center = await boundingBoxCenter(card)
        // translateX, not the bounding rect: a drag also tilts the front
        // card (the rotation overlay), and a rotated box's
        // getBoundingClientRect().x drifts from its pure translation by a
        // few px, which would make this 1:1 check noisy for the wrong
        // reason. See frontCardTranslateX's own comment.
        const baselineX = await frontCardTranslateX(page, SELECTORS.frontCard)
        const dx = travelPx * 0.3
        const target = { x: center.x + dx, y: center.y }
        // Paced, multi-step move (utils/gestures.ts's smoothMove): a single
        // big jump did not reliably register as a drag at all on WebKit.
        await driver.down(center.x, center.y)
        await smoothMove(driver, center, target, 5)
        // Precondition/assertion in one: the drag tracked the finger 1:1,
        // within a small margin for subpixel rounding
        // and, on WebKit, one extra frame of paint latency after the last
        // synthetic move.
        await expect
          .poll(async () => {
            const draggedX = await frontCardTranslateX(page, SELECTORS.frontCard)
            return Math.abs(draggedX - baselineX - dx)
          })
          .toBeLessThan(2)
        await driver.up()
      })
    })

    test('vertical scroll still works over the horizontal stack', async ({ page }, testInfo) => {
      skipUnlessMobile(testInfo)
      // Test-only: extra page height so there is somewhere to scroll to,
      // measured via a test-only route or addStyleTag, not by editing the example.
      // On `html`, not `body`: vanilla-basic's body is `display: grid;
      // place-items: center`, so inflating body's own min-height instead
      // would re-centre the card vertically inside that taller box and push
      // it below the viewport, off the coordinates this spec swipes at.
      await page.addStyleTag({ content: 'html { min-height: 3000px; }' })
      // Nudges Chromium to recompute its emulated device metrics against
      // the taller document. Without this, CDP touch dispatch on this
      // Playwright/Chromium build never converts into a scroll here (root
      // cause isolated empirically: identical minus this line, scrollY
      // stayed 0 indefinitely; confirmed unrelated to the engine, since a
      // page with no riffle script at all shows the same staleness).
      const viewport = page.viewportSize()
      if (viewport) await page.setViewportSize(viewport)

      const scrollableBefore = await page.evaluate(() => ({
        scrollable: document.documentElement.scrollHeight > window.innerHeight,
        y: window.scrollY,
      }))
      // Precondition: the page is actually scrollable and starts at the top.
      expect(scrollableBefore.scrollable).toBe(true)
      expect(scrollableBefore.y).toBe(0)

      const readout = page.locator(SELECTORS.readout)
      const before = await readout.textContent().then((t) => (t ?? '').trim())

      const card = page.locator(SELECTORS.frontCard)
      const center = await boundingBoxCenter(card)

      // What actually guards this spec is the browser: `touch-action: pan-y`
      // (packages/core/src/gesture/pointer.ts) tells the compositor a
      // vertical gesture over the stack is native scroll before any JS
      // runs. The engine's own axis-abandon branch in the same file
      // (`Math.abs(main) <= Math.abs(cross)`, which releases a gesture that
      // turns out to be dominantly cross-axis) is defence in depth for the
      // case touch-action does not cover it (e.g. `touch-action: none`
      // upstream, or a mouse drag with no native gesture to defer to): it
      // is not exercised by this spec, confirmed directly by breaking each
      // one independently: removing touch-action broke this spec, removing
      // the JS branch did not.
      await expect
        .poll(
          async () => {
            await cdpTouchSwipe(page, center, { x: center.x, y: center.y - 300 })
            return page.evaluate(() => window.scrollY)
          },
          { timeout: 8000 },
        )
        .toBeGreaterThan(50)
      // The horizontal stack must not have moved: a vertical gesture is the
      // page's, not the carousel's.
      await expect(readout).toHaveText(before)
    })
  })
}

test.describe('image and link cards (fixture)', () => {
  const FIXTURE_URL = 'http://localhost:4303/fixtures/image-link-card.html'

  test('a card with an <img> and an <a> drags normally: no native drag, no text selection', async ({
    page,
  }, testInfo) => {
    skipDragAndDropOnMobile(testInfo)
    await page.goto(FIXTURE_URL)
    const readout = page.locator(SELECTORS.readout)
    await expect(readout).toBeVisible()

    const card = page.locator(SELECTORS.frontCard)
    const img = card.locator('img')
    const link = card.locator('a')
    // Precondition: the fixture actually has the media this spec exercises.
    await expect(img).toHaveCount(1)
    await expect(link).toHaveCount(1)

    // A dragstart event still fires and bubbles per the DOM spec (an <img>
    // and an <a> are draggable by default); what packages/core/src/gesture/pointer.ts
    // guards against is the native drag actually starting, by calling
    // preventDefault() on it there. A bubble-phase listener on
    // document runs after the container's own listener, so by the time it
    // sees the event, defaultPrevented reflects whether that guard fired.
    await page.evaluate(() => {
      const w = window as unknown as { __dragstartDefaultPrevented: boolean | null }
      w.__dragstartDefaultPrevented = null
      document.addEventListener(
        'dragstart',
        (e) => (w.__dragstartDefaultPrevented = e.defaultPrevented),
      )
    })
    const selectionBefore = await page.evaluate(() => window.getSelection()?.toString() ?? '')
    expect(selectionBefore).toBe('')

    const before = await readout.textContent().then((t) => (t ?? '').trim())
    // Grab starting on the <img> itself: the exact element native drag and
    // drop would otherwise claim.
    const imgBox = await img.boundingBox()
    if (!imgBox) throw new Error('image has no box')
    const startX = imgBox.x + imgBox.width / 2
    const startY = imgBox.y + imgBox.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 200, startY, { steps: 8 })
    await page.mouse.up()

    await expect(readout).not.toHaveText(before)
    const dragstartOutcome = await page.evaluate(
      () =>
        (window as unknown as { __dragstartDefaultPrevented: boolean | null })
          .__dragstartDefaultPrevented,
    )
    // Either no dragstart fired at all, or it fired and was prevented.
    // What must never happen is a dragstart whose default action survived.
    expect(dragstartOutcome === null || dragstartOutcome === true).toBe(true)
    const selectionAfter = await page.evaluate(() => window.getSelection()?.toString() ?? '')
    expect(selectionAfter).toBe('')
  })
})
