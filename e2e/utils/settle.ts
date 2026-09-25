import type { Locator, Page } from '@playwright/test'

/**
 * Polls the card's own rendered transform (not a store, not an event; the
 * exact CSS the browser is compositing) until it stops changing across
 * three consecutive animation frames, then returns its resting
 * `getBoundingClientRect().x`.
 *
 * This is how "settled" is detected without sleeping: it samples via
 * `requestAnimationFrame` inside the page, driven by the actual paint
 * cadence, and returns as soon as the product says it is done. `maxFrames`
 * is a safety cap, not a correctness wait: at 60fps, 240 frames is 4s,
 * several times the default spring's settle time (see
 * packages/core/src/animation/spring.ts, stiffness 340 / damping 34, near
 * critically damped), so a spec that reaches it is a spec that should fail
 * for hanging, not a spec quietly extended by a sleep.
 */
export async function waitForFrontCardSettledX(
  page: Page,
  selector: string,
  maxFrames = 240,
): Promise<number> {
  return page.evaluate(
    async ({ selector, maxFrames }) => {
      const el = document.querySelector(selector)
      if (!el) throw new Error(`waitForFrontCardSettledX: no element for ${selector}`)
      const read = () => el.getBoundingClientRect().x
      let prev = read()
      let stableFrames = 0
      for (let i = 0; i < maxFrames; i += 1) {
        await new Promise<number>((resolve) => requestAnimationFrame(resolve))
        const cur = read()
        stableFrames = cur === prev ? stableFrames + 1 : 0
        prev = cur
        if (stableFrames >= 3) return cur
      }
      return prev
    },
    { selector, maxFrames },
  )
}

/**
 * Reads the same element's x across two consecutive animation frames and
 * asserts they are identical. Used for the reduced-motion checks: a
 * non-animated jump to target writes its final pose once and then does
 * nothing further, so two frames immediately after the trigger already
 * agree, unlike an animated transition which is still moving. Bit-exact
 * (no spring means no intermediate float), so equality rather than an
 * epsilon is deliberate: an epsilon here would quietly accept a slow-moving
 * animation this check exists to rule out.
 */
export async function readsSameAcrossTwoFrames(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(async (selector) => {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`readsSameAcrossTwoFrames: no element for ${selector}`)
    const read = () => el.getBoundingClientRect().x
    const first = read()
    await new Promise<number>((resolve) => requestAnimationFrame(resolve))
    await new Promise<number>((resolve) => requestAnimationFrame(resolve))
    const second = read()
    return first === second
  }, selector)
}

/**
 * Starts an in-page rAF sampling loop over `selector`'s translateX, running
 * continuously until `stopSampling` is called. Used by the mid-animation
 * grab check so the "frame before" and "frame after" the pointer lands are both
 * read from one continuous in-page loop (requestAnimationFrame sampling
 * inside the page, not two separate
 * Playwright round trips), rather than two separate page.evaluate calls
 * racing the animation.
 *
 * Samples the transform matrix's translation component, not
 * getBoundingClientRect().x: the card being sampled here is
 * animating in from the fan's background position, where it is also being
 * scaled up toward 1 (packages/core/src/layout/fan.ts's `scale = 1 -
 * scaleStep * d`), and CSS scales an element about its own centre by
 * default, which shifts the rendered box's left edge independently of
 * translateX. Confirmed directly: rect.x on a real transition read 570,
 * dipped to 546.8, and climbed back to 570, a spurious round trip that
 * does not correspond to the card's actual (monotonic) translateX, which
 * over the same frames read -32 -> ~0. See frontCardTranslateX's own
 * comment for why the matrix's translation column is the value unaffected
 * by scale or rotation.
 */
export async function startSampling(page: Page, selector: string): Promise<void> {
  await page.evaluate((selector) => {
    const w = window as unknown as {
      __riffleSamples: Array<{ t: number; x: number }>
      __riffleSampling: boolean
    }
    w.__riffleSamples = []
    w.__riffleSampling = true
    function translateXOf(el: Element): number {
      const transform = getComputedStyle(el).transform
      if (transform === 'none') return 0
      if (transform.startsWith('matrix3d(')) {
        const values = transform.slice(9, -1).split(',').map(Number)
        return values[12] ?? 0
      }
      return Number(transform.slice(7, -1).split(',')[4]) || 0
    }
    // Re-queried every frame, not resolved once: sampling starts
    // before clicking Next, and the click flips tabindex=0 (and so
    // SELECTORS.frontCard's match) to the incoming card synchronously,
    // before the animation itself has moved anything (packages/core/src/riffle.ts
    // setTarget's animated branch calls syncActive, which runs a11y.update,
    // in the same tick as kick()). Resolving once up front would instead
    // track the outgoing card.
    function loop(): void {
      if (!w.__riffleSampling) return
      const el = document.querySelector(selector)
      if (el) w.__riffleSamples.push({ t: performance.now(), x: translateXOf(el) })
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }, selector)
}

export async function stopSampling(page: Page): Promise<Array<{ t: number; x: number }>> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __riffleSamples: Array<{ t: number; x: number }>
      __riffleSampling: boolean
    }
    w.__riffleSampling = false
    return w.__riffleSamples
  })
}

/** performance.now() as read inside the page, so it is comparable to sample timestamps. */
export async function pageNow(page: Page): Promise<number> {
  return page.evaluate(() => performance.now())
}

/**
 * Resolves after `frames` animation frames have elapsed inside the page.
 * Used by the mid-animation grab check as a short, deterministic wait after the
 * grab: the engine's own write is itself scheduled via requestAnimationFrame
 * (packages/core/src/animation/loop.ts's kick()), so a callback chained the
 * same way is guaranteed to run no earlier than that write, without an
 * arbitrary real-time sleep that would let legitimate continued motion
 * accumulate before the measurement.
 */
export async function waitAnimationFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate(async (frames) => {
    for (let i = 0; i < frames; i += 1) {
      await new Promise<number>((resolve) => requestAnimationFrame(resolve))
    }
  }, frames)
}

/**
 * Polls the in-page sample buffer (populated by startSampling) until the
 * incoming card has covered a fraction of its transition between `min` and
 * `max` (0-1). Fraction is measured against `x0`, the card's own resting
 * start (its first *non-zero* sample: sampling begins before the click, so
 * the leading sample or two are still the outgoing card, mid-transition at
 * translateX 0, confirmed directly: `[0, 0, 0, -32, -31.24, ...]`; skipping
 * the leading zeros is what makes `x0` the incoming card's actual resting
 * background position rather than a stale reading of a different card) and
 * a known end of 0 (a front card's resting translateX is always 0:
 * packages/core/src/layout/fan.ts's pose(0).main). Used by the mid-animation
 * grab check so the grab happens at a meaningfully mid-flight moment
 * regardless of how fast a given engine's spring actually runs: a fixed
 * wait landed the grab anywhere from freshly-started to already-settled
 * depending on engine speed, which is why the original version of this
 * check's break-it proof only caught the bug in 1 of 9 example/engine
 * combinations.
 *
 * Resolves null instead of throwing when the
 * band was missed: either a sample already shows progress past `max` (the
 * frames stepped over the band) or `timeoutMs` elapsed. In the CI container
 * the rendering engine was measured going 350ms+ between animation frames,
 * long enough for a whole spring transition to cross 30%-70% between two
 * sampled frames, so a caller that needs a mid-flight moment can start the
 * transition again rather than fail on a moment that never existed.
 */
export async function tryProgressBetween(
  page: Page,
  min: number,
  max: number,
  timeoutMs = 2000,
): Promise<{ fraction: number; x0: number } | null> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const samples = await page.evaluate(() => {
      const w = window as unknown as { __riffleSamples: Array<{ t: number; x: number }> }
      return w.__riffleSamples
    })
    const first = samples.find((s) => s.x !== 0)
    if (first) {
      const x0 = first.x
      const cur = samples[samples.length - 1]!.x
      const fraction = (x0 - cur) / x0
      if (fraction >= min && fraction <= max) return { fraction, x0 }
      if (fraction > max) return null
    }
    if (Date.now() > deadline) return null
  }
}

/**
 * The largest px/ms rate of change between consecutive samples, i.e. the
 * fastest the position was genuinely observed to move. A rate rather than
 * a per-frame delta: under real CI/CPU contention, frame
 * spacing itself stretches (confirmed directly, on Firefox specifically:
 * two samples 30ms+ apart read as one "frame"), and a per-frame-delta
 * bound derived from a stretched, slow frame reads as tiny, then flags
 * perfectly ordinary motion elsewhere in the trace as a violation. A rate
 * normalises for that: however long a given interval took, the same
 * underlying spring only moves so many pixels per millisecond.
 */
export function maxRatePxPerMs(samples: Array<{ t: number; x: number }>): number {
  let max = 0
  for (let i = 1; i < samples.length; i += 1) {
    const dt = samples[i]!.t - samples[i - 1]!.t
    if (dt <= 0) continue
    const rate = Math.abs(samples[i]!.x - samples[i - 1]!.x) / dt
    if (rate > max) max = rate
  }
  return max
}

/**
 * The card's own translateX, read from its computed transform matrix
 * rather than getBoundingClientRect(). The engine composes
 * `translate3d(X, Y, 0) rotate(R) scale(S)` (packages/core/src/render/transform.ts):
 * rotate and scale are applied to the element's local
 * box before translate3d repositions it, so the matrix's translation
 * column (index 12 of a matrix3d) is exactly X, unaffected by any tilt.
 * getBoundingClientRect().x is not: rotating a rectangle changes its
 * axis-aligned bounding box, so during an active drag (which tilts the
 * front card) it reads several px off from the true
 * main-axis offset. The reduced-motion 1:1 drag-tracking check needs the exact
 * value, hence this helper instead of the rect.
 */
export async function frontCardTranslateX(page: Page, selector: string): Promise<number> {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`frontCardTranslateX: no element for ${selector}`)
    const transform = getComputedStyle(el).transform
    if (transform === 'none') return 0
    if (transform.startsWith('matrix3d(')) {
      const values = transform.slice(9, -1).split(',').map(Number)
      return values[12] ?? 0
    }
    // 2D matrix(a, b, c, d, e, f): e is translateX.
    const values = transform.slice(7, -1).split(',').map(Number)
    return values[4] ?? 0
  }, selector)
}

export async function boundingBoxCenter(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('boundingBoxCenter: element has no box (not visible/attached)')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
