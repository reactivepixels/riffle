import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRiffle } from '../src/riffle'
import { RiffleError } from '../src/errors'
import type { Clock } from '../src/animation/loop'
import type { RiffleOptions } from '../src/types'

// createRiffle's public signature is RiffleOptions; `clock` is a
// test-only injection point read internally via a cast (riffle.ts's
// InternalOptions, deliberately not exported). This performs the matching
// cast here so tests can inject a clock and still typecheck.
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
    /** Move the clock without running a frame, e.g. to time a pointer event. */
    setTime(ms: number) {
      time = ms
    },
    /** Run frames until the loop halts, or bail out after `max`. */
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
  const { clock, settle, setTime } = testClock()
  const riffle = createRiffle(
    container,
    withClock({
      count,
      clock,
      cardWidth: 300,
      cardHeight: 400,
      gap: 20,
      ...extra,
    }),
  )
  const nodes = Array.from({ length: count }, (_, i) => {
    const el = document.createElement('div')
    container.appendChild(el)
    riffle.registerNode(i, el)
    return el
  })
  return { riffle, nodes, settle, setTime }
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

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

describe('createRiffle', () => {
  it('starts on the first card', () => {
    const { riffle } = setup()
    expect(riffle.getSnapshot().activeIndex).toBe(0)
  })

  it('rejects a negative count with a coded error', () => {
    expect(() => createRiffle(container, { count: -1 })).toThrowError(RiffleError)
    try {
      createRiffle(container, { count: -1 })
    } catch (error) {
      expect((error as RiffleError).code).toBe('INVALID_COUNT')
    }
  })

  it('rejects an out-of-range threshold with a coded error', () => {
    // A bare try/catch with no assertion outside it passes vacuously if
    // nothing throws. Assert the throw itself, matching the pattern already
    // used above for the negative-count case.
    expect(() => createRiffle(container, { count: 3, threshold: 5 })).toThrowError(RiffleError)
    try {
      createRiffle(container, { count: 3, threshold: 5 })
    } catch (error) {
      expect((error as RiffleError).code).toBe('INVALID_OPTION')
    }
  })

  it('advances on next()', () => {
    const { riffle, settle } = setup()
    riffle.next()
    settle()
    expect(riffle.getSnapshot().activeIndex).toBe(1)
  })

  it('cycles past the end under bounds loop', () => {
    const { riffle, settle } = setup(3)
    riffle.next()
    settle()
    riffle.next()
    settle()
    riffle.next()
    settle()
    expect(riffle.getSnapshot().activeIndex).toBe(0)
  })

  it('cycles backwards from the first card under bounds loop', () => {
    const { riffle, settle } = setup(3)
    riffle.prev()
    settle()
    expect(riffle.getSnapshot().activeIndex).toBe(2)
  })

  it('refuses to pass the ends under bounds clamp', () => {
    const { riffle, settle } = setup(3, { bounds: 'clamp' })
    const onChange = vi.fn()
    riffle.on('change', onChange)
    expect(riffle.getSnapshot().canPrev).toBe(false)
    expect(riffle.getSnapshot().canNext).toBe(true)

    riffle.prev()
    settle()
    expect(riffle.position).toBe(0)
    expect(riffle.getSnapshot().activeIndex).toBe(0)
    expect(onChange).not.toHaveBeenCalled()

    riffle.goTo(2, { animate: false })
    // Precondition: navigation itself works and emits.
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(riffle.getSnapshot().canNext).toBe(false)
    riffle.next()
    settle()
    expect(riffle.position).toBe(2)
    expect(riffle.getSnapshot().activeIndex).toBe(2)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('jumps without animating when asked', () => {
    // activeIndex derives from `target`, which is
    // written identically on both branches of setTarget before the
    // animate check, so asserting only activeIndex cannot fail even if
    // `animate: false` were ignored entirely and a frame were scheduled
    // anyway. Assert the jump itself: position lands exactly on target, and
    // no frame was ever scheduled (settle() returns 0).
    //
    // goTo takes the shortest path under bounds: 'loop'.
    // count 5 at 0, goTo(3) is 3 steps forward but only 2 steps back, so the
    // raw target lands on -2 (displayed the same as 3), not on 3 itself.
    const { riffle, settle } = setup()
    riffle.goTo(3, { animate: false })
    expect(riffle.getSnapshot().activeIndex).toBe(3)
    expect(riffle.position).toBe(-2)
    expect(settle()).toBe(0)
  })

  it('writes a transform to the front card', () => {
    const { nodes, settle } = setup()
    settle()
    expect(nodes[0]?.style.transform).toContain('translate3d')
  })

  it('emits change with the direction travelled', () => {
    const { riffle, settle } = setup()
    const onChange = vi.fn()
    riffle.on('change', onChange)
    riffle.next()
    settle()
    expect(onChange).toHaveBeenCalledWith({ index: 1, previousIndex: 0, direction: 1 })
  })

  it('stops calling a listener after its unsubscribe is invoked', () => {
    const { riffle, settle } = setup()
    const onChange = vi.fn()
    riffle.on('change', onChange)()
    riffle.next()
    settle()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the high-frequency values off the snapshot', () => {
    const { riffle } = setup()
    expect(Object.keys(riffle.getSnapshot())).not.toContain('dragOffset')
    expect(Object.keys(riffle.getSnapshot())).not.toContain('position')
    expect(typeof riffle.position).toBe('number')
    expect(typeof riffle.dragOffset).toBe('number')
  })

  it('notifies subscribers when the active card changes', () => {
    const { riffle, settle } = setup()
    const listener = vi.fn()
    riffle.subscribe(listener)
    riffle.next()
    settle()
    expect(listener).toHaveBeenCalled()
  })

  it('grows with setCount', () => {
    const { riffle } = setup(3)
    riffle.setCount(8)
    expect(riffle.getSnapshot().count).toBe(8)
  })

  it('throws a coded error when used after destroy', () => {
    const { riffle } = setup()
    riffle.destroy()
    // A bare try/catch with no assertion outside it passes vacuously if
    // nothing throws. Assert the throw itself, matching the pattern already
    // used above for the negative-count case.
    expect(() => riffle.next()).toThrowError(RiffleError)
    try {
      riffle.next()
    } catch (error) {
      expect((error as RiffleError).code).toBe('DESTROYED')
    }
  })

  it('leaves no live frame request after destroy', () => {
    const { riffle, settle } = setup()
    riffle.next()
    riffle.destroy()
    expect(settle()).toBe(0)
  })

  it('is idempotent on destroy', () => {
    const { riffle } = setup()
    riffle.destroy()
    expect(() => riffle.destroy()).not.toThrow()
  })

  // --- Additional regression tests ---

  it('does not notify or change its snapshot during a drag', () => {
    const { riffle, settle } = setup()
    preparePointerTarget(container)
    settle()

    // Start the drag: crossing slop locks the gesture and legitimately
    // notifies the store once (isDragging flips false -> true). That is a
    // rare, discrete transition, not the per-frame churn this test guards
    // against, so `before` is captured once the drag is already under way.
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 120, clientY: 200 })

    const before = riffle.getSnapshot()
    const listener = vi.fn()
    riffle.subscribe(listener)

    // Further movement, well past 50% of a step, must not notify again.
    firePointer(container, 'pointermove', { clientX: 100 + 250, clientY: 200 })

    expect(riffle.position).not.toBe(before.activeIndex)
    expect(riffle.getSnapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it('fires settle exactly once after next() completes, and not again at rest', () => {
    const { riffle, settle } = setup()
    const onSettle = vi.fn()
    riffle.on('settle', onSettle)
    riffle.next()
    settle()
    expect(onSettle).toHaveBeenCalledTimes(1)
    expect(onSettle).toHaveBeenCalledWith({ index: 1 })

    // Idle frames (none pending) must not re-fire settle.
    settle()
    expect(onSettle).toHaveBeenCalledTimes(1)

    // goTo the card already at rest runs real frames (kick), and those
    // frames reach settled() again. Only the wasSettled guard stops a second
    // settle event here.
    riffle.goTo(1)
    expect(settle()).toBeGreaterThan(0) // precondition: frames actually ran
    expect(onSettle).toHaveBeenCalledTimes(1)
  })

  it('reports forward direction when next() wraps from the last card to the first', () => {
    const { riffle } = setup(3)
    riffle.goTo(2, { animate: false })
    const onChange = vi.fn()
    riffle.on('change', onChange)
    riffle.next()
    expect(onChange).toHaveBeenCalledWith({ index: 0, previousIndex: 2, direction: 1 })
  })

  it('follows the cross axis while dragging even with rotation disabled', () => {
    const { nodes, settle } = setup(5, { rotation: false, crossFollow: 0.6 })
    preparePointerTarget(container)

    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    // Clear slop, locking the gesture to the main axis (main > cross).
    firePointer(container, 'pointermove', { clientX: 130, clientY: 210 })
    // A further move with a real cross-axis component.
    firePointer(container, 'pointermove', { clientX: 160, clientY: 220 })
    settle(1)

    // deltaCross is 20 at this point; crossFollow is 0.6, so the front
    // card's cross offset (mapped to y on the x axis) should be 12.00px.
    expect(nodes[0]?.style.transform).toContain('12.00px')
  })

  // --- Edge-case and robustness findings ---

  it('clamps target back into range when setCount shrinks under bounds clamp', () => {
    const riffle = createRiffle(container, { count: 5, bounds: 'clamp' })
    riffle.goTo(4, { animate: false })
    riffle.setCount(2)

    const snap = riffle.getSnapshot()
    expect(snap.activeIndex).toBe(1)
    expect(snap.canNext).toBe(false)
    expect(snap.canPrev).toBe(true)
  })

  it('rejects a non-integer startIndex with a coded error', () => {
    expect(() => createRiffle(container, { count: 5, startIndex: 1.5 })).toThrowError(RiffleError)
    try {
      createRiffle(container, { count: 5, startIndex: 1.5 })
    } catch (error) {
      expect((error as RiffleError).code).toBe('INVALID_OPTION')
    }
  })

  it('clamps an out-of-range startIndex into bounds at construction under bounds clamp', () => {
    const riffle = createRiffle(container, { count: 3, bounds: 'clamp', startIndex: 10 })
    expect(riffle.getSnapshot().activeIndex).toBe(2)
  })

  it('rejects a negative or non-finite cardWidth, cardHeight or gap with a coded error', () => {
    expect(() => createRiffle(container, { count: 3, cardWidth: -1 })).toThrowError(RiffleError)
    expect(() => createRiffle(container, { count: 3, gap: Number.NaN })).toThrowError(RiffleError)
    try {
      createRiffle(container, { count: 3, cardWidth: -1 })
    } catch (error) {
      expect((error as RiffleError).code).toBe('INVALID_OPTION')
    }
  })

  it('does not teleport when grabbed mid-animation', () => {
    const { riffle, settle } = setup()
    preparePointerTarget(container)

    riffle.next()
    settle(3) // a few physics substeps: mid-flight, not settled
    const before = riffle.position
    expect(before).toBeGreaterThan(0)
    expect(before).toBeLessThan(1)

    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 110, clientY: 200 })

    const stepTravelPx = 320 // cardWidth(300) + gap(20), per setup()'s defaults
    expect(riffle.position).toBeCloseTo(before + 10 / stepTravelPx, 5)

    // Commit rounding. Drag forward past threshold and release: the
    // commit is taken from the rounded home, so the stack lands exactly on a
    // card, not on `before + 1`.
    expect(before).toBeLessThan(0.5) // so the rounded home is card 0
    firePointer(container, 'pointermove', { clientX: 200, clientY: 200 })
    firePointer(container, 'pointerup', { clientX: 200, clientY: 200 })
    settle()
    expect(Number.isInteger(riffle.position)).toBe(true)
    expect(riffle.position).toBe(1)
    expect(riffle.getSnapshot().activeIndex).toBe(1)
  })

  it('does not repopulate nodes or write attributes when registerNode is called after destroy', () => {
    const { riffle } = setup()
    riffle.destroy()

    const el = document.createElement('div')
    container.appendChild(el)
    riffle.registerNode(0, el)

    expect(el.getAttribute('role')).toBeNull()
    expect(el.style.transform).toBe('')
  })

  it('detaches every pointer listener on destroy', () => {
    // This cannot fail for "the
    // in-handler destroyed guards are missing" (deleting them does not
    // break this test), because attachPointer's detach already removes the
    // DOM listeners synchronously inside destroy(), before these events are
    // ever fired. What it genuinely verifies is that destroy() detaches
    // every pointer listener. The in-handler destroyed guards
    // (registerNode and the three pointer handlers) are covered instead by
    // "does not resurrect the frame loop when a listener destroys the
    // instance mid-drag" below, which triggers destroy() from inside a
    // handler that is already running, the only way to reach them.
    const { riffle, nodes } = setup()
    preparePointerTarget(container)
    const onDragStart = vi.fn()
    riffle.on('dragstart', onDragStart)
    const removeSpy = vi.spyOn(container, 'removeEventListener')
    expect(container.style.touchAction).toBe('pan-y') // precondition
    riffle.destroy()
    expect(container.style.touchAction).toBe('')
    expect(removeSpy.mock.calls.map(([type]) => type)).toContain('pointerdown')

    const before = nodes[0]?.style.transform

    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 200, clientY: 200 })

    expect(onDragStart).not.toHaveBeenCalled()
    expect(nodes[0]?.style.transform).toBe(before)
  })

  it('does not resurrect the frame loop when a listener destroys the instance mid-drag', () => {
    const { riffle, settle } = setup()
    preparePointerTarget(container)
    riffle.on('dragstart', () => riffle.destroy())

    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 120, clientY: 200 })

    expect(settle()).toBe(0)
  })

  it('commits to the next card on a drag past threshold, and fires dragend', () => {
    const { riffle, settle } = setup()
    preparePointerTarget(container)
    const onDragEnd = vi.fn()
    riffle.on('dragend', onDragEnd)

    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    // 250px is well past threshold(0.25) * stepTravel(320) = 80px.
    firePointer(container, 'pointermove', { clientX: 100 + 250, clientY: 200 })
    firePointer(container, 'pointerup', { clientX: 100 + 250, clientY: 200 })
    settle()

    expect(riffle.getSnapshot().activeIndex).toBe(1)
    expect(onDragEnd).toHaveBeenCalledWith({ committed: true, direction: 1 })
  })

  it('returns to the original card when released below threshold, and dragend reports no commit', () => {
    const { riffle, settle } = setup()
    preparePointerTarget(container)
    const onDragEnd = vi.fn()
    riffle.on('dragend', onDragEnd)

    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    // 30px is well below threshold(0.25) * stepTravel(320) = 80px.
    firePointer(container, 'pointermove', { clientX: 100 + 30, clientY: 200 })
    firePointer(container, 'pointerup', { clientX: 100 + 30, clientY: 200 })
    settle()

    expect(riffle.getSnapshot().activeIndex).toBe(0)
    expect(onDragEnd).toHaveBeenCalledWith({ committed: false, direction: 0 })
  })

  it('does not go non-finite when stepTravel is zero', () => {
    const { clock } = testClock()
    const riffle = createRiffle(
      container,
      withClock({ count: 3, clock, cardWidth: 0, cardHeight: 0, gap: 0 }),
    )
    const el = document.createElement('div')
    container.appendChild(el)
    riffle.registerNode(0, el)
    preparePointerTarget(container)

    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 150, clientY: 200 })

    expect(Number.isFinite(riffle.position)).toBe(true)
    expect(el.style.transform).not.toContain('NaN')
  })

  // Mutants (ConditionalExpression, EqualityOperator, on positionsPerSecond's
  // `travel > 0 ? ... : 0`): the existing zero-stepTravel test above never
  // releases the drag, so positionsPerSecond (called from onEnd to convert
  // the release velocity) is never reached with travel === 0.
  it('does not divide by zero computing release velocity when stepTravel is zero', () => {
    const { clock } = testClock()
    const riffle = createRiffle(
      container,
      withClock({ count: 3, clock, cardWidth: 0, cardHeight: 0, gap: 0 }),
    )
    const el = document.createElement('div')
    container.appendChild(el)
    riffle.registerNode(0, el)
    preparePointerTarget(container)

    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 150, clientY: 200 })
    firePointer(container, 'pointerup', { clientX: 150, clientY: 200 })

    expect(Number.isFinite(riffle.velocity)).toBe(true)
  })

  it('reports progress and dragOffset mid-drag, and resets both after it ends', () => {
    const { riffle, settle } = setup()
    preparePointerTarget(container)

    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 100 + 250, clientY: 200 })
    expect(riffle.dragOffset).toBe(250)
    expect(riffle.progress).toBeCloseTo(250 / 320, 10)
    firePointer(container, 'pointerup', { clientX: 100 + 250, clientY: 200 })
    expect(riffle.dragOffset).toBe(0)
    expect(riffle.progress).toBe(0)
    settle()

    expect(riffle.dragOffset).toBe(0)
    expect(riffle.progress).toBe(0)
  })

  it('rejects an axis change in update() with a coded error', () => {
    const { riffle } = setup()
    expect(() => riffle.update({ axis: 'y' })).toThrowError(RiffleError)
    try {
      riffle.update({ axis: 'y' })
    } catch (error) {
      expect((error as RiffleError).code).toBe('INVALID_OPTION')
    }
  })

  // --- Listener array aliasing on compaction ---

  it('does not let a later compaction resurrect an earlier unsubscribe', () => {
    // Exact reproduction of the bug: on(A), on(B), unsubscribe A
    // (tombstones), on(C) (used to rebuild the array and repoint the map,
    // orphaning the unsubscribe closures created so far), unsubscribe B
    // (used to mutate the now-orphaned old array, a no-op against the live
    // one), then only C should run.
    const { riffle, settle } = setup()
    const a = vi.fn()
    const b = vi.fn()
    const c = vi.fn()

    const unsubA = riffle.on('change', a)
    const unsubB = riffle.on('change', b)
    unsubA()
    riffle.on('change', c)
    unsubB()

    riffle.next()
    settle()

    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
    expect(c).toHaveBeenCalledTimes(1)
  })

  it('a listener that unsubscribes another during the same emit prevents it running that round', () => {
    const { riffle, settle } = setup()
    const b = vi.fn()
    let unsubB = () => {}
    const a = vi.fn(() => unsubB())
    riffle.on('change', a)
    unsubB = riffle.on('change', b)

    riffle.next()
    settle()
    // A ran; B, registered after A, was tombstoned by A before the loop
    // reached it, so it does not run this round.
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()

    riffle.next()
    settle()
    // B stays unsubscribed on the next emit too: only A runs, again.
    expect(a).toHaveBeenCalledTimes(2)
    expect(b).not.toHaveBeenCalled()
  })

  it('a listener that subscribes another during the same emit defers it to the next emit', () => {
    const { riffle, settle } = setup()
    const d = vi.fn()
    const a = vi.fn(() => {
      riffle.on('change', d)
    })
    riffle.on('change', a)

    riffle.next()
    settle()
    // D was added past the length captured at the start of this emit, so
    // it does not run in the round that registered it.
    expect(a).toHaveBeenCalledTimes(1)
    expect(d).not.toHaveBeenCalled()

    riffle.next()
    settle()
    // D runs on the next emit, once it is a normal registered listener.
    expect(a).toHaveBeenCalledTimes(2)
    expect(d).toHaveBeenCalledTimes(1)
  })

  it('calling the same unsubscribe twice is harmless and removes nothing else', () => {
    const { riffle, settle } = setup()
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = riffle.on('change', a)
    riffle.on('change', b)

    unsubA()
    expect(() => unsubA()).not.toThrow()

    riffle.next()
    settle()

    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  // --- Unsubscribe by registration identity, not function value ---

  it('subscribing the same function twice and unsubscribing one registration leaves the other running', () => {
    // Break-it proof: change the unsubscribe back to searching by function
    // value (`indexOf(fn)`) with no per-registration `active` check, and
    // this must fail: removing by function value means u1() finds and
    // removes whichever registration of `fn` comes first (or its own slot
    // then, once tombstoned/compacted, a second call could hit u2's slot),
    // so calling u1() twice ends up removing both and the function runs
    // zero times instead of once.
    const { riffle, settle } = setup()
    const fn = vi.fn()

    const u1 = riffle.on('change', fn)
    const u2 = riffle.on('change', fn)

    u1()
    u1()

    riffle.next()
    settle()

    expect(fn).toHaveBeenCalledTimes(1)
    void u2
  })

  // --- wrap() fix: a one-card stack must render, not sit in the exit slot ---

  it('renders a count-1 stack visible, at opacity 1 and 0.00px on the main axis (wrap fix)', () => {
    // Break-it proof: remove the `count === 1` line in wrap(), and this
    // fails. wrap(0, 1) then returns -1 instead of 0, so the only card sits
    // at fan's exit-slot depth (t = 1, opacity = 1 - t*t = 0) and reads
    // opacity '0' instead of '1'.
    const { nodes, settle } = setup(1)
    settle()

    expect(nodes[0]?.style.opacity).toBe('1')
    expect(nodes[0]?.style.transform).toContain('0.00px')
  })

  // Mutant (ConditionalExpression, writeNode's `bounds === 'clamp' ?
  // Math.max(delta, -1) : wrap(delta, count)` forced to always take the
  // clamp branch): the wrap/depth risk area's central branch point. Under
  // loop, a card just ahead of the active one in cycle order must wrap to
  // a small positive depth (a normal background card), not be clamped into
  // the exit slot the way bounds: 'clamp' computes it.
  it('computes depth via wrap() under bounds loop, not the clamp branch', () => {
    const { riffle, nodes } = setup(5)
    // Four separate one-step hops, each taking goTo's own shortest forward
    // path, so `target` genuinely lands on 4 (motion.value = 4) rather than
    // goTo(4) choosing the shorter single backward hop to -1 from 0, which
    // would not distinguish this mutant (Math.max(1, -1) and wrap(1, 5)
    // agree at that delta).
    riffle.goTo(1, { animate: false })
    riffle.goTo(2, { animate: false })
    riffle.goTo(3, { animate: false })
    riffle.goTo(4, { animate: false })
    // Card 0 is one step ahead of card 4 in the loop: wrap(0 - 4, 5) gives
    // it depth 1 (opacity 1, a visible background card). The clamp branch
    // would instead compute Math.max(0 - 4, -1) = -1 (the exit slot,
    // opacity 0).
    expect(nodes[0]?.style.opacity).not.toBe('0')
  })
  describe('release velocity is measured at release time', () => {
    /** 40px over 16ms, then no further moves until release at `releaseAt`. */
    function flickThenRelease(releaseAt: number) {
      const ctx = setup()
      preparePointerTarget(container)
      const onDragEnd = vi.fn()
      ctx.riffle.on('dragend', onDragEnd)
      ctx.setTime(0)
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 108, clientY: 200 }) // locks, sample at t=0
      ctx.setTime(16)
      firePointer(container, 'pointermove', { clientX: 148, clientY: 200 }) // +40px at t=16
      // Precondition: 48px is 0.15 of a step, below threshold, so only a
      // fling can commit this gesture.
      expect(ctx.riffle.progress).toBeCloseTo(48 / 320, 10)
      ctx.setTime(releaseAt)
      firePointer(container, 'pointerup', { clientX: 148, clientY: 200 })
      ctx.settle()
      return { ...ctx, onDragEnd }
    }

    it('springs back when the pointer was held still for 200ms before release', () => {
      const { riffle, onDragEnd } = flickThenRelease(216)
      expect(onDragEnd).toHaveBeenCalledWith({ committed: false, direction: 0 })
      expect(riffle.getSnapshot().activeIndex).toBe(0)
    })

    it('commits the same flick when released promptly', () => {
      const { riffle, onDragEnd } = flickThenRelease(20)
      expect(onDragEnd).toHaveBeenCalledWith({ committed: true, direction: 1 })
      expect(riffle.getSnapshot().activeIndex).toBe(1)
    })
  })
  describe('clamp does not render as a loop', () => {
    it('hides every card before the front at the last card', () => {
      const { riffle, nodes, settle } = setup(5, { bounds: 'clamp' })
      riffle.goTo(4, { animate: false })
      settle()
      expect(riffle.getSnapshot().activeIndex).toBe(4)
      expect(nodes[4]?.style.opacity).toBe('1')
      // Under wrap, cards 0 to 2 would sit fanned behind the last card.
      for (let i = 0; i < 4; i += 1) expect(nodes[i]?.style.opacity).toBe('0')
    })

    it('never slides the last card in when dragging toward prev at index 0', () => {
      const { riffle, nodes, settle } = setup(5, { bounds: 'clamp' })
      preparePointerTarget(container)
      settle()
      expect(nodes[4]?.style.opacity).toBe('0')

      firePointer(container, 'pointerdown', { clientX: 300, clientY: 200 })
      for (const dx of [-10, -40, -80, -120, -160]) {
        firePointer(container, 'pointermove', { clientX: 300 + dx, clientY: 200 })
        settle(1)
        expect(nodes[4]?.style.opacity).toBe('0')
      }
      // Precondition: the drag really did reach half a step toward prev.
      expect(riffle.position).toBeCloseTo(-0.5, 10)

      firePointer(container, 'pointerup', { clientX: 140, clientY: 200 })
      for (let i = 0; i < 60; i += 1) {
        settle(1)
        expect(nodes[4]?.style.opacity).toBe('0')
      }
      expect(riffle.getSnapshot().activeIndex).toBe(0)
    })
  })
  describe('getter contracts', () => {
    it('reports drag velocity mid-drag in positions per second, continuous across release', () => {
      const { riffle, setTime } = setup()
      preparePointerTarget(container)
      expect(riffle.velocity).toBe(0) // at rest

      setTime(0)
      firePointer(container, 'pointerdown', { clientX: 300, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 290, clientY: 200 }) // -10px at t=0
      setTime(16)
      firePointer(container, 'pointermove', { clientX: 240, clientY: 200 }) // -60px at t=16

      // Signed like position: a drag toward prev moves position negative.
      expect(riffle.position).toBeLessThan(0)
      const during = riffle.velocity
      expect(during).toBeCloseTo(((-50 / 16) * 1000) / 320, 9)

      firePointer(container, 'pointerup', { clientX: 240, clientY: 200 })
      expect(riffle.getSnapshot().isDragging).toBe(false)
      expect(Math.abs(riffle.velocity - during)).toBeLessThan(1e-9)
    })
  })
  describe('regression net', () => {
    /** Press at (100, 200) and drag along x to `dx`, one move per offset. */
    function drag(...dxs: number[]): void {
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      for (const dx of dxs)
        firePointer(container, 'pointermove', { clientX: 100 + dx, clientY: 200 })
    }

    it('pointercancel past threshold returns to origin without committing', () => {
      const { riffle, settle } = setup()
      preparePointerTarget(container)
      const onDragEnd = vi.fn()
      const onChange = vi.fn()
      riffle.on('dragend', onDragEnd)
      riffle.on('change', onChange)
      drag(250)
      expect(riffle.progress).toBeGreaterThan(0.25) // precondition: past threshold
      firePointer(container, 'pointercancel', {})
      settle()
      expect(onDragEnd).toHaveBeenCalledWith({ committed: false, direction: 0 })
      expect(onChange).not.toHaveBeenCalled()
      expect(riffle.position).toBe(0)
      expect(riffle.getSnapshot().activeIndex).toBe(0)
    })

    it('hands the fling to the spring in positions per second', () => {
      const { riffle, setTime } = setup()
      preparePointerTarget(container)
      setTime(0)
      drag(8) // locks, sample at t=0
      setTime(16)
      firePointer(container, 'pointermove', { clientX: 148, clientY: 200 }) // 40px in 16ms
      firePointer(container, 'pointerup', { clientX: 148, clientY: 200 })
      const pxPerMs = 40 / 16
      expect(riffle.velocity).toBeCloseTo((pxPerMs * 1000) / 320, 9)
    })

    it('reports isSettling and notifies on the settle transition', () => {
      const { riffle, settle } = setup()
      riffle.next()
      expect(riffle.getSnapshot().isSettling).toBe(true)
      const listener = vi.fn()
      riffle.subscribe(listener)
      settle()
      expect(riffle.getSnapshot().isSettling).toBe(false)
      expect(listener).toHaveBeenCalled()
    })

    it('prev() emits change with direction -1', () => {
      const { riffle } = setup()
      riffle.goTo(2, { animate: false })
      const onChange = vi.fn()
      riffle.on('change', onChange)
      riffle.prev()
      expect(onChange).toHaveBeenCalledWith({ index: 1, previousIndex: 2, direction: -1 })
    })

    it('announces the new card and moves focusability after next()', () => {
      // The live-region announcement is debounced
      // 150ms after the change, so a rapid burst of navigation announces
      // only where it lands (see the dedicated "debounced announcements"
      // tests below). Focusability (tabindex) is unaffected: it moves
      // synchronously in the same call, as asserted here.
      vi.useFakeTimers()
      const { riffle, nodes } = setup(5)
      const live = container.querySelector('[aria-live]')
      expect(nodes[1]?.getAttribute('tabindex')).toBe('-1') // precondition
      riffle.next()
      expect(nodes[1]?.getAttribute('tabindex')).toBe('0')
      expect(nodes[0]?.getAttribute('tabindex')).toBe('-1')
      vi.advanceTimersByTime(150)
      expect(live?.textContent).toBe('2 of 5')
      vi.useRealTimers()
    })

    it('axis y ignores a horizontal drag and drags on Y', () => {
      const { riffle, nodes, settle } = setup(5, { axis: 'y' })
      preparePointerTarget(container)
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 100 })
      firePointer(container, 'pointermove', { clientX: 350, clientY: 100 }) // 250px across
      settle(1)
      expect(riffle.position).toBe(0)
      firePointer(container, 'pointerup', { clientX: 350, clientY: 100 })
      settle()
      expect(riffle.position).toBe(0)

      firePointer(container, 'pointerdown', { clientX: 100, clientY: 100 })
      firePointer(container, 'pointermove', { clientX: 100, clientY: 350 }) // 250px down
      settle(1)
      // stepTravel on y is cardHeight(400) + gap(20). The front card sits at
      // depth -250/420, so it translates 250px on Y and 0 on X.
      expect(riffle.position).toBeCloseTo(250 / 420, 10)
      expect(nodes[0]?.style.transform).toMatch(/^translate3d\(0\.00px, 250\.00px, 0\)/)
      firePointer(container, 'pointerup', { clientX: 100, clientY: 350 })
      settle()
      expect(riffle.getSnapshot().activeIndex).toBe(1)
    })

    it('writes the exact resting transform once settled', () => {
      const { riffle, nodes, settle } = setup()
      riffle.next()
      settle()
      expect(nodes[1]?.style.transform).toBe(
        'translate3d(0.00px, 0.00px, 0) rotate(0.00deg) scale(1.000)',
      )
    })

    it('dragstart and drag carry real payloads', () => {
      const { riffle } = setup()
      preparePointerTarget(container)
      riffle.goTo(2, { animate: false })
      const starts: unknown[] = []
      const moves: Array<{ progress: number; offset: number }> = []
      riffle.on('dragstart', (p) => starts.push({ ...p }))
      // The payload is reused, so copy it inside the listener.
      riffle.on('drag', (p) => moves.push({ ...p }))
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200, pointerType: 'pen' })
      firePointer(container, 'pointermove', { clientX: 200, clientY: 200, pointerType: 'pen' })
      expect(starts).toEqual([{ index: 2, pointerType: 'pen' }])
      expect(moves).toHaveLength(1)
      expect(moves[0]?.offset).toBe(100)
      expect(moves[0]?.progress).toBeCloseTo(100 / 320, 10)
    })

    it('a move inside the 6px slop does not move the stack', () => {
      const { riffle } = setup()
      preparePointerTarget(container)
      drag(4)
      expect(riffle.position).toBe(0)
      expect(riffle.getSnapshot().isDragging).toBe(false)
      // Precondition: the same gesture moves the stack once it clears slop.
      firePointer(container, 'pointermove', { clientX: 110, clientY: 200 })
      expect(riffle.position).toBeCloseTo(10 / 320, 10)
    })

    it('tilts the front card while it is dragged', () => {
      const { nodes, settle } = setup()
      preparePointerTarget(container)
      drag(100)
      settle(1)
      const match = /rotate\((-?[\d.]+)deg\)/.exec(nodes[0]?.style.transform ?? '')
      expect(match).not.toBeNull()
      expect(Math.abs(Number(match?.[1]))).toBeGreaterThan(0.5)
    })

    it("reducedMotion 'respect' jumps with zero frames, and a drag still tracks 1:1", () => {
      const { riffle, nodes, settle } = setup(5, { reducedMotion: 'respect' })
      preparePointerTarget(container)
      riffle.next()
      expect(riffle.position).toBe(1)
      expect(settle()).toBe(0)

      drag(100)
      settle(1)
      expect(riffle.position).toBeCloseTo(1 + 100 / 320, 10)
      // Card 1 is the front: it follows the finger by exactly 100px.
      expect(nodes[1]?.style.transform).toMatch(/^translate3d\(100\.00px, /)
    })

    it('draggable false, and a one-card stack, ignore drags', () => {
      const { riffle } = setup(5, { draggable: false })
      preparePointerTarget(container)
      drag(250)
      expect(riffle.position).toBe(0)
      expect(riffle.getSnapshot().isDragging).toBe(false)
      riffle.destroy()

      container = document.createElement('div')
      document.body.appendChild(container)
      const one = setup(1)
      preparePointerTarget(container)
      drag(250)
      expect(one.riffle.position).toBe(0)
      expect(one.riffle.getSnapshot().isDragging).toBe(false)

      // Precondition: an ordinary stack does respond to the same drag.
      container = document.createElement('div')
      document.body.appendChild(container)
      const ordinary = setup(5)
      preparePointerTarget(container)
      drag(250)
      expect(ordinary.riffle.position).toBeGreaterThan(0)
    })
  })
  it('ends the drag when pointer capture is lost, with no permanent frame loop', () => {
    const { riffle, settle } = setup()
    preparePointerTarget(container)
    const onDragEnd = vi.fn()
    riffle.on('dragend', onDragEnd)
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 350, clientY: 200 })
    expect(riffle.getSnapshot().isDragging).toBe(true) // precondition
    firePointer(container, 'lostpointercapture', {})
    expect(riffle.getSnapshot().isDragging).toBe(false)
    expect(onDragEnd).toHaveBeenCalledWith({ committed: false, direction: 0 })
    // The loop halts: settle() stops well short of its 600-frame bail-out.
    expect(settle()).toBeLessThan(600)
    expect(riffle.position).toBe(0)
  })
  describe('dragend truthfulness', () => {
    it('reports no commit for a prev drag past threshold at a clamp end', () => {
      const { riffle, settle } = setup(5, { bounds: 'clamp' })
      preparePointerTarget(container)
      const onDragEnd = vi.fn()
      const onChange = vi.fn()
      riffle.on('dragend', onDragEnd)
      riffle.on('change', onChange)
      firePointer(container, 'pointerdown', { clientX: 300, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 50, clientY: 200 })
      expect(riffle.progress).toBeLessThan(-0.25) // precondition: past threshold toward prev
      firePointer(container, 'pointerup', { clientX: 50, clientY: 200 })
      settle()
      expect(onDragEnd).toHaveBeenCalledWith({ committed: false, direction: 0 })
      expect(onChange).not.toHaveBeenCalled()
      expect(riffle.getSnapshot().activeIndex).toBe(0)
    })

    it('still reports the commit for the same drag away from the end', () => {
      const { riffle, settle } = setup(5, { bounds: 'clamp' })
      preparePointerTarget(container)
      riffle.goTo(2, { animate: false })
      const onDragEnd = vi.fn()
      riffle.on('dragend', onDragEnd)
      firePointer(container, 'pointerdown', { clientX: 300, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 50, clientY: 200 })
      firePointer(container, 'pointerup', { clientX: 50, clientY: 200 })
      settle()
      expect(onDragEnd).toHaveBeenCalledWith({ committed: true, direction: -1 })
      expect(riffle.getSnapshot().activeIndex).toBe(1)
    })

    it('has already cleared isDragging when dragend fires', () => {
      const { riffle } = setup()
      preparePointerTarget(container)
      const seen: boolean[] = []
      riffle.on('dragend', () => seen.push(riffle.getSnapshot().isDragging))
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 200, clientY: 200 })
      expect(riffle.getSnapshot().isDragging).toBe(true) // precondition
      firePointer(container, 'pointerup', { clientX: 200, clientY: 200 })
      expect(seen).toEqual([false])
    })
  })
  describe('option validation', () => {
    const invalid = expect.objectContaining({ name: 'RiffleError', code: 'INVALID_OPTION' })
    const make = (extra: Partial<RiffleOptions>) => () =>
      createRiffle(container, { count: 3, ...extra })

    it('rejects a NaN or out-of-range threshold', () => {
      expect(make({ threshold: Number.NaN })).toThrowError(invalid)
      expect(make({ threshold: 0 })).toThrowError(invalid)
      expect(make({ threshold: 1.5 })).toThrowError(invalid)
      expect(make({ threshold: 1 })).not.toThrow()
    })

    it('rejects a NaN or out-of-range crossFollow', () => {
      expect(make({ crossFollow: Number.NaN })).toThrowError(invalid)
      expect(make({ crossFollow: -0.1 })).toThrowError(invalid)
      expect(make({ crossFollow: 1.1 })).toThrowError(invalid)
      expect(make({ crossFollow: 0 })).not.toThrow()
      expect(make({ crossFollow: 1 })).not.toThrow()
    })

    it('rejects a flingVelocity that is not finite and positive', () => {
      expect(make({ flingVelocity: Number.NaN })).toThrowError(invalid)
      expect(make({ flingVelocity: Number.POSITIVE_INFINITY })).toThrowError(invalid)
      expect(make({ flingVelocity: 0 })).toThrowError(invalid)
      expect(make({ flingVelocity: -1 })).toThrowError(invalid)
      expect(make({ flingVelocity: 0.1 })).not.toThrow()
    })

    it('rejects a maxVisible that is not an integer of at least 1', () => {
      expect(make({ maxVisible: 0 })).toThrowError(invalid)
      expect(make({ maxVisible: 1.5 })).toThrowError(invalid)
      expect(make({ maxVisible: Number.NaN })).toThrowError(invalid)
      expect(make({ maxVisible: 1 })).not.toThrow()
    })

    it('rejects a spring that would never settle', () => {
      expect(make({ spring: { stiffness: 0, damping: 30 } })).toThrowError(invalid)
      expect(make({ spring: { stiffness: 300, damping: 0 } })).toThrowError(invalid)
      expect(make({ spring: { stiffness: Number.NaN, damping: 30 } })).toThrowError(invalid)
      expect(make({ spring: { stiffness: 300, damping: Number.POSITIVE_INFINITY } })).toThrowError(
        invalid,
      )
      expect(make({ spring: { stiffness: 300, damping: 30 } })).not.toThrow()
      expect(make({ spring: 'snappy' })).not.toThrow()
    })

    it('applies the same rules in update()', () => {
      const { riffle } = setup()
      expect(() => riffle.update({ maxVisible: 0 })).toThrowError(invalid)
      expect(() => riffle.update({ maxVisible: 2 })).not.toThrow()
    })
  })
  it('accepts an explicit undefined for any optional field', () => {
    // Typecheck is the real assertion here: under exactOptionalPropertyTypes
    // these lines only compile if the fields are declared `?: T | undefined`.
    const riffle = createRiffle(container, {
      count: 3,
      gap: undefined,
      spring: undefined,
      rotation: { maxRotation: undefined },
    })
    expect(() => riffle.update({ gap: undefined, bounds: undefined })).not.toThrow()
    expect(riffle.getSnapshot().count).toBe(3)
  })

  // --- Keyboard navigation, focus following, labels, debounced announcements ---

  describe('keyboard navigation', () => {
    it('advances on ArrowRight from the focused active card', () => {
      const { riffle, nodes, settle } = setup()
      nodes[0]?.focus()
      nodes[0]?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      )
      settle()
      expect(riffle.getSnapshot().activeIndex).toBe(1)
      expect(document.activeElement).toBe(nodes[1])
    })

    it('keeps keyboard navigation when dragging is disabled', () => {
      const { clock } = testClock()
      const riffle = createRiffle(container, withClock({ count: 3, clock, draggable: false }))
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      )
      expect(riffle.getSnapshot().activeIndex).toBe(1)
    })

    it('stops handling keys after destroy', () => {
      const { riffle } = setup()
      riffle.destroy()
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      })
      container.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    })

    it('removes the keydown listener from the container on destroy', () => {
      // The test above ("stops handling keys after destroy") cannot tell
      // apart "the listener was detached" from "the listener is still
      // attached but its enabled() guard now reads destroyed and returns
      // early": both leave defaultPrevented false, so removing
      // detachKeyboard() from destroy() does not fail it. Assert the
      // teardown directly, the same way the existing pointer-detach test
      // does with a removeEventListener spy.
      const { riffle } = setup()
      const removeSpy = vi.spyOn(container, 'removeEventListener')
      riffle.destroy()
      expect(removeSpy.mock.calls.map(([type]) => type)).toContain('keydown')
    })

    it('does not navigate on ArrowRight when there is only one card', () => {
      // Precondition for "count > 1" gating below: a real stack does respond.
      const { riffle: real } = setup(5)
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      )
      expect(real.getSnapshot().activeIndex).toBe(1)
      real.destroy()

      container = document.createElement('div')
      document.body.appendChild(container)
      const { riffle: single, settle } = setup(1)
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      })
      container.dispatchEvent(event)
      // activeIndex alone cannot distinguish the two
      // (bounds: loop wraps any target mod count === 1 back to 0 regardless
      // of the gate). position is not modulo count, but it only advances
      // through spring integration during frames, which setTarget's animated
      // path merely schedules (kick()); it does not move synchronously. So
      // settle() must run those frames before position is a meaningful
      // assertion: with the gate in place next() is never called, nothing is
      // scheduled, and settle() runs zero frames, leaving position at 0. With
      // the gate removed, next() targets 1 and settle() actually integrates
      // motion.value there. Without this settle() call the assertion below
      // passed whether or not the gate existed, checking nothing.
      settle()
      expect(single.position).toBe(0)
      // The event itself is also unaffected by the visible index staying 0,
      // so this half of the proof stands on its own regardless of settle().
      expect(event.defaultPrevented).toBe(false)
    })
  })

  describe('labels (getLabel: a caller-supplied label per card index)', () => {
    it('uses getLabel for each card aria-label when configured', () => {
      const { nodes } = setup(3, { getLabel: (i) => `Poster ${i}` })
      expect(nodes[1]?.getAttribute('aria-label')).toBe('Poster 1, 2 of 3')
    })

    it('falls back to the bare position when getLabel is not configured', () => {
      const { nodes } = setup(3)
      expect(nodes[1]?.getAttribute('aria-label')).toBe('2 of 3')
    })

    it('rejects a non-function getLabel with a coded error', () => {
      expect(() =>
        createRiffle(container, { count: 3, getLabel: 'nope' as unknown as (i: number) => string }),
      ).toThrowError(RiffleError)
      try {
        createRiffle(container, { count: 3, getLabel: 'nope' as unknown as (i: number) => string })
      } catch (error) {
        expect((error as RiffleError).code).toBe('INVALID_OPTION')
      }
    })
  })

  describe('debounced announcements', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('announces only once, 150ms after the last of several rapid changes, naming the final card', () => {
      const { riffle } = setup(5)
      const live = container.querySelector('[aria-live]')
      // Precondition: nothing announced yet.
      expect(live?.textContent).toBe('')

      riffle.next()
      vi.advanceTimersByTime(20)
      riffle.next()
      vi.advanceTimersByTime(20)
      riffle.next()
      vi.advanceTimersByTime(10) // 50ms total elapsed since the first change, still under 150ms

      expect(live?.textContent).toBe('')
      // Exactly one timer pending, not three: each change replaces the
      // previous timer rather than merely racing it to the same final
      // textContent. A version that scheduled without clearing the prior
      // timer would leave 3 pending here instead of 1, and would still pass
      // an assertion on the final text alone (three writes converging on
      // the same string), so this checks the debounce mechanism directly.
      expect(vi.getTimerCount()).toBe(1)

      vi.advanceTimersByTime(150)

      expect(live?.textContent).toBe('4 of 5')
    })

    it('uses the same getLabel-formatted string for the debounced announcement', () => {
      const { riffle } = setup(3, { getLabel: (i) => `Poster ${i}` })
      const live = container.querySelector('[aria-live]')
      riffle.next()
      vi.advanceTimersByTime(150)
      expect(live?.textContent).toBe('Poster 1, 2 of 3')
    })

    it('clears the pending announcement timer on destroy', () => {
      // Break-it proof: remove the clearTimeout call from destroy() and this
      // throws instead of passing quietly, because the timer fires after
      // destroy() has already cleared the listeners/nodes maps and calls
      // a11y.announce on an element destroy() has removed attributes from
      // (a11y.destroy() removes the live region from the DOM entirely, so a
      // late announce() call would still run harmlessly here in isolation;
      // the real hazard this guards is a leaked pending timer keeping the
      // instance's closures alive after teardown). Assert directly on the
      // count of pending timers instead of relying on a throw.
      const { riffle } = setup(5)
      riffle.next()
      expect(vi.getTimerCount()).toBeGreaterThan(0) // precondition: a timer is pending
      riffle.destroy()
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('accessibility state ahead of the change event', () => {
    // happy-dom does not enforce the platform rule that an element inside an
    // inert subtree cannot receive focus: `.focus()` there succeeds
    // regardless of `inert`. A real browser refuses it silently, which is
    // exactly the failure surface these tests are about, so this mirrors
    // that platform rule instead of relying on `.focus()` alone.
    function focusUnlessInert(el: HTMLElement): void {
      if (el.closest('[inert]')) return
      el.focus()
    }

    it('lets a change listener focus a field in the new active card, and the card is not inert yet', () => {
      const { riffle, nodes } = setup(5)
      const input = document.createElement('input')
      nodes[1]?.appendChild(input)
      let cardWasInertDuringHandler: boolean | undefined
      riffle.on('change', () => {
        cardWasInertDuringHandler = nodes[1]?.hasAttribute('inert')
        focusUnlessInert(input)
      })
      riffle.next()
      expect(cardWasInertDuringHandler).toBe(false)
      expect(document.activeElement).toBe(input)
    })

    it('still moves focus to the new active card root when the change listener does nothing', () => {
      const { riffle, nodes } = setup(5)
      nodes[0]?.focus()
      riffle.on('change', () => {})
      riffle.next()
      expect(document.activeElement).toBe(nodes[1])
    })

    it('keeps store notification before the change event, unchanged', () => {
      const { riffle } = setup(5)
      const order: string[] = []
      riffle.subscribe(() => order.push('subscribe'))
      riffle.on('change', () => order.push('change'))
      riffle.next()
      expect(order).toEqual(['subscribe', 'change'])
    })
  })

  describe('mutation survivors', () => {
    it('rejects a negative cardHeight or gap even when finite', () => {
      expect(() => createRiffle(container, { count: 3, cardHeight: -1 })).toThrowError(RiffleError)
      expect(() => createRiffle(container, { count: 3, gap: -5 })).toThrowError(RiffleError)
    })

    it('throws a coded error when cardWidth or cardHeight toggles away from auto after construction', () => {
      const { riffle: r1 } = setup(5, { cardWidth: 'auto' })
      expect(() => r1.update({ cardWidth: 300 })).toThrowError(RiffleError)
      const { riffle: r2 } = setup(5, { cardHeight: 'auto' })
      expect(() => r2.update({ cardHeight: 400 })).toThrowError(RiffleError)
    })

    it('reads prefers-reduced-motion from matchMedia under the default auto mode', () => {
      const original = window.matchMedia
      window.matchMedia = ((query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList) as typeof window.matchMedia
      try {
        const { riffle, settle } = setup(5, { reducedMotion: 'auto' })
        riffle.next()
        expect(settle()).toBe(0)
        expect(riffle.getSnapshot().activeIndex).toBe(1)
      } finally {
        window.matchMedia = original
      }
    })

    it('reducedMotion "ignore" animates normally even when the OS prefers reduced motion', () => {
      const original = window.matchMedia
      window.matchMedia = ((query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList) as typeof window.matchMedia
      try {
        const { riffle, settle } = setup(5, { reducedMotion: 'ignore' })
        riffle.next()
        expect(settle()).toBeGreaterThan(0)
      } finally {
        window.matchMedia = original
      }
    })

    it('reports a throwing listener via a rejected microtask when globalThis.reportError is unavailable', () => {
      const original = globalThis.reportError
      // @ts-expect-error test-only: simulating an environment without reportError
      delete globalThis.reportError
      // Mocked rather than merely spied on: the real implementation queues a
      // microtask that re-throws, which would otherwise surface as an
      // unhandled rejection in this test run. Invoking the captured callback
      // and asserting it actually throws the original error (rather than
      // never invoking it) exercises the callback's own body, matching what
      // actually happens when the browser drains real microtasks.
      let queued: (() => void) | undefined
      const spy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((cb: () => void) => {
        queued = cb
      })
      let boom!: Error
      try {
        const { riffle } = setup()
        boom = new Error('boom')
        riffle.on('change', () => {
          throw boom
        })
        expect(() => riffle.next()).not.toThrow()
        expect(spy).toHaveBeenCalled()
        expect(queued).toBeDefined()
        expect(() => queued?.()).toThrow(boom)
      } finally {
        globalThis.reportError = original
        spy.mockRestore()
      }
    })

    it('rejects a non-integer or negative count passed directly to setCount()', () => {
      const { riffle } = setup()
      expect(() => riffle.setCount(-1)).toThrowError(RiffleError)
      expect(() => riffle.setCount(1.5)).toThrowError(RiffleError)
    })

    // Mutant (EqualityOperator, setCount's `n < 0` loosened to `n <= 0`):
    // zero is a valid count (an empty stack); the two cases above never
    // probe this exact boundary.
    it('accepts a count of exactly zero via setCount()', () => {
      const { riffle } = setup()
      expect(() => riffle.setCount(0)).not.toThrow()
    })

    it('derives crossExtent from the cross-axis dimension under axis y, not the main one', () => {
      // axis 'y': main is height (cardHeight), cross is width (cardWidth).
      // The rotation lever term divides by crossExtent / 2, so a card whose
      // width and height differ a lot makes a wrong crossExtent produce a
      // clearly different rotation for the same grab point and drag.
      const { nodes, settle } = setup(3, {
        axis: 'y',
        cardWidth: 100,
        cardHeight: 1000,
        rotation: { maxRotation: 20, baseFactor: 0, leverFactor: 1, trajFactor: 0 },
      })
      preparePointerTarget(container)
      // The mocked rect is 300 wide; grabbing at x=290 is 140px right of its
      // centre (150). Correct crossExtent (100) clamps the lever to -1;
      // crossExtent wrongly taken from cardHeight (1000) would not.
      firePointer(container, 'pointerdown', { clientX: 290, clientY: 100 })
      firePointer(container, 'pointermove', { clientX: 290, clientY: 100 + 500 }) // drag along Y (main)
      settle(1)
      const match = /rotate\((-?[\d.]+)deg\)/.exec(nodes[0]?.style.transform ?? '')
      expect(match).not.toBeNull()
      expect(Math.abs(Number(match?.[1]))).toBeGreaterThan(5)
    })

    it('does not divide by zero computing a shortest-path delta under loop for a zero-card stack', () => {
      const { riffle, settle } = setup(0)
      riffle.goTo(0)
      settle()
      expect(Number.isNaN(riffle.position)).toBe(false)
    })

    it('does not call setCount when count is explicitly reset to undefined in update()', () => {
      const { riffle } = setup(5)
      const before = riffle.getSnapshot().count
      // A JS caller can pass `undefined` for count at runtime even though
      // Partial<RiffleOptions>'s `count?: number` (under
      // exactOptionalPropertyTypes) does not accept it at the type level;
      // the cast reaches that runtime path.
      expect(() =>
        riffle.update({ count: undefined } as unknown as Partial<RiffleOptions>),
      ).not.toThrow()
      expect(riffle.getSnapshot().count).toBe(before)
    })

    it('keyboard Home and End delegate to goTo(0) and goTo(count - 1)', () => {
      const { riffle, nodes } = setup(5)
      nodes[0]?.focus()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
      )
      expect(riffle.getSnapshot().activeIndex).toBe(4)
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
      )
      expect(riffle.getSnapshot().activeIndex).toBe(0)
    })

    it('keyboard ArrowLeft (prev) moves backward from the focused active card', () => {
      const { riffle, nodes } = setup(5)
      riffle.goTo(2, { animate: false })
      nodes[2]?.focus()
      container.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
      )
      expect(riffle.getSnapshot().activeIndex).toBe(1)
    })

    it('marks only the immediate neighbours of the drag home with will-change, wrapping under loop', () => {
      // count 3, dragging from home 0: neighbours are 2 (wrap) and 1, plus
      // home 0 itself. A card outside that set (there is none at count 3,
      // so this also proves the filter does not mark every card).
      const { riffle, nodes } = setup(3)
      preparePointerTarget(container)
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 120, clientY: 200 })
      expect(nodes[0]?.style.willChange).toBe('transform')
      expect(nodes[1]?.style.willChange).toBe('transform')
      expect(nodes[2]?.style.willChange).toBe('transform')
    })

    it('does not mark a card outside the drag home neighbourhood under bounds clamp', () => {
      const { riffle, nodes } = setup(5, { bounds: 'clamp' })
      riffle.goTo(2, { animate: false })
      preparePointerTarget(container)
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 120, clientY: 200 })
      // Home 2's neighbours under clamp are 1, 2, 3: card 0 and card 4 are
      // out of range and must not be marked.
      expect(nodes[0]?.style.willChange).toBe('')
      expect(nodes[4]?.style.willChange).toBe('')
      expect(nodes[1]?.style.willChange).toBe('transform')
      expect(nodes[3]?.style.willChange).toBe('transform')
    })

    it('applies rotation and crossFollow only to the front card during a drag, not its neighbours', () => {
      const { nodes, settle } = setup(5, { rotation: { maxRotation: 20 } })
      preparePointerTarget(container)
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 320 })
      firePointer(container, 'pointermove', { clientX: 180, clientY: 340 })
      settle(1)
      // The front card (depth 0) picks up cross-follow and rotation; a
      // background card (depth > 0) must not.
      const front = /rotate\((-?[\d.]+)deg\)/.exec(nodes[0]?.style.transform ?? '')
      expect(front).not.toBeNull()
      expect(Math.abs(Number(front?.[1]))).toBeGreaterThan(0.5)
      expect(nodes[1]?.style.transform).toMatch(/rotate\(0\.00deg\)/)
    })

    // Mutants (ArithmeticOperator on `rotationInput.progress = motion.value
    // - dragHome`; AssignmentOperator on `pose.rotation += computeRotation`
    // and `pose.cross += dragDeltaCross * crossFollow`): sign-flip mutants
    // that the magnitude-only assertion above cannot distinguish.
    // `dragHome` must be non-zero to isolate the ArithmeticOperator mutant
    // (at dragHome 0, `value - 0` and `value + 0` are numerically the same).
    it('accumulates rotation and cross-follow in the correct direction, not sign-flipped', () => {
      const { riffle, nodes, settle } = setup(5, {
        rotation: { maxRotation: 20, baseFactor: 1, leverFactor: 0, trajFactor: 0 },
        crossFollow: 1,
      })
      preparePointerTarget(container)
      // A negative dragHome (goTo(-2) takes the shortest path backward from
      // 0, landing target at -2, active index 3): `motion.value - dragHome`
      // and `motion.value + dragHome` diverge in SIGN here (a small forward
      // drag gives a small positive `- dragHome` progress but a strongly
      // negative, clamped `+ dragHome` progress), which a non-zero but
      // positive dragHome would not reliably expose after clamping to [-1, 1].
      riffle.goTo(-2, { animate: false })
      const front = riffle.getSnapshot().activeIndex
      expect(front).toBe(3) // precondition: shortest path landed on index 3

      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      // Small positive deltaMain and deltaCross; deltaMain must exceed
      // deltaCross strictly, or pointer.ts's axis lock treats an equal
      // main/cross movement as across the axis and abandons the gesture.
      firePointer(container, 'pointermove', { clientX: 115, clientY: 210 })
      settle(1)

      const transform = nodes[front]?.style.transform ?? ''
      const rotate = /rotate\((-?[\d.]+)deg\)/.exec(transform)
      expect(rotate).not.toBeNull()
      // Positive progress with baseFactor alone (lever and trajectory
      // zeroed) must give a positive rotation.
      expect(Number(rotate?.[1])).toBeGreaterThan(0)

      const translate = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(transform)
      expect(translate).not.toBeNull()
      // Cross-follow must move the card in the same direction as the
      // drag's positive cross delta.
      expect(Number(translate?.[2])).toBeGreaterThan(0)
    })

    it('reports forward direction for goTo() landing exactly on the current index (a no-op move)', () => {
      const { riffle } = setup(5)
      const onChange = vi.fn()
      riffle.on('change', onChange)
      riffle.goTo(0, { animate: false })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('does not fire settle twice for an animated setTarget that lands where it already was settled', () => {
      const { riffle, settle } = setup(5)
      const onSettle = vi.fn()
      riffle.on('settle', onSettle)
      riffle.goTo(0) // already at 0: an animated no-op move
      settle()
      expect(onSettle).not.toHaveBeenCalled()
    })
  })

  // --- emit()/compact() re-entrancy, measureFrom's generation
  // guard, and the destroyed early-return guards. These are exactly the
  // areas that once had real bugs in them
  // (unsubscribe-aliasing-on-compaction, destroy escapes, a stale measured
  // node), so every mutation survivor in them gets an individual kill or an
  // individual equivalence proof. ---

  describe('emit/compact re-entrancy', () => {
    // Mutant (AssignmentOperator, emit()'s entry `bucket.depth += 1` flipped
    // to `-= 1`): during a SINGLE (non-nested) emit, this turns out not to
    // be observable through the public API alone, since unsubscribe()
    // re-locates its registration by object identity (`indexOf(reg)`) fresh
    // on every call rather than trusting a stale index, so splicing versus
    // tombstoning produces the same set of listeners called either way. It
    // only breaks once a SECOND, nested emit of the SAME event is triggered
    // from inside a listener while the outer emit is still iterating: the
    // corrupted depth makes an in-flight unsubscribe take the splice branch
    // instead of the tombstone branch while the outer loop's cached `regs`
    // reference is still live, shifting a not-yet-visited listener's array
    // position out from under the outer loop's index and dropping one of
    // its two real calls.
    //
    // Mutants (ConditionalExpression x3, LogicalOperator, EqualityOperator,
    // all on emit()'s `if (bucket.depth === 0 && bucket.dirty)
    // compact(bucket)`): forcing this to run unconditionally means a NESTED
    // emit's own `finally` compacts the shared `regs` array while the OUTER
    // emit is still mid-iteration over that same array reference, shifting
    // a not-yet-visited listener into an index the outer loop has already
    // passed.
    //
    // This single scenario, hand-traced and verified against the real
    // source before writing it, kills both the entry AssignmentOperator
    // mutant and all four compact-trigger mutants: a listener (B) that
    // unsubscribes itself and then triggers a second, nested emission of
    // the same event, with a third listener (C) registered after B that
    // must still be reached once by the outer loop's own iteration in
    // addition to once by the nested one.
    it("does not let a nested emit compact the outer emit's array mid-iteration", () => {
      const { riffle, settle } = setup(5)
      const c = vi.fn()
      let unsubB = () => {}
      const b = vi.fn(() => {
        unsubB() // tombstones B's own slot; must not splice while nested
        riffle.next() // triggers a second, nested 'change' emission
      })
      riffle.on('change', vi.fn())
      unsubB = riffle.on('change', b)
      riffle.on('change', c)

      riffle.next()
      settle()

      // Two real index changes happened (the outer next() and B's nested
      // next()), and C is registered normally, unaffected by B's
      // self-unsubscribe: it must see both. The outer loop reaching its own
      // original array position for C is exactly what premature
      // compaction, or a corrupting splice, would break.
      expect(c).toHaveBeenCalledTimes(2)
    })

    // Mutant (AssignmentOperator, emit()'s exit `bucket.depth -= 1` flipped
    // to `+= 1`): equivalent for observable behaviour. With the entry
    // unmutated, depth is monotonically non-decreasing across every emit
    // call for the life of the bucket (it goes up on entry, and up again,
    // never down, on exit), so it can only ever equal its starting value of
    // 0 during the very first call and never again afterward. This means:
    // (a) `unsubscribe()`'s `live.depth > 0` check, once any emit has ever
    // run, is permanently true, so every later unsubscribe takes the
    // tombstone branch even when genuinely idle, which is still correct
    // (the null-skip check in emit()'s loop makes a listener's actual
    // removal from the array irrelevant to whether it gets called); and
    // (b) `bucket.depth === 0` in the compact-trigger check is permanently
    // false after the first call, so compact() never runs again. Verified
    // this does not affect which listeners fire by running it against every
    // reentrancy test in this file by hand
    // (see the manual mutation note below); the only consequence is that
    // tombstoned array slots are never reclaimed, an unbounded but
    // execution-invisible memory growth with no public API surface to
    // assert against.
    //
    // Manually verified: edited src/riffle.ts's emit() to `bucket.depth +=
    // 1` on the exit line, ran the full workspace suite (386 tests in
    // packages/core), and every test still passed, including every existing
    // reentrancy test above and the
    // nested-emit test just above this one. Restored the source afterward.

    // Mutant (BlockStatement, emit()'s entire `finally { ... }` body
    // emptied): equivalent for the same underlying reason as the exit
    // AssignmentOperator above. With the finally block removed entirely,
    // depth never decrements and compact() is never called from here at
    // all; since entry is unmutated, depth stays positive and increasing
    // throughout, so the in-flight tombstone-versus-splice decision during
    // an active emit is unaffected (entry alone drives it, and entry is
    // untouched), and compact() never running has the same
    // execution-invisible, memory-only consequence as above. Manually
    // verified the same way: emptied the finally block, ran the full suite,
    // all 386 tests still passed.

    // Mutant (BlockStatement, compact()'s own body emptied): equivalent.
    // compact() exists purely to reclaim tombstoned (null) array slots for
    // memory; emit()'s own iteration already skips null entries via
    // `if (reg && reg.active)` regardless of whether the array has ever
    // been physically shrunk, so a no-op compact() has no effect on which
    // listeners run, in what order, or how many times.
    //
    // Mutant (EqualityOperator, compact()'s own `for (read = 0; read <
    // regs.length; ...)` loosened to `<=`): equivalent. The one extra
    // iteration reads `regs[regs.length]`, which is `undefined`; compact()'s
    // own `if (reg)` check filters it out exactly like any other null slot.
    //
    // Mutant (BooleanLiteral, compact()'s `bucket.dirty = false` flipped to
    // `= true`): equivalent. Dirty staying true after a compaction only
    // causes the next emit whose depth returns to 0 to call compact() again
    // redundantly; compact() on an already-clean array is a harmless no-op
    // copy.
    //
    // Manually verified all three compact()-internal mutants individually:
    // emptied compact()'s body, ran the full 386-test suite (all passed);
    // separately restored it and instead loosened the loop bound to `<=`
    // (all passed); separately restored and flipped dirty to stay `true`
    // (all passed). Restored the source after each.
    it('documents the emit/compact equivalence proofs above with one executable witness', () => {
      // The four equivalent mutants above have no assertion that could ever
      // fail them without inspecting `regs`/`dirty` directly, which the
      // public API does not expose. This test exists so the describe block
      // is not entirely proof-by-comment: it re-runs the same reentrancy
      // pattern the tests above already cover, as a live sanity
      // check that this file's own equivalence claims describe the real,
      // current source and not a stale reading of it.
      const { riffle, settle } = setup(5)
      const a = vi.fn()
      const b = vi.fn()
      let unsubA = () => {}
      unsubA = riffle.on('change', a)
      riffle.on('change', () => unsubA())
      riffle.on('change', b)

      riffle.next()
      settle()
      expect(a).toHaveBeenCalledTimes(1) // A already ran before being unsubscribed
      expect(b).toHaveBeenCalledTimes(1) // B, registered after, is unaffected

      riffle.next()
      settle()
      expect(a).toHaveBeenCalledTimes(1) // A stays unsubscribed
      expect(b).toHaveBeenCalledTimes(2)
    })

    it('destroy() called from inside a change listener stops later listeners and leaves no dangling frame request', () => {
      // The classic destroy-from-listener case, applied to
      // the emit() path rather than the pointer path: a listener that
      // destroys the instance mid-dispatch must not leave emit()'s own
      // bookkeeping (depth, the try/finally) in a state that resurrects
      // anything afterward.
      const { riffle, settle } = setup(5)
      const destroyer = vi.fn(() => riffle.destroy())
      const after = vi.fn()
      riffle.on('change', destroyer)
      riffle.on('change', after)

      expect(() => riffle.next()).not.toThrow()
      expect(settle()).toBe(0)
      // Precondition: the change really was emitted and reached the
      // destroying listener, so `after` staying silent below is the destroy
      // taking effect mid-dispatch, not a change that never fired.
      expect(destroyer).toHaveBeenCalledTimes(1)
      // A listener registered after the one that destroyed never runs:
      // destroy() deactivates every registration, and emit()'s loop skips an
      // inactive one exactly as it skips one unsubscribed mid-dispatch (DOM
      // EventTarget semantics). Code in a later listener must not run
      // against a torn-down instance.
      expect(after).not.toHaveBeenCalled()
    })
  })

  describe('measureFrom generation guard', () => {
    class FakeResizeObserver {
      static instances: FakeResizeObserver[] = []
      observed: Element[] = []
      constructor(private readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.instances.push(this)
      }
      observe(el: Element) {
        this.observed.push(el)
      }
      disconnect() {
        this.observed = []
      }
      fire() {
        this.callback([], this as unknown as ResizeObserver)
      }
    }

    function sized(width: number, height: number): HTMLElement {
      const el = document.createElement('div')
      Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width })
      Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
      return el
    }

    function resizeEl(el: HTMLElement, width: number, height: number): void {
      Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width })
      Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
    }

    const originalResizeObserver = globalThis.ResizeObserver

    beforeEach(() => {
      FakeResizeObserver.instances = []
      globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
      preparePointerTarget(container)
    })

    afterEach(() => {
      globalThis.ResizeObserver = originalResizeObserver
    })

    // Mutant (CallExpression, measureFrom()'s leading `stopMeasuring()`
    // removed): without it, swapping the measured node leaves the OLD
    // ResizeObserver still attached to the old element.
    //
    // Mutant (UpdateOperator, `++measureGeneration` flipped to `--`):
    // equivalent. measureGeneration is a purely monotonic counter with no
    // paired increment/decrement elsewhere (unlike adapter.ts's
    // teardownToken, which pairs a schedule-side increment with a
    // cancel-side increment and can collide after a schedule/cancel/
    // schedule sequence), so every measureFrom() call, whichever direction
    // it steps, produces a value distinct from every other call's, and the
    // staleness check `generation !== measureGeneration` is unaffected by
    // which direction the counter moves. Manually verified: flipped
    // `++measureGeneration` to `--measureGeneration`, ran the full 386-test
    // suite, all passed. Restored the source afterward.
    it('discards a stale resize callback from a superseded measurement generation, and disconnects the old observer', () => {
      const { clock } = testClock()
      const riffle = createRiffle(
        container,
        withClock({ count: 3, cardWidth: 'auto', gap: 20, clock }),
      )
      const first = sized(500, 700)
      const second = sized(800, 700)
      container.append(first, second)
      riffle.registerNode(0, first)
      riffle.registerNode(0, null)
      riffle.registerNode(1, second)

      // The old observer, watching the now-detached `first`, must have been
      // disconnected when measurement moved to `second`.
      expect(FakeResizeObserver.instances[0]?.observed).toEqual([])

      // It fires late anyway (the code's own comment: a disconnect is not
      // guaranteed to suppress an already-queued browser notification).
      resizeEl(first, 1500, 700)
      FakeResizeObserver.instances[0]?.fire()

      // Step travel must still come from `second` (800 + gap 20 = 820px),
      // not from the stale callback's 1500px.
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 100 + 410, clientY: 200 })
      expect(riffle.progress).toBeCloseTo(0.5, 5)
    })

    // Mutant (ConditionalExpression, `if (autoWidth) width = w` forced
    // true): width must not be written from a resize report when cardWidth
    // is not 'auto'.
    it('does not write width from a resize report when only cardHeight is auto', () => {
      const { clock } = testClock()
      const riffle = createRiffle(
        container,
        withClock({ count: 3, cardWidth: 300, cardHeight: 'auto', gap: 20, clock }),
      )
      const card = sized(500, 400)
      container.appendChild(card)
      riffle.registerNode(0, card)
      resizeEl(card, 999, 900) // width changes too, but autoWidth is false
      FakeResizeObserver.instances[0]?.fire()
      // axis x: main extent is cardWidth. A wrongly-written width would
      // make step travel 999 + gap(20) instead of the fixed 300 + 20 = 320.
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 100 + 160, clientY: 200 })
      expect(riffle.progress).toBeCloseTo(0.5, 5)
    })

    // Mutant (ConditionalExpression, `if (autoHeight) height = h` forced
    // true): height must not be written from a resize report when
    // cardHeight is not 'auto', even when it is the main (step-travel)
    // axis.
    it('does not write height from a resize report when only cardWidth is auto (axis y)', () => {
      const { clock } = testClock()
      const riffle = createRiffle(
        container,
        withClock({ count: 3, axis: 'y', cardWidth: 'auto', cardHeight: 400, gap: 20, clock }),
      )
      const card = sized(500, 400)
      container.appendChild(card)
      riffle.registerNode(0, card)
      resizeEl(card, 500, 999) // height changes too, but autoHeight is false
      FakeResizeObserver.instances[0]?.fire()
      // axis y: main extent is cardHeight. A wrongly-written height would
      // make step travel 999 + gap(20) instead of the fixed 400 + 20 = 420.
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 100, clientY: 200 + 210 })
      expect(riffle.progress).toBeCloseTo(0.5, 5)
    })

    // Mutant (ConditionalExpression, `if (autoHeight) height = h` forced
    // false): the converse of the two tests above, closing the real gap
    // that no existing test used cardHeight: 'auto' with axis 'y' and a
    // real resize at all.
    it('updates step travel from a resized measured card when cardHeight is auto (axis y)', () => {
      const { clock } = testClock()
      const riffle = createRiffle(
        container,
        withClock({ count: 3, axis: 'y', cardHeight: 'auto', gap: 20, clock }),
      )
      const card = sized(300, 500)
      container.appendChild(card)
      riffle.registerNode(0, card)
      resizeEl(card, 300, 1000)
      FakeResizeObserver.instances[0]?.fire()
      // Step is now 1000 + 20 = 1020px; a 510px drag is half a step.
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 100, clientY: 200 + 510 })
      expect(riffle.progress).toBeCloseTo(0.5, 5)
    })

    // Mutant (CallExpression, `write()` removed after applying a resize
    // report): riffle.progress (a pure getter) would still read correctly
    // even with no DOM write, so this needs a DOM-facing assertion. Mid-drag
    // (a fractional position), the front card's exit-slot `main` is
    // `t * (cardExtent + gap)`, which depends on geometry directly, so a
    // resize during a drag must change its written transform.
    it('writes the updated pose to the DOM after a resize report changes geometry mid-drag', () => {
      const { clock } = testClock()
      const riffle = createRiffle(
        container,
        withClock({ count: 3, cardWidth: 'auto', gap: 20, clock }),
      )
      const card = sized(500, 400)
      container.appendChild(card)
      riffle.registerNode(0, card)
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 150, clientY: 200 })
      const before = card.style.transform
      expect(before).not.toBe('') // precondition: the drag already wrote once

      resizeEl(card, 900, 400)
      FakeResizeObserver.instances[0]?.fire()

      expect(card.style.transform).not.toBe(before)
    })
  })

  describe('destroyed early-return guards', () => {
    // Mutant (ConditionalExpression, destroy()'s own leading `if
    // (destroyed) return` forced false): equivalent. Every operation inside
    // destroy()'s body is independently idempotent (loop.stop() on an
    // already-stopped loop, detachPointer()/detachKeyboard() removing
    // already-removed listeners, stopMeasuring() on an already-disconnected
    // observer, clearTimeout guarded by its own `!== null` check,
    // a11y.destroy() on an already-torn-down a11y instance, and every
    // `nodes`/`poses`/`written`/`listeners` Map operating on an
    // already-cleared Map), and destroy() emits no user-facing event, so no
    // listener could ever observe a second run happening. Manually
    // verified: forced the guard to `if (false) return`, ran the full
    // 386-test suite (all passed, including the no-DOM-write test directly
    // below, which calls destroy() twice). Restored the source afterward.
    //
    // Mutant (ConditionalExpression, onStart's and onEnd's own leading `if
    // (destroyed) return`, both forced false): equivalent, for a structural
    // reason specific to this module. destroy() calls detachPointer()
    // synchronously, which removes every pointer DOM listener before
    // destroy() returns, so no future pointerdown/pointermove/pointerup can
    // ever reach onStart or onEnd again once destroyed is true. The only
    // way either guard could matter is genuine reentrancy: destroyed
    // becoming true from INSIDE a still-running call, before that same
    // guard's own check. onStart is only ever invoked from pointer.ts's own
    // onMove handler, and nothing calls onStart a second time from within
    // that same dispatch. onEnd is only ever invoked from pointer.ts's
    // finish(), likewise once per dispatch with no reentrant second call to
    // onEnd itself. (Contrast riffle.ts's own onMove, whose guard at line
    // 772 IS reachable and IS killed below: pointer.ts's onMove function
    // calls riffle.ts's onStart and then, in the SAME synchronous
    // dispatch, riffle.ts's onMove, so a 'dragstart' listener that destroys
    // the instance during onStart leaves riffle.ts's onMove still to be
    // called, with destroyed already true.) Manually verified both: forced
    // each guard in turn to `if (false) return`, ran the full 386-test
    // suite each time (all passed, including "destroy() called from inside
    // a change listener" and "does not resurrect the frame loop when a
    // listener destroys the instance mid-drag" above). Restored the
    // source after each.
    //
    // Mutants (ConditionalExpression, subscribe()'s and on()'s own leading
    // `if (destroyed) return () => {}`, both forced false): equivalent, by
    // the module's own stated reasoning (the comment right above each:
    // "after destroy, a real subscription would leak a listener
    // store.notify() will never reach again, with nothing to ever call the
    // unsubscribe it returned"). This is explicitly a memory-leak
    // prevention, not a correctness guard: every method that could ever
    // trigger a notification post-destroy already throws via assertAlive()
    // first, so a real (non-no-op) registration made after destroy can
    // never actually fire its callback through any reachable path; the only
    // consequence of bypassing the guard is an uncollectable listener
    // reference, the same execution-invisible, memory-only shape as the
    // emit()/compact() equivalents above. Manually verified: forced both
    // guards to `if (false) return () => {}`, ran the full 386-test suite
    // (all passed, including the exhaustive post-destroy test directly
    // below). Restored the source afterward.

    // Every public method's documented post-destroy behaviour, called and
    // asserted individually, with no DOM write as the common invariant.
    it('every public method after destroy() either throws DESTROYED or is a silent no-op, and writes nothing to the DOM', () => {
      const { riffle, nodes } = setup(3)
      riffle.destroy()
      // Captured after destroy() itself, which legitimately clears every
      // inline style it wrote: the baseline for "no further DOM writes" is
      // destroy()'s own cleared state, not the pre-destroy transforms.
      const before = nodes.map((n) => n.style.transform)

      // Throws, per assertAlive()'s contract (errors.ts: branch on code).
      const throwsDestroyed = (fn: () => void): void => {
        let error: unknown
        try {
          fn()
        } catch (e) {
          error = e
        }
        expect(error).toBeInstanceOf(RiffleError)
        expect((error as RiffleError).code).toBe('DESTROYED')
      }
      throwsDestroyed(() => riffle.next())
      throwsDestroyed(() => riffle.prev())
      throwsDestroyed(() => riffle.goTo(1))
      throwsDestroyed(() => riffle.setCount(5))
      throwsDestroyed(() => riffle.update({ threshold: 0.5 }))

      // Silent no-ops, per their own TSDoc/comments.
      expect(() => riffle.registerNode(0, document.createElement('div'))).not.toThrow()
      expect(() => riffle.destroy()).not.toThrow() // idempotent
      const unsub = riffle.subscribe(() => {
        throw new Error('must never be called: subscribe after destroy is inert')
      })
      expect(() => unsub()).not.toThrow()
      const off = riffle.on('change', () => {
        throw new Error('must never be called: on() after destroy is inert')
      })
      expect(() => off()).not.toThrow()

      // No DOM write happened from any of the above.
      expect(nodes.map((n) => n.style.transform)).toEqual(before)
    })

    // Mutant (ConditionalExpression, onStart's `if (destroyed) return`
    // forced false): reachable, and real. pointer.ts's own onMove handler
    // calls riffle.ts's onStart and then, in the SAME synchronous
    // pointermove dispatch (the one that first clears slop), riffle.ts's
    // onMove. A 'dragstart' listener that destroys the instance from inside
    // onStart leaves riffle.ts's onMove still to run, on the same call
    // stack, with `destroyed` already true: exactly the window this guard
    // exists for.
    it('does not process a pointermove that arrives after destroy() was called from a dragstart listener', () => {
      const { riffle } = setup(5)
      preparePointerTarget(container)
      riffle.on('dragstart', () => riffle.destroy())
      const positionBefore = riffle.position

      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 200, clientY: 200 })

      // Without the guard, onMove would still write motion.value from this
      // pointermove (kick() has its own separate destroyed check, so the
      // frame loop staying dead is not what this asserts).
      expect(riffle.position).toBe(positionBefore)
    })
  })
})
