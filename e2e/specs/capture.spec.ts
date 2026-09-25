/**
 * Generates the raw recording behind the hero asset for the README and the
 * social preview: a scripted pointer drives react-movie-stack through three
 * swipes, one a grab near a corner so the lever rotation shows, starting
 * and ending at rest on the same card so the recording loops without a
 * visible jump. Not part of `pnpm e2e`: run with `pnpm capture` (root
 * package.json), which builds react-movie-stack, runs this one spec against
 * `playwright.capture.config.ts`, then encodes the recorded WebM into
 * `media/hero.webm` and `media/hero.gif` (see `e2e/scripts/encode-hero.mjs`,
 * which picks up whatever this test logs and writes under
 * e2e/.capture-output/video/).
 *
 * The engine's rotation depends on the pointer's offset from the card's
 * cross-axis center at the moment it is grabbed (packages/core/src/riffle.ts's
 * `grabOffsetCross`, fed into packages/core/src/math/rotation.ts), not on
 * where the pointer moves afterward: swipe 1 grabs near the card's
 * top-right corner and then moves purely horizontally, so the captured
 * offset alone is what tilts the card as it drags, exactly like a real
 * off-center grab.
 *
 * Commit is decided at release, from either progress past
 * `COMMIT_THRESHOLD` or velocity past `FLING_VELOCITY_PX_MS` (see
 * e2e/utils/engine-constants.ts and interaction.spec.ts's own comment on
 * those same two paths), not from how far the pointer travelled mid-drag:
 * swipe 3's out-and-back motion, released slowly back near the down point,
 * settles on the same card without committing, which is what makes the
 * loop point invisible on repeat.
 *
 * Dragging right on this stack goes to the NEXT card (readout climbs from
 * "1 / 8" to "2 / 8"); dragging left goes to the previous card, wrapping to
 * the last one, confirmed directly the first time this spec ran (a
 * left-drag from card 1 landed on "8 / 8", not "2 / 8"). Swipes 1 and 2
 * below are signed for that observed direction, not guessed.
 *
 * Every drag step below is explicitly paced (a real `setTimeout` wait
 * between points, not a fixed sleep standing in for a missing assertion):
 * this is a capture for a 6-10 second hero video, not a correctness check,
 * and an unpaced mouse drag (`smoothMove`'s own default) dispatches all its
 * points with no delay at all, which reads as a single instant jump on
 * playback rather than a hand moving.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SELECTORS } from '../utils/examples'
import { createPointerDriver, release, type PointerDriver, type Point } from '../utils/gestures'
import { boundingBoxCenter, waitForFrontCardSettledX } from '../utils/settle'

const here = fileURLToPath(new URL('.', import.meta.url))
const videoDir = resolve(here, '../.capture-output/video')
mkdirSync(videoDir, { recursive: true })

// examples/react-movie-stack/src/App.tsx: POSTER_WIDTH_DESKTOP = 220 at this
// spec's desktop capture viewport, gap defaults to DEFAULTS.gap (20):
// stepTravel = cardExtent + gap = 240px (packages/core/src/layout/fan.ts).
const TRAVEL_PX = 240
// Comfortably past COMMIT_THRESHOLD (0.25 * 240 = 60px).
const COMMIT_DX = Math.round(TRAVEL_PX * 0.6)
// Comfortably short of it, for the out-and-back flourish's outward reach.
const TEASE_DX = Math.round(TRAVEL_PX * 0.45)

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A visibly paced move: `steps` points, each held for `stepDelayMs` before the next. */
async function pacedMove(
  driver: PointerDriver,
  from: Point,
  to: Point,
  steps: number,
  stepDelayMs: number,
): Promise<void> {
  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    await driver.move(x, y)
    await wait(stepDelayMs)
  }
}

test('records the hero loop', async ({ browser }, testInfo) => {
  test.setTimeout(30_000)

  // A warm-up navigation, in its own unrecorded context, before the
  // recorded one below: confirmed directly that without this, the
  // recording's own first ~1s is blank (the real page load, not yet
  // cached) rather than the settled first frame the loop point needs.
  // Warming the browser's own HTTP and module cache here means the
  // recorded page's navigation settles fast enough that it never shows up
  // as a blank frame in the output. A separate context, not a second page
  // in the recording context, so only one video file is ever written to
  // videoDir: encode-hero.mjs picks it up by being the newest file there,
  // and two candidates would make that ambiguous.
  const warmupContext = await browser.newContext()
  const warmupPage = await warmupContext.newPage()
  await warmupPage.goto('http://localhost:4301/')
  await expect(warmupPage.locator(SELECTORS.frontCard)).toBeVisible()
  await warmupContext.close()

  const context = await browser.newContext({
    viewport: { width: 760, height: 640 },
    // 2x device scale (brief: "at 2x device scale"): Chromium renders (and
    // anti-aliases text, shadows and the fan layout's own transforms) at
    // 2x internally before compositing down, which is what "device scale"
    // buys here. recordVideo's own `size` is deliberately left at the CSS
    // viewport, not doubled: confirmed directly (extracted PNG frames from
    // a first attempt at 1520x1280) that Playwright's screencast frame is
    // still CSS-pixel sized regardless of deviceScaleFactor, and asking
    // recordVideo for a larger `size` than that pads the extra canvas with
    // grey rather than upscaling the content into it, which read as a tiny
    // picture in a mostly-empty frame.
    deviceScaleFactor: 2,
    recordVideo: { dir: videoDir, size: { width: 760, height: 640 } },
  })
  const page = await context.newPage()
  const driver = createPointerDriver(page, testInfo)

  await page.goto('http://localhost:4301/')
  await expect(page.locator(SELECTORS.frontCard)).toBeVisible()
  await expect(page.locator(SELECTORS.readout)).toHaveText('1 / 8')

  const frontCard = page.locator(SELECTORS.frontCard)
  const box = await frontCard.boundingBox()
  if (!box) throw new Error('capture: front card has no bounding box')
  const center = await boundingBoxCenter(frontCard)

  // A pause at rest before the first swipe, so the recording opens on the
  // same settled frame it will end on, and a viewer's eye has a moment to
  // land before anything moves.
  await wait(700)

  // Swipe 1: grabbed near the top-right corner. The pointer then moves
  // only along x, so any rotation visible comes from the grab offset
  // itself, not from steering the drag vertically. Dragging right commits
  // forward (see the direction note above).
  const cornerGrab = { x: box.x + box.width * 0.82, y: box.y + box.height * 0.18 }
  await driver.down(cornerGrab.x, cornerGrab.y)
  await pacedMove(driver, cornerGrab, { x: cornerGrab.x + COMMIT_DX, y: cornerGrab.y }, 18, 30)
  await release(driver)
  await waitForFrontCardSettledX(page, SELECTORS.frontCard)
  await expect(page.locator(SELECTORS.readout)).toHaveText('2 / 8')
  await wait(500)

  // Swipe 2: a plain center drag the other way, committing back to the
  // first card.
  await driver.down(center.x, center.y)
  await pacedMove(driver, center, { x: center.x - COMMIT_DX, y: center.y }, 18, 30)
  await release(driver)
  await waitForFrontCardSettledX(page, SELECTORS.frontCard)
  await expect(page.locator(SELECTORS.readout)).toHaveText('1 / 8')
  await wait(500)

  // Swipe 3: an out-and-back flourish, released slowly back at the exact
  // down point (near-zero progress, low velocity at release), so it
  // settles without committing.
  await driver.down(center.x, center.y)
  await pacedMove(driver, center, { x: center.x - TEASE_DX, y: center.y }, 14, 30)
  await pacedMove(driver, { x: center.x - TEASE_DX, y: center.y }, center, 18, 30)
  await wait(200)
  await release(driver)
  await waitForFrontCardSettledX(page, SELECTORS.frontCard)
  await expect(page.locator(SELECTORS.readout)).toHaveText('1 / 8')

  await wait(900)

  const video = page.video()
  await context.close()
  const videoPath = await video?.path()
  if (!videoPath) throw new Error('capture: no video was recorded')
  console.log(`CAPTURE_VIDEO_PATH:${videoPath}`)
})
