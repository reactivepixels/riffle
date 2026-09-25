import { describe, expect, it, vi } from 'vitest'
import {
  browserClock,
  createLoop,
  MAX_FRAME,
  MAX_SUBSTEPS,
  SUBSTEP,
  type Clock,
} from '../src/animation/loop'

/** A clock the test drives by hand. No timers, no rAF, fully deterministic. */
function fakeClock() {
  let time = 0
  let queue: { handle: number; cb: (now: number) => void }[] = []
  let nextHandle = 1
  const clock: Clock = {
    now: () => time,
    request(cb) {
      const handle = nextHandle++
      queue.push({ handle, cb })
      return handle
    },
    cancel(handle) {
      queue = queue.filter((entry) => entry.handle !== handle)
    },
  }
  return {
    clock,
    /** Advance by `ms` and deliver every queued frame. Returns false if none was queued. */
    tick(ms: number): boolean {
      if (queue.length === 0) return false
      const due = queue
      queue = []
      time += ms
      for (const entry of due) entry.cb(time)
      return true
    },
    hasPending: () => queue.length > 0,
  }
}

describe('loop', () => {
  it('does not run until kicked', () => {
    const { clock, hasPending } = fakeClock()
    createLoop(clock, { integrate: () => {}, write: () => {}, settled: () => false })
    expect(hasPending()).toBe(false)
  })

  it('integrates in fixed substeps regardless of frame length', () => {
    const { clock, tick } = fakeClock()
    const steps: number[] = []
    const loop = createLoop(clock, {
      integrate: (dt) => steps.push(dt),
      write: () => {},
      settled: () => false,
    })
    loop.kick()
    tick(1000 / 60) // one 60Hz frame = two 120Hz substeps
    expect(steps).toEqual([1 / 120, 1 / 120])
  })

  /** A running loop that records how many substeps each tick integrated. */
  function countingLoop() {
    const { clock, tick } = fakeClock()
    let count = 0
    const loop = createLoop(clock, {
      integrate: () => {
        count += 1
      },
      write: () => {},
      settled: () => false,
    })
    loop.kick()
    return (ms: number) => {
      count = 0
      tick(ms)
      return count
    }
  }

  it('caps a long frame at MAX_FRAME and carries no debt into the next', () => {
    const substepsIn = countingLoop()
    // A 5000ms stall (tab restore) integrates only MAX_FRAME (32ms): three
    // 1/120s substeps. Without the cap, it would hit MAX_SUBSTEPS (4).
    expect(substepsIn(5000)).toBe(3)
    // The next ordinary frame integrates as an ordinary frame.
    expect(substepsIn(1000 / 60)).toBeLessThanOrEqual(2)
  })

  it('drops the carry once a frame reaches MAX_SUBSTEPS', () => {
    const substepsIn = countingLoop()
    // 32ms integrates three substeps (25ms) and carries 7ms.
    expect(substepsIn(32)).toBe(3)
    // 7ms carry + 32ms = 39ms: four substeps (33.3ms), which is the cap, so
    // the remaining 5.7ms carry is discarded.
    expect(substepsIn(32)).toBe(4)
    // 5ms alone is under one substep. Had the 5.7ms carry survived, this
    // frame would integrate one.
    expect(substepsIn(5)).toBe(0)
  })

  // loop.ts used to cap the substep while loop at `substeps < MAX_SUBSTEPS`
  // directly. That cap can never bind for the current constants: the
  // accumulator entering any frame is at most one substep's worth of carry
  // (this loop always leaves less than SUBSTEP behind, see the test above)
  // plus MAX_FRAME, so as long as MAX_FRAME <= MAX_SUBSTEPS * SUBSTEP, a
  // frame can never demand a 5th substep and the natural
  // `accumulator >= SUBSTEP` condition always stops the loop first. Pinning
  // that relationship here, rather than the redundant substeps < MAX_SUBSTEPS
  // check, is what stops a future MAX_FRAME increase from silently
  // reintroducing unbounded substeps per frame.
  it('pins MAX_FRAME within MAX_SUBSTEPS * SUBSTEP, so a frame can never need more substeps than the cap', () => {
    expect(MAX_FRAME).toBeLessThanOrEqual(MAX_SUBSTEPS * SUBSTEP)
  })

  it('writes once per frame, not once per substep', () => {
    const { clock, tick } = fakeClock()
    let writes = 0
    const loop = createLoop(clock, {
      integrate: () => {},
      write: () => {
        writes += 1
      },
      settled: () => false,
    })
    loop.kick()
    tick(1000 / 60)
    expect(writes).toBe(1)
  })

  it('halts itself once settled', () => {
    const { clock, tick, hasPending } = fakeClock()
    let done = false
    const loop = createLoop(clock, {
      integrate: () => {},
      write: () => {},
      settled: () => done,
    })
    loop.kick()
    tick(16)
    expect(hasPending()).toBe(true)
    done = true
    tick(16)
    expect(hasPending()).toBe(false)
    expect(loop.isRunning()).toBe(false)
  })

  it('ignores a second kick while already running', () => {
    const { clock, tick } = fakeClock()
    let writes = 0
    const loop = createLoop(clock, {
      integrate: () => {},
      write: () => {
        writes += 1
      },
      settled: () => false,
    })
    loop.kick()
    loop.kick()
    loop.kick()
    tick(16)
    expect(writes).toBe(1)
  })

  it('restarts after settling', () => {
    const { clock, tick, hasPending } = fakeClock()
    let done = true
    const loop = createLoop(clock, {
      integrate: () => {},
      write: () => {},
      settled: () => done,
    })
    loop.kick()
    tick(16)
    expect(hasPending()).toBe(false)
    done = false
    loop.kick()
    expect(hasPending()).toBe(true)
  })

  it('stops cleanly and cancels any pending frame', () => {
    const { clock, hasPending } = fakeClock()
    const loop = createLoop(clock, {
      integrate: () => {},
      write: () => {},
      settled: () => false,
    })
    loop.kick()
    loop.stop()
    expect(hasPending()).toBe(false)
    expect(loop.isRunning()).toBe(false)
  })

  // Mutant 370 (ConditionalExpression, isRunning()'s `return handle !== null`
  // forced to `false`): every existing test only ever asserted isRunning()
  // while stopped or settled, where both the real code and the mutant agree
  // it is false. Asserting `true` while a frame is actually pending is the
  // only way to tell them apart.
  it('reports running while a frame is pending, not only false at rest (mutant 370)', () => {
    const { clock } = fakeClock()
    const loop = createLoop(clock, { integrate: () => {}, write: () => {}, settled: () => false })
    expect(loop.isRunning()).toBe(false)
    loop.kick()
    expect(loop.isRunning()).toBe(true)
  })

  // Mutant 336 (ConditionalExpression, `if (elapsed < 0) elapsed = 0` forced
  // to never clamp): a clock that moves backward (NTP correction, a suspend
  // whose wake timestamp the OS reports oddly) must not drive the
  // accumulator negative, since a negative accumulator then has to climb
  // back through zero, integrating nothing, before physics resumes.
  it('clamps a negative elapsed to zero rather than driving the accumulator negative (mutant 336)', () => {
    const substepsIn = countingLoop()
    substepsIn(32) // establish `last` and leave a small positive carry
    expect(substepsIn(-100)).toBe(0)
    // Clamped, the carry from the first frame is untouched, so the very
    // next ordinary frame integrates normally. Unclamped, the accumulator
    // would still be deeply negative and this frame would integrate zero
    // substeps too.
    expect(substepsIn(1000 / 60)).toBeGreaterThan(0)
  })
})

describe('browserClock', () => {
  // Mutant 326 (ArrowFunction, `cancel: (h) => cancelAnimationFrame(h)`
  // replaced with a no-op): nothing in the loop tests above exercises
  // browserClock() at all, since every one of them injects a fake clock.
  it('delegates now/request/cancel to the global timing APIs', () => {
    const raf = vi.fn().mockReturnValue(7)
    const caf = vi.fn()
    const now = vi.fn().mockReturnValue(123)
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', caf)
    vi.stubGlobal('performance', { now })
    try {
      const clock = browserClock()
      expect(clock.now()).toBe(123)
      const cb = (_now: number) => {}
      expect(clock.request(cb)).toBe(7)
      expect(raf).toHaveBeenCalledWith(cb)
      clock.cancel(7)
      expect(caf).toHaveBeenCalledWith(7)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
