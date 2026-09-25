import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRiffle } from '../src/riffle'
import { RiffleError } from '../src/errors'
import type { Clock } from '../src/animation/loop'
import type { RiffleOptions, SpringPreset } from '../src/types'

// createRiffle's public signature is RiffleOptions; `clock` is a
// test-only injection point read internally via a cast (riffle.ts's
// InternalOptions, deliberately not exported). This performs the matching
// cast here so tests can inject a clock and still typecheck, the same
// pattern riffle.test.ts uses.
type TestOptions = RiffleOptions & { clock?: Clock }

function withClock(opts: TestOptions): RiffleOptions {
  return opts as RiffleOptions
}

let container: HTMLElement

function testClock() {
  let time = 0
  let pending: ((now: number) => void) | null = null
  const clock: Clock = {
    now: () => time,
    request: (cb) => {
      pending = cb
      return 1
    },
    cancel: () => {
      pending = null
    },
  }
  return {
    clock,
    settle(max = 600) {
      let n = 0
      while (pending && n < max) {
        const cb = pending
        pending = null
        time += 1000 / 60
        cb(time)
        n += 1
      }
      return n
    },
  }
}

function setup(count = 5, extra: Partial<TestOptions> = {}) {
  const { clock, settle } = testClock()
  const riffle = createRiffle(
    container,
    withClock({ count, clock, cardWidth: 300, cardHeight: 400, gap: 20, ...extra }),
  )
  const nodes = Array.from({ length: count }, (_, i) => {
    const el = document.createElement('div')
    container.appendChild(el)
    riffle.registerNode(i, el)
    return el
  })
  return { riffle, nodes, settle }
}

/** happy-dom does not implement pointer capture; the engine only calls it. */
function preparePointerTarget(el: HTMLElement): void {
  el.setPointerCapture = vi.fn()
  el.releasePointerCapture = vi.fn()
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400, x: 0, y: 0 }) as DOMRect
}

function firePointer(node: HTMLElement, type: string, init: Record<string, unknown> = {}): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(
    event,
    { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 0, clientY: 0 },
    init,
  )
  node.dispatchEvent(event)
}

/** Press at (100, 200) and drag along x to `dx`, one move per offset. */
function drag(...dxs: number[]): void {
  firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
  for (const dx of dxs) firePointer(container, 'pointermove', { clientX: 100 + dx, clientY: 200 })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

// --- Lifecycle and event robustness ---

describe('goTo takes the shortest path under bounds: loop', () => {
  it('goes backward one step rather than forward four, from index 0 in a five-card ring', () => {
    const { riffle, settle } = setup(5)
    const onChange = vi.fn()
    riffle.on('change', onChange)
    riffle.goTo(4)
    settle()
    expect(onChange).toHaveBeenCalledWith({ index: 4, previousIndex: 0, direction: -1 })
    expect(riffle.position).toBe(-1)
  })

  it('goes forward when that is the shorter way, from index 0 in a four-card ring', () => {
    const { riffle, settle } = setup(4)
    riffle.goTo(2)
    settle()
    expect(riffle.position).toBe(2)
  })

  it('rejects a non-integer index with a coded error', () => {
    const { riffle } = setup(5)
    expect(() => riffle.goTo(1.5)).toThrowError(RiffleError)
    try {
      riffle.goTo(1.5)
    } catch (error) {
      expect((error as RiffleError).code).toBe('INVALID_OPTION')
    }
  })

  it('does not take the shortest path under bounds: clamp, since there is nothing to wrap around', () => {
    const { riffle, settle } = setup(5, { bounds: 'clamp' })
    riffle.goTo(4, { animate: false })
    settle()
    expect(riffle.position).toBe(4)
  })
})

it('refreshes card labels when setCount changes the count', () => {
  const { riffle, nodes } = setup(3)
  expect(nodes[0]?.getAttribute('aria-label')).toBe('1 of 3') // precondition
  riffle.setCount(5)
  expect(nodes[0]?.getAttribute('aria-label')).toBe('1 of 5')
})

it('clears inline transform, opacity and zIndex on destroy', () => {
  const { riffle, nodes, settle } = setup()
  settle()
  expect(nodes[0]?.style.transform).not.toBe('') // precondition: a settled card has a real transform
  riffle.destroy()
  expect(nodes[0]?.style.transform).toBe('')
  expect(nodes[0]?.style.opacity).toBe('')
  expect(nodes[0]?.style.zIndex).toBe('')
})

it('writes immediately to a freshly swapped element at an already-used index', () => {
  const { riffle, settle } = setup()
  settle()
  const b = document.createElement('div')
  container.appendChild(b)
  riffle.registerNode(0, b) // no intervening null, like the Vue adapter's keyed reorders
  expect(b.style.transform).not.toBe('')
})

it('subscribe and on after destroy return a safe no-op unsubscribe and deliver nothing', () => {
  // This cannot, on its own, distinguish the guard's presence
  // from its absence. With setTarget now checking destroyed at the top of
  // *both* branches ("setTarget checks destroyed before writing or
  // notifying on either branch" below), no public API sequence
  // reaches emit()/store.notify() after destroy() at all, so a post-destroy
  // subscribe/on is already inert regardless of whether it guards itself.
  // The guard is defence in depth, verified by inspection (both return
  // () => {} immediately when destroyed), not by this test.
  const { riffle } = setup()
  riffle.destroy()

  const changeListener = vi.fn()
  const onUnsub = riffle.on('change', changeListener)
  expect(() => onUnsub()).not.toThrow()

  const storeListener = vi.fn()
  const subUnsub = riffle.subscribe(storeListener)
  expect(() => subUnsub()).not.toThrow()

  expect(changeListener).not.toHaveBeenCalled()
  expect(storeListener).not.toHaveBeenCalled()
})

it('setTarget checks destroyed before writing or notifying on either branch', () => {
  // The gap this closes: onEnd's *animated* branch (the default
  // reducedMotion, taken here) called syncActive unconditionally, even
  // after a dragend listener had already destroyed the instance
  // synchronously. Captured at the moment destroy() completes, inside the
  // listener, so it reflects exactly what the rest of onEnd (which keeps
  // running after the listener returns) must not be able to change.
  const { riffle, settle } = setup()
  preparePointerTarget(container)
  const onChange = vi.fn()
  riffle.on('change', onChange)
  let snapshotAtDestroy: ReturnType<typeof riffle.getSnapshot> | undefined
  riffle.on('dragend', () => {
    riffle.destroy()
    snapshotAtDestroy = riffle.getSnapshot()
  })

  drag(250) // past threshold, so onEnd's setTarget would otherwise commit
  firePointer(container, 'pointerup', { clientX: 350, clientY: 200 })
  settle()

  expect(onChange).not.toHaveBeenCalled()
  expect(riffle.getSnapshot()).toBe(snapshotAtDestroy)
})

it('a throwing listener does not break dispatch', () => {
  const { riffle, settle } = setup()
  const originalReportError = globalThis.reportError
  const reportError = vi.fn()
  globalThis.reportError = reportError
  try {
    const boom = new Error('listener A blew up')
    const a = vi.fn(() => {
      throw boom
    })
    const b = vi.fn()
    riffle.on('change', a)
    riffle.on('change', b)

    riffle.next()
    settle()

    expect(a).toHaveBeenCalledTimes(1) // precondition: A actually ran (and threw)
    expect(b).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledWith(boom)
  } finally {
    globalThis.reportError = originalReportError
  }
})

describe('settle fires on non-animated paths too, exactly once', () => {
  it('goTo(i, { animate: false }) emits settle exactly once with the landed index', () => {
    const { riffle } = setup()
    const onSettle = vi.fn()
    riffle.on('settle', onSettle)
    riffle.goTo(3, { animate: false })
    expect(onSettle).toHaveBeenCalledTimes(1)
    expect(onSettle).toHaveBeenCalledWith({ index: 3 })
  })

  it('stops a leaked pending frame from an earlier animated navigation', () => {
    // This does NOT reproduce the double-fire itself. next()
    // kicks a frame but none has run yet here, so the settled latch
    // (wasSettled) is still true from initialization, and even the pre-fix
    // naive implementation (emit unconditionally, no loop.stop()) would not
    // double-emit in this exact sequence: when the stale frame eventually
    // ran, its own settled() hook would find wasSettled still true and stay
    // silent. What this test proves independently: the non-animated
    // branch's loop.stop() means that stale frame is never scheduled to run
    // again at all, i.e. settle() below returns 0, not some positive number
    // of frames wastefully re-settling the same navigation.
    const { riffle, settle } = setup()
    const onSettle = vi.fn()
    riffle.next() // starts an animated navigation; the loop is now running
    riffle.on('settle', onSettle)
    riffle.goTo(3, { animate: false }) // reaches rest immediately, mid-flight
    expect(onSettle).toHaveBeenCalledTimes(1)
    // Any frame the earlier next() had already scheduled must not still be
    // pending and able to reach its own settled() hook later.
    expect(settle()).toBe(0)
    expect(onSettle).toHaveBeenCalledTimes(1)
  })

  it('does not double-fire when a real frame has already left the settled latch false', () => {
    const { riffle, settle } = setup()
    const onSettle = vi.fn()
    riffle.next() // starts an animated navigation
    settle(1) // runs one real frame: not yet settled, so wasSettled is now false
    riffle.on('settle', onSettle)
    riffle.goTo(3, { animate: false }) // reaches rest immediately, mid-flight
    expect(onSettle).toHaveBeenCalledTimes(1)
    expect(settle()).toBe(0)
    expect(onSettle).toHaveBeenCalledTimes(1)
  })
})

describe('will-change is set for the duration of a drag and cleared on settle', () => {
  it('is present on the front card mid-drag and absent once settled', () => {
    const { riffle, nodes, settle } = setup()
    preparePointerTarget(container)
    drag(100)
    expect(nodes[0]?.style.willChange).toBe('transform') // precondition: present mid-drag
    firePointer(container, 'pointerup', { clientX: 200, clientY: 200 })
    settle()
    expect(nodes[0]?.style.willChange).toBe('')
    void riffle
  })

  it('marks the card behind on a backward drag too, not just the one ahead', () => {
    // home is 0 at rest; a forward-only guess (home, home + 1) never marks
    // index 4 (home - 1, wrapped), which is the card doing the large
    // exit-slot transform on a drag toward prev.
    const { nodes } = setup()
    preparePointerTarget(container)
    drag(-100)
    expect(nodes[4]?.style.willChange).toBe('transform')
  })
})

it('checks destroyed before writing or notifying in the non-animated branch of setTarget', () => {
  // reducedMotion: 'respect' forces onEnd's call to setTarget through the
  // non-animated branch even though onEnd itself passes its default
  // animate: true.
  const { riffle } = setup(5, { reducedMotion: 'respect' })
  preparePointerTarget(container)
  const calls = vi.fn()
  riffle.subscribe(calls)
  riffle.on('dragend', () => riffle.destroy())

  drag(250) // past threshold
  const beforeRelease = calls.mock.calls.length
  expect(beforeRelease).toBeGreaterThan(0) // precondition: already notified at least once

  expect(() => {
    firePointer(container, 'pointerup', { clientX: 350, clientY: 200 })
  }).not.toThrow()

  // onEnd's own store.notify() (isDragging: false) accounts for exactly one
  // more call. destroy() ran inside the dragend listener; setTarget's
  // non-animated branch must not notify the store again afterward.
  expect(calls.mock.calls.length).toBe(beforeRelease + 1)
})

describe('spring preset names are validated', () => {
  it('rejects an unknown preset at construction', () => {
    expect(() =>
      createRiffle(container, { count: 3, spring: 'bogus' as SpringPreset }),
    ).toThrowError(RiffleError)
    try {
      createRiffle(container, { count: 3, spring: 'bogus' as SpringPreset })
    } catch (error) {
      expect((error as RiffleError).code).toBe('INVALID_OPTION')
    }
  })

  it('rejects an unknown preset in update()', () => {
    const { riffle } = setup()
    expect(() => riffle.update({ spring: 'bogus' as SpringPreset })).toThrowError(RiffleError)
    try {
      riffle.update({ spring: 'bogus' as SpringPreset })
    } catch (error) {
      expect((error as RiffleError).code).toBe('INVALID_OPTION')
    }
  })
})
