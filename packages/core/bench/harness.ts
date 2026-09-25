import { createRiffle } from '../src/riffle'
import type { Clock } from '../src/animation/loop'
import type { RiffleOptions } from '../src/types'

// createRiffle's public signature is RiffleOptions; `clock` is a
// test-only injection point read internally via a cast (riffle.ts's
// InternalOptions, deliberately not exported). Copied from
// tests/riffle.test.ts so the bench and the GC burst drive frames the same
// deterministic way the unit tests do: no real rAF, no wall-clock jitter.
type TestOptions = RiffleOptions & { clock?: Clock }

function withClock(opts: TestOptions): RiffleOptions {
  return opts as RiffleOptions
}

function handDrivenClock() {
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
    /** Advance the clock by `ms` and deliver exactly one pending frame, if any. */
    tick(ms: number): boolean {
      if (!pending) return false
      const cb = pending
      pending = null
      time += ms
      cb(time)
      return true
    },
  }
}

/** happy-dom does not implement pointer capture; the engine only calls it. */
function preparePointerTarget(el: HTMLElement): void {
  el.setPointerCapture = () => {}
  el.releasePointerCapture = () => {}
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

export interface DragRig {
  riffle: ReturnType<typeof createRiffle>
  /** Advances the drag a little and runs exactly one frame (one write() call). */
  frame(): void
  /**
   * Runs exactly one frame (one write() call) at the drag's current
   * position, with no new pointermove dispatched. Isolates the animation
   * loop's own per-frame cost (integrate + write) from event-dispatch
   * overhead, which is what the GC burst cares about: a real drag holds
   * position between input samples just as often as it moves, and the loop
   * keeps re-requesting its own next frame while dragging regardless
   * (settled() returns false), so this is still a faithful mid-drag frame.
   */
  holdFrame(): void
  destroy(): void
}

/**
 * Builds a Riffle instance with `count` registered cards, mid-drag (past
 * slop, so every subsequent frame's write() runs the full drag-follow hot
 * path: pose computation, cross-follow and rotation), and a hand-driven
 * clock so each frame can be delivered, and timed, in isolation.
 *
 * onMove only calls kick() to ensure the loop is running; the loop itself
 * re-requests its own next frame every tick while dragging (settled()
 * returns false), so frame() below only needs to fire a pointermove to
 * advance the drag's position before delivering the next tick.
 */
export function createDragRig(count: number): DragRig {
  const container = document.createElement('div')
  document.body.appendChild(container)
  preparePointerTarget(container)

  const { clock, tick } = handDrivenClock()
  const riffle = createRiffle(
    container,
    withClock({ count, clock, cardWidth: 300, cardHeight: 400, gap: 20 }),
  )
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('div')
    container.appendChild(el)
    riffle.registerNode(i, el)
  }

  firePointer(container, 'pointerdown', { clientX: 100, clientY: 200 })
  firePointer(container, 'pointermove', { clientX: 130, clientY: 200 }) // crosses slop, locks the gesture
  tick(1000 / 60) // deliver the frame kicked by onStart/onMove before measuring begins

  let dragX = 130
  return {
    riffle,
    frame(): void {
      dragX += 2
      firePointer(container, 'pointermove', { clientX: dragX, clientY: 200 })
      tick(1000 / 60)
    },
    holdFrame(): void {
      tick(1000 / 60)
    },
    destroy(): void {
      firePointer(container, 'pointerup', { clientX: dragX, clientY: 200 })
      riffle.destroy()
      container.remove()
    },
  }
}
