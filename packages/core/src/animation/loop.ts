/** Injected so tests can drive frames by hand with no timers and no rAF. */
export interface Clock {
  now(): number
  request(callback: (now: number) => void): number
  cancel(handle: number): void
}

export interface LoopHooks {
  /** Advance physics by exactly `dt` seconds. */
  integrate(dt: number): void
  /** Write to the DOM. Called once per frame, after all substeps. */
  write(): void
  /** Returning true halts the loop until the next kick. */
  settled(): boolean
}

export interface Loop {
  kick(): void
  stop(): void
  isRunning(): boolean
}

/** Seconds per physics substep. Fixed, so feel does not drift with refresh rate. */
// Test-only exports (not part of the public API surface, and not
// re-exported from index.ts): tests/loop.test.ts pins the relationship
// between these three below. Unused by anything else, so tree-shaking
// drops them from the built bundle (confirmed with size-limit).
export const SUBSTEP = 1 / 120
/** Longest frame we will integrate, in seconds. Guards tab restore. */
export const MAX_FRAME = 0.032
export const MAX_SUBSTEPS = 4

export function browserClock(): Clock {
  return {
    now: () => performance.now(),
    request: (cb) => requestAnimationFrame(cb),
    cancel: (h) => cancelAnimationFrame(h),
  }
}

export function createLoop(clock: Clock, hooks: LoopHooks): Loop {
  let handle: number | null = null
  let last = 0
  let accumulator = 0

  function frame(now: number): void {
    handle = null

    let elapsed = (now - last) / 1000
    if (elapsed > MAX_FRAME) elapsed = MAX_FRAME
    if (elapsed < 0) elapsed = 0
    last = now
    accumulator += elapsed

    // No `substeps < MAX_SUBSTEPS` cap here: the accumulator entering any
    // frame is at most one substep's worth of carry (this loop always
    // leaves less than SUBSTEP behind) plus MAX_FRAME, and
    // tests/loop.test.ts pins MAX_FRAME <= MAX_SUBSTEPS * SUBSTEP, so that
    // sum can never demand a 5th substep. A cap that can never bind is
    // dead code; the invariant test is what stops it from silently
    // becoming reachable if MAX_FRAME is ever raised without raising
    // MAX_SUBSTEPS to match.
    let substeps = 0
    while (accumulator >= SUBSTEP) {
      hooks.integrate(SUBSTEP)
      accumulator -= SUBSTEP
      substeps += 1
    }
    if (substeps === MAX_SUBSTEPS) accumulator = 0

    hooks.write()

    if (hooks.settled()) accumulator = 0
    else handle = clock.request(frame)
  }

  return {
    kick() {
      if (handle !== null) return
      last = clock.now()
      handle = clock.request(frame)
    },
    stop() {
      if (handle === null) return
      clock.cancel(handle)
      handle = null
      accumulator = 0
    },
    isRunning() {
      return handle !== null
    },
  }
}
