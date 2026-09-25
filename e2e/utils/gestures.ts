import type { CDPSession, Page, TestInfo } from '@playwright/test'
// The real algorithm, not a hand-written copy of it: see velocityFromSamples's
// own comment below. No build step needed; velocity.ts has no imports of its
// own, and Playwright's own TS transform compiles this like any other source
// file in the workspace.
import { createVelocityTracker } from '../../packages/core/src/gesture/velocity'
import { MOBILE_PROJECT, SLOP_PX, VELOCITY_WINDOW_MS } from './engine-constants'

export interface Point {
  x: number
  y: number
}

/**
 * A single pointer's primitive actions, backed by a real mouse on desktop
 * projects and real CDP touch input (`Input.dispatchTouchEvent`) on
 * mobile-chromium: most of the interaction suite runs on both, one
 * spec body, one driver call site. Every spec that uses this asserts a
 * precondition after the gesture, so a driver call that silently failed to
 * engage the engine cannot pass.
 */
export interface PointerDriver {
  kind: 'mouse' | 'touch'
  /** Press down at (x, y). For touch this is the touchstart itself. */
  down(x: number, y: number): Promise<void>
  /** Move to (x, y) while pressed. One event; see smoothMove for a paced path. */
  move(x: number, y: number): Promise<void>
  up(): Promise<void>
}

function createMouseDriver(page: Page): PointerDriver {
  return {
    kind: 'mouse',
    async down(x, y) {
      await page.mouse.move(x, y)
      await page.mouse.down()
    },
    async move(x, y) {
      await page.mouse.move(x, y)
    },
    async up() {
      await page.mouse.up()
    },
  }
}

// A stable identifier for the one touch point a driver instance ever
// dispatches, held across its touchStart/touchMove/touchEnd: a real finger
// keeps one id for the life of a single contact,
// and CDP's own Input.dispatchTouchEvent uses `id` to match touch points
// across events, so a driver that omitted it (or that varied it per event)
// looked nothing like a real, single, continuous touch to anything reading
// `id` off the dispatched events.
let nextTouchId = 1

interface CdpTouchPoint {
  x: number
  y: number
  id: number
  radiusX: number
  radiusY: number
  force: number
}

// Realistic contact geometry and pressure for a single-finger touch:
// CDP defaults radiusX/radiusY to 1 (a pinpoint, nothing
// like a finger) when omitted, so it is set explicitly here rather than
// relying on that default. 11px approximates a fingertip's contact radius
// at typical mobile screen density; force 1 matches what most capacitive
// touchscreens actually report (binary contact, not true pressure).
const TOUCH_RADIUS_PX = 11
const TOUCH_FORCE = 1

function touchPoint(x: number, y: number, id: number): CdpTouchPoint {
  return { x, y, id, radiusX: TOUCH_RADIUS_PX, radiusY: TOUCH_RADIUS_PX, force: TOUCH_FORCE }
}

function createTouchDriver(page: Page): PointerDriver {
  let client: CDPSession | null = null
  let id: number | null = null
  return {
    kind: 'touch',
    async down(x, y) {
      client = await page.context().newCDPSession(page)
      id = nextTouchId
      nextTouchId += 1
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [touchPoint(x, y, id)],
      })
    },
    async move(x, y) {
      if (!client || id === null) throw new Error('touch driver: move() called before down()')
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [touchPoint(x, y, id)],
      })
    },
    async up() {
      if (!client) throw new Error('touch driver: up() called before down()')
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      client = null
      id = null
    },
  }
}

/** Mouse on every desktop project, real CDP touch on mobile-chromium. */
export function createPointerDriver(
  page: Page,
  testInfo: Pick<TestInfo, 'project'>,
): PointerDriver {
  return testInfo.project.name === MOBILE_PROJECT
    ? createTouchDriver(page)
    : createMouseDriver(page)
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A drag, broken into explicit steps so the caller controls real elapsed
 * time between samples (the velocity tracker reads wall-clock time,
 * packages/core/src/gesture/velocity.ts, so timing is part of the gesture,
 * not an implementation detail).
 *
 * The first step always moves past SLOP_PX so the engine actually locks the
 * gesture (packages/core/src/gesture/pointer.ts: nothing happens below
 * `slop`); every spec that calls this asserts a precondition afterward
 * (dragging state, or a position change) so a gesture that silently failed
 * to lock cannot pass.
 */
export async function dragSteps(
  driver: PointerDriver,
  start: Point,
  steps: Array<{ dx: number; dy?: number; waitMs?: number }>,
): Promise<void> {
  await driver.down(start.x, start.y)
  for (const step of steps) {
    await driver.move(start.x + step.dx, start.y + (step.dy ?? 0))
    if (step.waitMs) await wait(step.waitMs)
  }
}

export async function release(driver: PointerDriver): Promise<void> {
  await driver.up()
}

/**
 * A gradual move along a straight line, `steps` intermediate points on
 * both mouse and touch: a single big jump did not reliably register as a
 * drag at all on WebKit (observed directly: the card's transform stayed at
 * baseline after one large page.mouse.move()), and on touch each step is
 * paced ~16ms apart (one 60Hz frame), matching cdpTouchSwipe's own pacing.
 *
 * This used to force exactly one step on touch, working
 * around a Riffle defect (fixed in packages/core/src/gesture/pointer.ts,
 * commit 916f939: a card's implicit touch capture, per Pointer Events 3
 * 9.4, fired `lostpointercapture` at the card when the drag container took
 * capture after slop, and that event bubbled to the container's own
 * `lostpointercapture` listener, which read it as the gesture being
 * cancelled) rather than a CDP limitation. With the fix in place, multi-step
 * touch moves behave the same as mouse.
 */
export async function smoothMove(
  driver: PointerDriver,
  from: Point,
  to: Point,
  steps = 5,
): Promise<void> {
  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    await driver.move(x, y)
    if (driver.kind === 'touch') await wait(16)
  }
}

/**
 * A slow, steady drag: `totalDx` spread over many small steps at a fixed
 * cadence, so the velocity tracker's 100ms window sees a low, uniform rate
 * for the entire gesture (not just the end). `stepDelayMs` is a real wait
 * between each step: the test this feeds is explicitly about time (fast vs
 * slow), so this is the documented exception to "never a fixed wait for
 * correctness". Timing is the same for mouse and touch: the tracker only
 * ever sees wall-clock time and position, not the input kind.
 */
export async function slowDrag(
  driver: PointerDriver,
  start: Point,
  totalDx: number,
): Promise<void> {
  const stepCount = 20
  // 25ms * 20 steps = 500ms total. At 100ms window, the last ~4 steps
  // (~20% of totalDx) are what the tracker sees at release, giving a
  // uniform rate of totalDx/500 px/ms, always well under FLING_VELOCITY_PX_MS
  // (0.5) for the drag distances these specs use (<= ~50px), with margin
  // against CI jitter (a real device would have to run 2x+ slower than
  // expected before this crossed the fling bar).
  const stepDelayMs = 25
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    dx: (totalDx * (i + 1)) / stepCount,
    waitMs: stepDelayMs,
  }))
  await dragSteps(driver, start, steps)
}

/**
 * A flick: a short back-swing, then one fast move forward, ending `forwardDx`
 * from where it started. The fling spec's fast half.
 *
 * Why not a straight forward drag: the engine's velocity is the displacement
 * between the oldest and newest pointermove still inside its 100ms window,
 * over their elapsed time (packages/core/src/gesture/velocity.ts), and each
 * dispatched move costs real time before the engine sees it. Measured
 * engine-side in the pinned CI container, two consecutive CDP touch moves on
 * mobile-chromium land 32-69ms apart (median ~50ms), because touchmove is
 * delivered on the frame cadence. A forward-only drag that must end below
 * the distance threshold (COMMIT_THRESHOLD * stepTravel, 42.5px for a 150px
 * card) can put at most 42.5 - SLOP_PX = 36.5px between its two samples:
 * 0.73px/ms at 50ms and 0.53px/ms at 69ms, against a 0.5px/ms bar. More
 * steps only add dispatch time for the same capped displacement. The
 * back-swing is what moves the numerator without moving the end point: the
 * slop-clearing sample lands at -backDx, the second at +forwardDx, so the
 * tracker sees backDx + forwardDx of displacement while the release offset
 * (what the distance threshold reads) is still only forwardDx.
 *
 * A short fixed 8ms gap separates the two moves. It is not a correctness
 * sleep: without it, two back-to-back mouse moves landed with an identical
 * performance.now() timestamp often enough on Firefox to zero out the
 * tracker's dt (`if (dt <= 0) return 0`), which read as no velocity at all.
 */
export async function fastFlick(
  driver: PointerDriver,
  start: Point,
  backDx: number,
  forwardDx: number,
): Promise<void> {
  if (Math.abs(backDx) <= SLOP_PX) {
    throw new Error(`fastFlick: backDx (${backDx}) must clear SLOP_PX (${SLOP_PX}) to lock`)
  }
  await dragSteps(driver, start, [{ dx: -backDx, waitMs: 8 }, { dx: forwardDx }])
}

/**
 * fastFlick's exact path (back to -backDx, then forward to +forwardDx),
 * walked slowly: the fling spec's control half, so the only thing that
 * differs from the fast half is speed. 10 steps back and 20 forward, 25ms
 * apart: the forward leg's rate is (backDx + forwardDx) / 500ms, under
 * 0.2px/ms for any distance these specs use, far below the 0.5px/ms bar.
 */
export async function slowFlickPath(
  driver: PointerDriver,
  start: Point,
  backDx: number,
  forwardDx: number,
): Promise<void> {
  const stepDelayMs = 25
  const back = Array.from({ length: 10 }, (_, i) => ({
    dx: (-backDx * (i + 1)) / 10,
    waitMs: stepDelayMs,
  }))
  const forward = Array.from({ length: 20 }, (_, i) => ({
    dx: -backDx + ((backDx + forwardDx) * (i + 1)) / 20,
    waitMs: stepDelayMs,
  }))
  await dragSteps(driver, start, [...back, ...forward])
}

/**
 * The headline hold-then-release case: flick fast (fastFlick, so the
 * tracker genuinely reads above the fling bar at the last move), hold the
 * card dead still for 200ms, then the caller releases. A stationary pointer
 * emits no pointermove, so the velocity tracker's window
 * (packages/core/src/gesture/velocity.ts) ages every sample out by release
 * time and reads 0: the gesture must spring back, not fling, even though it
 * moved fast a moment earlier. The 200ms wait is fixed and real on purpose
 * (the test is about this elapsed time exceeding the 100ms window with
 * margin); the test itself confirms the engine-side gap from the recorded
 * pointer events, not from this wait.
 */
export async function fastFlickThenHold(
  driver: PointerDriver,
  start: Point,
  backDx: number,
  forwardDx: number,
): Promise<void> {
  await fastFlick(driver, start, backDx, forwardDx)
  await wait(200)
}

/**
 * CDP touch dispatch for a vertical scroll swipe; page.touchscreen
 * only taps. Chromium's native scroll gesture recogniser needs touchmove
 * events paced roughly one per frame (a burst of same-tick moves is not
 * recognised as a scroll, confirmed empirically against this
 * Playwright/Chromium build: an unpaced version of this helper produced
 * scrollY 0). 16ms approximates one 60Hz frame.
 */
export async function cdpTouchSwipe(
  page: Page,
  start: Point,
  end: Point,
  opts: { steps?: number } = {},
): Promise<void> {
  const client = await page.context().newCDPSession(page)
  const steps = opts.steps ?? 10
  const id = nextTouchId
  nextTouchId += 1
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [touchPoint(start.x, start.y, id)],
  })
  for (let i = 1; i <= steps; i += 1) {
    await wait(16)
    const x = start.x + ((end.x - start.x) * i) / steps
    const y = start.y + ((end.y - start.y) * i) / steps
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [touchPoint(x, y, id)],
    })
  }
  await wait(16)
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/**
 * Replaces reading the card's position
 * mid-drag, which inherently raced real event-dispatch latency no matter how
 * it was read (a bare read, a settle wait, or a bounded poll: all three were
 * tried and each either raced a slow dispatch on WebKit or, when given
 * enough time to avoid that, pushed real elapsed time toward the velocity
 * tracker's window and intermittently decayed a genuine fling into a
 * spring-back instead, on WebKit, mobile-chromium and, at a roughly 1-in-15
 * baseline rate present even before this replacement, firefox).
 *
 * Instead of reading anything before release, this records every real
 * `pointermove`/`pointerup` event on `document` during the gesture (started
 * before the drag; the caller stops it only after release has resolved, and
 * after waitForVelocitySamples below has confirmed both of the fast gesture's moves
 * were actually recorded first). `stopVelocityRecording` then replays
 * `packages/core/src/gesture/velocity.ts`'s exact algorithm (a sliding
 * `VELOCITY_WINDOW_MS` window, pruned against the real release time, the
 * position delta between the oldest sample still in that window and the
 * newest, over their real elapsed time) against those real timestamps, so a
 * caller can assert what the engine's own tracker actually computed, from a
 * record of what genuinely happened rather than from a value read while it
 * was still happening.
 *
 * `performance.now()` read inside this listener, not `PointerEvent.timeStamp`:
 * `packages/core/src/riffle.ts`'s `clock.now()` (the time `pointer.ts` calls
 * `handlers.onMove`/`onEnd` with) is `browserClock()`'s `performance.now()`
 * (`packages/core/src/animation/loop.ts`), read synchronously inside the
 * engine's own event handler, the same way this reads it inside its own
 * handler for the identical bubbled event; both fire, and read the same
 * monotonic clock, within microseconds of each other.
 *
 * Position samples come only from `pointermove` (mirroring `pointer.ts`'s
 * `onMove`, the only place `tracker.add()` runs; `onStart`/`onEnd` never
 * add a sample), using raw `clientX`, not a delta from the drag's start:
 * velocity is a difference of two samples, so a constant per-gesture offset
 * cancels out identically either way.
 */
export async function startVelocityRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __velocityMoves: Array<{ x: number; t: number }>
      __velocityUpAt: number | null
      __velocityOnMove: ((e: PointerEvent) => void) | null
      __velocityOnUp: ((e: PointerEvent) => void) | null
    }
    w.__velocityMoves = []
    w.__velocityUpAt = null
    w.__velocityOnMove = (e) => w.__velocityMoves.push({ x: e.clientX, t: performance.now() })
    w.__velocityOnUp = () => {
      w.__velocityUpAt = performance.now()
    }
    document.addEventListener('pointermove', w.__velocityOnMove)
    document.addEventListener('pointerup', w.__velocityOnUp)
  })
}

/**
 * Polls (repeated page.evaluate round trips, no per-iteration wait of its
 * own, the same technique tryProgressBetween in settle.ts uses) until at
 * least `minSamples` pointermove events have been recorded, or `timeoutMs`
 * elapses. Call this after the gesture's moves and before release(): fixes
 * a distinct failure mode from the mid-drag position reads this replaced:
 * under sustained repeated load (50+
 * repeats in a row), the fast gesture's second move occasionally had not yet been
 * recorded at all by the time release() ran immediately after it, leaving
 * fewer than two samples in the window regardless of how the velocity was
 * computed (`stopVelocityRecording` returns 0 for that case by design, so
 * it fails as a clear, correctly attributed precondition rather than a
 * misleading outcome failure, but the goal here is for it not to happen).
 * Bounded well under `VELOCITY_WINDOW_MS` (100ms): waiting for the *count*
 * of recorded events, rather than for real time to pass, does not cost the
 * eventual velocity calculation anything (the recorded timestamps are fixed
 * at real dispatch time regardless of when this notices them), but genuinely
 * waiting here, rather than immediately after, would: the window is pruned
 * against the real release time, so a wait inserted after release, or one
 * long enough to approach the window itself, would prune the very samples
 * this exists to preserve.
 */
export async function waitForVelocitySamples(
  page: Page,
  minSamples: number,
  timeoutMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const count = await page.evaluate(() => {
      const w = window as unknown as { __velocityMoves: Array<{ x: number; t: number }> }
      return w.__velocityMoves?.length ?? 0
    })
    if (count >= minSamples || Date.now() >= deadline) return
  }
}

interface RecordedSample {
  x: number
  t: number
}

/**
 * Stops recording (call only after release() has resolved; see
 * startVelocityRecording's own comment for why) and returns the raw
 * recorded pointermove samples plus the pointerup time, unprocessed.
 *
 * This used to compute the velocity itself,
 * inside the page, hand-replaying `packages/core/src/gesture/velocity.ts`'s
 * sliding-window algorithm a second time. Two implementations of the same
 * algorithm can silently drift apart (a future change to the real tracker
 * with no matching edit here would go unnoticed, since nothing forces the
 * two to agree). `velocityFromSamples` below runs the actual
 * `createVelocityTracker` instead, imported directly from its source, so
 * there is exactly one implementation of the algorithm, not two kept in
 * sync by hand.
 */
export async function stopVelocityRecording(
  page: Page,
): Promise<{ samples: RecordedSample[]; upAt: number | null }> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __velocityMoves: Array<{ x: number; t: number }>
      __velocityUpAt: number | null
      __velocityOnMove: ((e: PointerEvent) => void) | null
      __velocityOnUp: ((e: PointerEvent) => void) | null
    }
    if (w.__velocityOnMove) document.removeEventListener('pointermove', w.__velocityOnMove)
    if (w.__velocityOnUp) document.removeEventListener('pointerup', w.__velocityOnUp)
    w.__velocityOnMove = null
    w.__velocityOnUp = null
    return { samples: w.__velocityMoves ?? [], upAt: w.__velocityUpAt ?? null }
  })
}

/**
 * Replays the real engine algorithm (not a hand-written copy of it) against
 * recorded samples: `createVelocityTracker` imported directly from
 * `packages/core/src/gesture/velocity.ts` by relative path (it has no
 * imports of its own, so this needs no build step or bundling), fed the
 * same `add(position, time)` calls `pointer.ts`'s `onMove` makes, then
 * `get(now)` at the recorded pointerup time, the same call `riffle.ts`'s
 * `onEnd` makes. One algorithm, one implementation, used by both the
 * product and this assertion: this cannot silently drift from what the
 * product actually computes the way a hand-written reimplementation could.
 */
export function velocityFromSamples(samples: RecordedSample[], upAt: number | null): number {
  const tracker = createVelocityTracker(VELOCITY_WINDOW_MS)
  for (const sample of samples) tracker.add(sample.x, sample.t)
  const now = upAt ?? samples[samples.length - 1]?.t ?? 0
  return tracker.get(now)
}
