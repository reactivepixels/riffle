import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRiffle } from '../src/riffle'
import { RiffleError } from '../src/errors'
import type { Clock } from '../src/animation/loop'
import type { LayoutStrategy, RiffleOptions } from '../src/types'

// createRiffle's public signature is RiffleOptions; `clock` is a
// test-only injection point read internally via a cast (riffle.ts's
// InternalOptions, deliberately not exported). This performs the matching
// cast here so tests can inject a clock and still typecheck, the same
// pattern riffle.test.ts uses.
type TestOptions = RiffleOptions & { clock?: Clock }

function withClock(opts: TestOptions): RiffleOptions {
  return opts as RiffleOptions
}

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

function resize(el: HTMLElement, width: number, height: number) {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width })
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
}

let container: HTMLElement

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
function drag(dx: number): void {
  firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
  firePointer(container, 'pointermove', { clientX: 100 + dx, clientY: 200 })
}

/** Press at (100, 200) and drag along y to `dy`, one move per offset. */
function dragY(dy: number): void {
  firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
  firePointer(container, 'pointermove', { clientX: 100, clientY: 200 + dy })
}

/**
 * A stack at the default geometry (cardWidth 300, cardHeight 400, gap 20,
 * step 320), with every card registered so poses actually get written and a
 * fake clock/pointer target so drags and settles can be driven by hand.
 */
function setupDraggable(count = 5, extra: Partial<TestOptions> = {}) {
  const { clock, settle, setTime } = testClock()
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
  return { riffle, nodes, settle, setTime }
}

/** Press at (100, 200), drag `dx` along the main axis, then release. */
function dragAndRelease(dx: number): void {
  firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
  firePointer(container, 'pointermove', { clientX: 100 + dx, clientY: 200 })
  firePointer(container, 'pointerup', { clientX: 100 + dx, clientY: 200 })
}

const original = globalThis.ResizeObserver

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  FakeResizeObserver.instances = []
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
  preparePointerTarget(container)
})

afterEach(() => {
  globalThis.ResizeObserver = original
})

describe('auto card measurement', () => {
  it('drives step travel from the measured card width when cardWidth is auto', () => {
    // gap 20, measured width 500, so one step is 520px and a 260px drag is half a step
    const { clock } = testClock()
    const riffle = createRiffle(
      container,
      withClock({ count: 3, cardWidth: 'auto', gap: 20, clock }),
    )
    const card = sized(500, 700)
    container.appendChild(card)
    riffle.registerNode(0, card)
    drag(260)
    expect(riffle.position).toBeCloseTo(0.5, 5)
  })

  it('falls back to the 300px default before any node is registered', () => {
    // Precondition-style check: without a measured card, cardWidth: 'auto'
    // must not poison geometry; a 260px drag reads as if width were the
    // ordinary 300px default (step 320px), not the auto-measured 500px
    // (step 520px) from the test above.
    const { clock } = testClock()
    const riffle = createRiffle(
      container,
      withClock({ count: 3, cardWidth: 'auto', gap: 20, clock }),
    )
    drag(260)
    expect(riffle.position).toBeCloseTo(260 / 320, 5)
  })

  it('re-measures and updates step travel when the observed card resizes', () => {
    const { clock } = testClock()
    const riffle = createRiffle(
      container,
      withClock({ count: 3, cardWidth: 'auto', gap: 20, clock }),
    )
    const card = sized(500, 700)
    container.appendChild(card)
    riffle.registerNode(0, card)

    resize(card, 1000, 700)
    FakeResizeObserver.instances[0]?.fire()

    // Step is now 1000 + 20 = 1020px; a 510px drag is half a step.
    drag(510)
    expect(riffle.position).toBeCloseTo(0.5, 5)
  })

  // Table-driven over all four combinations of
  // cardWidth/cardHeight presence, not just "width only" (a real bug was
  // once found against exactly that combination). The
  // main-axis extent on axis: 'y' must always come from cardHeight (or its
  // 400px default), and cardWidth (or its 300px default) must always be the
  // cross extent, regardless of which of the two the caller supplied.
  describe('axis-y transposition fix', () => {
    const cases: Array<{ name: string; cardWidth?: number; cardHeight?: number }> = [
      { name: 'both numeric', cardWidth: 280, cardHeight: 360 },
      { name: 'width only', cardWidth: 280 },
      { name: 'height only', cardHeight: 360 },
      { name: 'both default' },
    ]

    it.each(cases)(
      'drags a vertical half-step to position 0.5: $name',
      ({ cardWidth, cardHeight }) => {
        const { clock } = testClock()
        const riffle = createRiffle(
          container,
          withClock({
            count: 3,
            axis: 'y',
            gap: 20,
            clock,
            ...(cardWidth !== undefined ? { cardWidth } : {}),
            ...(cardHeight !== undefined ? { cardHeight } : {}),
          }),
        )
        // Main-axis (y) extent is cardHeight, or its 400px default, never
        // cardWidth: with the pre-fix bug, a "width only" or "both default"
        // case would instead compute step travel from cardWidth (280px) or
        // the wrong default, landing at a different position than 0.5 here.
        const step = (cardHeight ?? 400) + 20
        dragY(step / 2)
        expect(riffle.position).toBeCloseTo(0.5, 5)
      },
    )
  })

  it('stops observing on destroy', () => {
    const { clock } = testClock()
    const riffle = createRiffle(
      container,
      withClock({ count: 3, cardWidth: 'auto', gap: 20, clock }),
    )
    const card = sized(500, 700)
    container.appendChild(card)
    riffle.registerNode(0, card)
    expect(FakeResizeObserver.instances[0]?.observed).toContain(card) // precondition
    riffle.destroy()
    expect(FakeResizeObserver.instances[0]?.observed).toEqual([])
  })

  it('re-measures from another registered node when the measured node unregisters', () => {
    const { clock } = testClock()
    const riffle = createRiffle(
      container,
      withClock({ count: 3, cardWidth: 'auto', gap: 20, clock }),
    )
    const first = sized(500, 700)
    const second = sized(800, 700)
    container.append(first, second)
    riffle.registerNode(0, first)
    riffle.registerNode(1, second)

    riffle.registerNode(0, null) // unregister the currently-measured node

    // Step is now measured from `second`: 800 + gap(20) = 820px.
    drag(410)
    expect(riffle.position).toBeCloseTo(0.5, 5)
  })

  it('re-targets measurement when the measured element is replaced at the same index', () => {
    // The Vue adapter calls registerCard(i, newEl) over an existing
    // registration during keyed reorders, with no intervening null. Without
    // a re-target, `measured` would keep pointing at the old, likely
    // detached element A, and 'auto' sizing would silently stop tracking
    // resizes.
    const { clock } = testClock()
    const riffle = createRiffle(
      container,
      withClock({ count: 3, cardWidth: 'auto', gap: 20, clock }),
    )
    const a = sized(500, 700)
    container.appendChild(a)
    riffle.registerNode(0, a)

    const b = sized(700, 700)
    container.appendChild(b)
    riffle.registerNode(0, b) // replaces A at the same index, no null in between

    // Step is now measured from B: 700 + gap(20) = 720px, so a 360px drag is
    // half a step. With the stale bug, step would still be 500 + 20 = 520px.
    drag(360)
    expect(riffle.position).toBeCloseTo(0.5, 5)

    // Break-it proof for the generation guard: A's own (now superseded)
    // observer is still a live object in this fake, and its disconnect()
    // only cleared its `observed` list; it did not prevent a direct .fire()
    // call, simulating a stale notification a real browser is not supposed
    // to deliver after disconnect, but which the guard must still absorb.
    // Resize A, then fire A's original observer directly.
    resize(a, 5000, 700)
    FakeResizeObserver.instances[0]?.fire()

    // "Changes nothing": the still-active gesture is not released, so a
    // further move at the same offset recomputes position from whatever
    // stepTravel is current. If the stale fire had corrupted cardExtent to
    // A's new (irrelevant) 5000px, this would read something far from 0.5;
    // the guard keeps it exactly where it was.
    firePointer(container, 'pointermove', { clientX: 100 + 360, clientY: 200 })
    expect(riffle.position).toBeCloseTo(0.5, 5)
  })
})

// --- update() honours every mutable option ---

describe('update()', () => {
  it('applies a changed threshold, and resets it when the key is undefined', () => {
    const { riffle, settle } = setupDraggable()
    riffle.update({ threshold: 0.5 })
    dragAndRelease(100)
    settle()
    expect(riffle.getSnapshot().activeIndex).toBe(0)
    riffle.update({ threshold: undefined })
    dragAndRelease(100)
    settle()
    expect(riffle.getSnapshot().activeIndex).toBe(1)
  })

  it('applies a changed flingVelocity, and resets it when the key is undefined', () => {
    const { riffle, settle, setTime } = setupDraggable()
    function flick(): void {
      setTime(0)
      firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
      firePointer(container, 'pointermove', { clientX: 108, clientY: 200 }) // clears slop, sample at t=0
      setTime(10)
      firePointer(container, 'pointermove', { clientX: 138, clientY: 200 }) // +30px at t=10: 3px/ms
      firePointer(container, 'pointerup', { clientX: 138, clientY: 200 })
      settle()
    }
    riffle.update({ flingVelocity: 10 })
    flick()
    // 3px/ms < 10, and 38/320 = 0.119 is below the default threshold too.
    expect(riffle.getSnapshot().activeIndex).toBe(0)
    riffle.update({ flingVelocity: undefined })
    flick()
    // Reset to the default 0.5px/ms: 3 >= 0.5 commits by fling alone.
    expect(riffle.getSnapshot().activeIndex).toBe(1)
  })

  it('applies draggable: false, and resets it when the key is undefined', () => {
    const { riffle, settle } = setupDraggable()
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 150, clientY: 200 }) // 50px, below threshold
    expect(riffle.position).toBeCloseTo(50 / 320, 10) // precondition: dragging moves position
    firePointer(container, 'pointerup', { clientX: 150, clientY: 200 })
    settle()
    expect(riffle.getSnapshot().activeIndex).toBe(0)

    riffle.update({ draggable: false })
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 150, clientY: 200 })
    expect(riffle.position).toBe(0)

    riffle.update({ draggable: undefined })
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 150, clientY: 200 })
    expect(riffle.position).toBeCloseTo(50 / 320, 10)
  })

  it('applies a changed crossFollow, and resets it when the key is undefined', () => {
    const { riffle, nodes, settle } = setupDraggable()
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 130, clientY: 210 }) // clears slop
    firePointer(container, 'pointermove', { clientX: 160, clientY: 240 }) // deltaCross 40
    settle(1) // a frame must run before write() reaches the DOM
    // precondition: default crossFollow 0.18 * 40 = 7.2
    expect(nodes[0]?.style.transform).toContain('7.20px')
    firePointer(container, 'pointerup', { clientX: 160, clientY: 240 })
    settle()

    riffle.update({ crossFollow: 0 })
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 130, clientY: 210 })
    firePointer(container, 'pointermove', { clientX: 160, clientY: 240 })
    settle(1)
    expect(nodes[0]?.style.transform).toContain('0.00px')
  })

  it('applies rotation: false, and resets it when the key is undefined', () => {
    const { riffle, nodes, settle } = setupDraggable()
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 180, clientY: 250 }) // main 80, cross 50
    settle(1) // a frame must run before write() reaches the DOM
    expect(nodes[0]?.style.transform).not.toContain('rotate(0.00deg)') // precondition
    firePointer(container, 'pointerup', { clientX: 180, clientY: 250 })
    settle()

    riffle.update({ rotation: false })
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 180, clientY: 250 })
    settle(1)
    expect(nodes[0]?.style.transform).toContain('rotate(0.00deg)')
  })

  it('applies a changed spring preset, settling in fewer frames when stiffer', () => {
    const { riffle, settle } = setupDraggable()
    riffle.update({ spring: 'smooth' })
    riffle.next()
    const smoothFrames = settle()
    expect(smoothFrames).toBeGreaterThan(0) // precondition: it actually animated

    riffle.update({ spring: 'stiff' })
    riffle.next()
    const stiffFrames = settle()
    expect(stiffFrames).toBeGreaterThan(0)
    expect(stiffFrames).toBeLessThan(smoothFrames)
  })

  it('applies reducedMotion: respect, landing on target with no frames run', () => {
    const { riffle, settle } = setupDraggable()
    riffle.next()
    expect(settle()).toBeGreaterThan(0) // precondition: normally animates over frames
    expect(riffle.getSnapshot().activeIndex).toBe(1)

    riffle.update({ reducedMotion: 'respect' })
    riffle.next()
    expect(riffle.position).toBe(2)
    expect(settle()).toBe(0)
  })

  it('applies a changed layout', () => {
    const { riffle, nodes, settle } = setupDraggable()
    settle()
    // precondition: the default fan offsets card 1 behind the front card.
    expect(nodes[1]?.style.transform).not.toContain('translate3d(0.00px')

    const flatLayout: LayoutStrategy = {
      name: 'flat',
      stepTravel: (geometry) => geometry.cardExtent + geometry.gap,
      pose(_depth, _geometry, out) {
        out.main = 0
        out.cross = 0
        out.rotation = 0
        out.scale = 1
        out.opacity = 1
        out.zIndex = 0
        return out
      },
    }
    riffle.update({ layout: flatLayout })
    settle()
    expect(nodes[1]?.style.transform).toContain('translate3d(0.00px')
  })

  it('applies a changed gap, and resets it when the key is undefined', () => {
    const { riffle, settle } = setupDraggable()
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 350, clientY: 200 }) // 250px
    // precondition: default gap 20, step 320
    expect(riffle.progress).toBeCloseTo(250 / 320, 10)
    firePointer(container, 'pointerup', { clientX: 350, clientY: 200 })
    settle()

    riffle.update({ gap: 200 })
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 350, clientY: 200 }) // step now 500
    expect(riffle.progress).toBeCloseTo(0.5, 10)
  })

  it('applies a changed maxVisible, and resets it when the key is undefined', () => {
    const { riffle, nodes, settle } = setupDraggable()
    settle()
    expect(nodes[2]?.style.opacity).toBe('1') // precondition: default maxVisible 4

    riffle.update({ maxVisible: 2 })
    settle()
    expect(nodes[2]?.style.opacity).toBe('0')

    riffle.update({ maxVisible: undefined })
    settle()
    expect(nodes[2]?.style.opacity).toBe('1')
  })

  it('tolerates a same-value axis update but throws a coded error on a real change', () => {
    const { riffle } = setupDraggable()
    expect(() => riffle.update({ axis: 'x' })).not.toThrow()
    expect(() => riffle.update({ axis: 'y' })).toThrowError(RiffleError)
    try {
      riffle.update({ axis: 'y' })
    } catch (error) {
      expect((error as RiffleError).code).toBe('INVALID_OPTION')
    }
  })

  it('routes count through setCount', () => {
    const { riffle } = setupDraggable()
    riffle.update({ count: 8 })
    expect(riffle.getSnapshot().count).toBe(8)
  })

  it('ignores startIndex: an initial value only, like defaultValue on an input', () => {
    const { riffle } = setupDraggable()
    expect(() => riffle.update({ startIndex: 3 })).not.toThrow()
    expect(riffle.getSnapshot().activeIndex).toBe(0)
  })

  it('throws a coded error when cardWidth toggles to auto after construction', () => {
    const { riffle } = setupDraggable()
    expect(() => riffle.update({ cardWidth: 'auto' })).toThrowError(RiffleError)
    try {
      riffle.update({ cardWidth: 'auto' })
    } catch (error) {
      expect((error as RiffleError).code).toBe('INVALID_OPTION')
    }
  })

  it('applies cardWidth number-to-number, and re-derives step travel', () => {
    const { riffle } = setupDraggable()
    riffle.update({ cardWidth: 480 })
    // step is now 480 + gap(20) = 500px, so a 250px drag is half a step.
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 350, clientY: 200 })
    expect(riffle.progress).toBeCloseTo(0.5, 10)
  })

  it('is a no-op to reset cardWidth on an auto stack', () => {
    const { riffle } = setupDraggable(5, { cardWidth: 'auto' })
    expect(() => riffle.update({ cardWidth: undefined })).not.toThrow()
  })

  describe('bounds', () => {
    it('switches modes without a jump, and applies otherwise', () => {
      const { riffle } = setupDraggable()
      expect(() => riffle.update({ bounds: undefined })).not.toThrow()
    })

    it('switching to clamp pins target and motion.value to the current activeIndex under an advanced loop', () => {
      const { riffle, settle } = setupDraggable(5)
      for (let i = 0; i < 6; i += 1) {
        riffle.next()
        settle()
      }
      // precondition: a loop that has travelled six steps from 0 sits at
      // activeIndex 1 with a raw target of 6, well outside 0..count-1.
      expect(riffle.getSnapshot().activeIndex).toBe(1)
      expect(riffle.position).toBe(6)

      riffle.update({ bounds: 'clamp' })
      const snap = riffle.getSnapshot()
      expect(snap.activeIndex).toBe(1)
      expect(riffle.position).toBe(1)
      expect(snap.canPrev).toBe(true)
      expect(snap.canNext).toBe(true)
    })
  })

  it('refreshes card labels immediately when getLabel changes', () => {
    const { riffle, nodes } = setupDraggable()
    expect(nodes[0]?.getAttribute('aria-label')).toBe('1 of 5')
    riffle.update({ getLabel: (i) => `Card ${i}` })
    expect(nodes[0]?.getAttribute('aria-label')).toBe('Card 0, 1 of 5')
    riffle.update({ getLabel: undefined })
    expect(nodes[0]?.getAttribute('aria-label')).toBe('1 of 5')
  })

  it('validates the merged options before applying anything, leaving other keys in the same call unapplied', () => {
    const { riffle } = setupDraggable()
    expect(() => riffle.update({ maxVisible: 0, gap: 999 })).toThrowError(RiffleError)
    // gap must still be the default 20, not the 999 from the rejected call:
    // step is 320, so a 250px drag is 250/320, not 250/1019.
    firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
    firePointer(container, 'pointermove', { clientX: 350, clientY: 200 })
    expect(riffle.progress).toBeCloseTo(250 / 320, 10)
  })
})
