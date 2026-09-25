import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { createAdapterHandle } from '../src/adapter'
import { initialSnapshot } from '../src/snapshot'
import { createRiffle } from '../src/riffle'
import { fan } from '../src/layout/fan'
import type { Bounds, RiffleOptions } from '../src/types'

function baseOptions(extra: Partial<RiffleOptions> = {}): RiffleOptions {
  return {
    count: 3,
    cardWidth: 300,
    cardHeight: 400,
    gap: 20,
    ...extra,
  }
}

function mountThree() {
  const handle = createAdapterHandle(baseOptions({ count: 3 }))
  const container = document.createElement('div')
  const a = document.createElement('div')
  const b = document.createElement('div')
  const c = document.createElement('div')
  handle.registerCard(0, a)
  handle.registerCard(1, b)
  handle.registerCard(2, c)
  handle.rootRef(container)
  return { handle, container, a, b, c }
}

function mountTwo() {
  const handle = createAdapterHandle(baseOptions({ count: 2 }))
  const container = document.createElement('div')
  const a = document.createElement('div')
  const b = document.createElement('div')
  handle.registerCard(0, a)
  handle.registerCard(1, b)
  handle.rootRef(container)
  return { handle, container, a, b }
}

describe('initialSnapshot', () => {
  it('matches the first snapshot of a real instance for any count, startIndex and bounds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: -10, max: 30 }),
        fc.constantFrom('loop' as const, 'clamp' as const),
        (count, startIndex, bounds) => {
          const el = document.createElement('div')
          const riffle = createRiffle(el, { count, startIndex, bounds })
          const same =
            JSON.stringify(riffle.getSnapshot()) ===
            JSON.stringify(initialSnapshot({ count, startIndex, bounds }))
          riffle.destroy()
          return same
        },
      ),
    )
  })
  // Break-it proof: changing the loop branch of
  // canPrev in snapshot.ts to `start > 0` makes fast-check find a
  // counterexample at count 2, startIndex 0, bounds 'loop' (canPrev true on
  // a real instance, false from initialSnapshot).

  // fast-check's own corpus already includes the range
  // boundaries (count: 0 is the minimum of the integer range), but a sampled
  // property is still a sample. Pin count 0 and count 1 as deterministic
  // examples, for both bounds modes, so a run that happens not to draw them
  // is not the only evidence.
  const zeroAndOneCases: Array<{ count: number; startIndex: number; bounds: Bounds }> = [
    { count: 0, startIndex: 0, bounds: 'loop' },
    { count: 0, startIndex: 0, bounds: 'clamp' },
    { count: 0, startIndex: 5, bounds: 'clamp' },
    { count: 1, startIndex: 0, bounds: 'loop' },
    { count: 1, startIndex: 0, bounds: 'clamp' },
    { count: 1, startIndex: 3, bounds: 'clamp' },
  ]

  for (const { count, startIndex, bounds } of zeroAndOneCases) {
    it(`matches a real instance for count ${count}, startIndex ${startIndex}, bounds ${bounds}`, () => {
      const el = document.createElement('div')
      const riffle = createRiffle(el, { count, startIndex, bounds })
      const real = riffle.getSnapshot()
      riffle.destroy()

      expect(initialSnapshot({ count, startIndex, bounds })).toEqual(real)
    })
  }
})

describe('createAdapterHandle', () => {
  it('returns the identical snapshot reference across mount', () => {
    // Precondition: before mount, getSnapshot returns the pre-mount literal.
    const handle = createAdapterHandle(baseOptions({ count: 3 }))
    const before = handle.getSnapshot()
    expect(before.count).toBe(3)

    const container = document.createElement('div')
    handle.rootRef(container)
    const after = handle.getSnapshot()

    // Same field values (initialSnapshot agrees with the engine's own first
    // snapshot), so the store's shallowEqual early return must hand back
    // the exact same object React already rendered from.
    expect(after).toBe(before)
    handle.rootRef(null)
  })

  it('writes a pre-mount registered card at mount', () => {
    const handle = createAdapterHandle(baseOptions({ count: 3 }))
    const el = document.createElement('div')
    // Precondition: nothing has written to the card yet.
    expect(el.style.transform).toBe('')

    handle.registerCard(0, el)
    expect(el.style.transform).toBe('')

    const container = document.createElement('div')
    handle.rootRef(container)
    expect(el.style.transform).not.toBe('')
    handle.rootRef(null)
  })

  it('destroys the instance and removes the live region on rootRef(null), after a microtask', async () => {
    // Teardown is deferred by one microtask (see
    // adapter.ts's rootRef), so a synchronous check right after rootRef(null)
    // would see the engine still alive; await one microtask first.
    const handle = createAdapterHandle(baseOptions({ count: 3 }))
    const container = document.createElement('div')
    handle.rootRef(container)

    // Precondition: the container holds a live region and a live instance.
    expect(container.querySelector('[aria-live]')).not.toBeNull()
    expect(handle.instance).not.toBeNull()

    handle.rootRef(null)
    await Promise.resolve()

    expect(container.querySelector('[aria-live]')).toBeNull()
    expect(handle.instance).toBeNull()
  })

  it('keeps a pre-mount subscriber subscribed across mount', () => {
    const handle = createAdapterHandle(baseOptions({ count: 3 }))
    const listener = vi.fn()
    handle.subscribe(listener)

    const container = document.createElement('div')
    handle.registerCard(0, document.createElement('div'))
    handle.registerCard(1, document.createElement('div'))
    handle.registerCard(2, document.createElement('div'))
    handle.rootRef(container)

    // Precondition: the subscriber has been reachable since before mount,
    // and mount itself already notified it at least once.
    expect(listener).toHaveBeenCalled()
    listener.mockClear()

    handle.next()
    expect(listener).toHaveBeenCalled()
    handle.rootRef(null)
  })

  it('keeps an on() listener bound across an axis rebuild, and unsubscribes cleanly', () => {
    const handle = createAdapterHandle(baseOptions({ count: 3 }))
    const fn = vi.fn()
    const off = handle.on('change', fn)

    const container = document.createElement('div')
    handle.registerCard(0, document.createElement('div'))
    handle.registerCard(1, document.createElement('div'))
    handle.registerCard(2, document.createElement('div'))
    handle.rootRef(container)

    handle.next()
    expect(fn).toHaveBeenCalledTimes(1)

    const before = handle.instance
    handle.setOptions(baseOptions({ count: 3, axis: 'y' }))
    expect(handle.instance).not.toBe(before)

    handle.next()
    expect(fn).toHaveBeenCalledTimes(2)

    off()
    handle.next()
    expect(fn).toHaveBeenCalledTimes(2)
    handle.rootRef(null)
  })

  it('keeps position across an axis rebuild', () => {
    const handle = createAdapterHandle(baseOptions({ count: 5 }))
    const container = document.createElement('div')
    for (let i = 0; i < 5; i += 1) handle.registerCard(i, document.createElement('div'))
    handle.rootRef(container)

    handle.goTo(2, { animate: false })
    // Precondition: the position actually moved before the rebuild.
    expect(handle.getSnapshot().activeIndex).toBe(2)

    const before = handle.instance
    handle.setOptions(baseOptions({ count: 5, axis: 'y' }))

    expect(handle.instance).not.toBe(before)
    expect(handle.getSnapshot().activeIndex).toBe(2)
    handle.rootRef(null)
  })

  it('resets a removed option to its default via update(undefined)', () => {
    const handle = createAdapterHandle(baseOptions({ count: 3, threshold: 0.5 }))
    const container = document.createElement('div')
    handle.rootRef(container)
    const spy = vi.spyOn(handle.instance!, 'update')

    handle.setOptions(baseOptions({ count: 3 }))

    expect(spy).toHaveBeenCalledWith({ threshold: undefined })
    handle.rootRef(null)
  })

  it('does not call update for options equal by value, including a fresh spring object literal', () => {
    const handle = createAdapterHandle(
      baseOptions({ count: 3, spring: { stiffness: 300, damping: 30 } }),
    )
    const container = document.createElement('div')
    handle.rootRef(container)
    const spy = vi.spyOn(handle.instance!, 'update')

    // A brand new object literal, same values, as an inline prop would hand
    // in on every render (amendment: shallow-compare spring/rotation).
    handle.setOptions(baseOptions({ count: 3, spring: { stiffness: 300, damping: 30 } }))

    expect(spy).not.toHaveBeenCalled()
    handle.rootRef(null)
  })

  it('compares layout by identity, not behaviour', () => {
    const layoutA = fan()
    const handle = createAdapterHandle(baseOptions({ count: 3, layout: layoutA }))
    const container = document.createElement('div')
    handle.rootRef(container)
    const spy = vi.spyOn(handle.instance!, 'update')

    // A different object with identical behaviour (another call to the same
    // factory) is still a change: layout is compared by identity.
    const layoutB = fan()
    handle.setOptions(baseOptions({ count: 3, layout: layoutB }))
    expect(spy).toHaveBeenCalledWith({ layout: layoutB })
    spy.mockClear()

    // The same reference a second time is not a change.
    handle.setOptions(baseOptions({ count: 3, layout: layoutB }))
    expect(spy).not.toHaveBeenCalled()

    handle.rootRef(null)
  })

  it('compares getLabel by identity, not behaviour', () => {
    const getLabelA = (index: number) => `card ${index}`
    const handle = createAdapterHandle(baseOptions({ count: 3, getLabel: getLabelA }))
    const container = document.createElement('div')
    handle.rootRef(container)
    const spy = vi.spyOn(handle.instance!, 'update')

    // A new function with the identical body is still a change.
    const getLabelB = (index: number) => `card ${index}`
    handle.setOptions(baseOptions({ count: 3, getLabel: getLabelB }))
    expect(spy).toHaveBeenCalledWith({ getLabel: getLabelB })
    spy.mockClear()

    // The same reference a second time is not a change.
    handle.setOptions(baseOptions({ count: 3, getLabel: getLabelB }))
    expect(spy).not.toHaveBeenCalled()

    handle.rootRef(null)
  })

  it('returns a stable ref callback per index, and different ones for different indices', () => {
    const handle = createAdapterHandle(baseOptions({ count: 3 }))
    const ref0a = handle.cardRef(0)
    const ref0b = handle.cardRef(0)
    const ref1 = handle.cardRef(1)

    expect(ref0a).toBe(ref0b)
    expect(ref0a).not.toBe(ref1)
  })

  it('does not unregister a card whose element has already been replaced', () => {
    const handle = createAdapterHandle(baseOptions({ count: 3 }))
    const container = document.createElement('div')
    const a = document.createElement('div')
    const b = document.createElement('div')
    handle.registerCard(0, a)
    handle.rootRef(container)
    const spy = vi.spyOn(handle.instance!, 'registerNode')

    // Precondition: `a` is the element actually registered at index 0.
    handle.unregisterCard(0, a)
    expect(spy).toHaveBeenCalledWith(0, null)
    spy.mockClear()
    handle.registerCard(0, a)

    handle.unregisterCard(0, b)
    expect(spy).not.toHaveBeenCalledWith(0, null)
    handle.rootRef(null)
  })

  describe('keyed reorder with removal', () => {
    // [A, B, C] at [0, 1, 2] becomes [C, A]: C moves to 0, A moves to 1, B
    // is removed. This is the scenario that breaks per-index ref callbacks;
    // it is the reason registerCard/unregisterCard are element-aware.
    // Break-it proof: make unregisterCard delete
    // unconditionally (drop the `nodes.get(index) !== el` guard). In the
    // order replayed below this loses A: step 3, `unregisterCard(1, B)`, blows
    // away the A that step 2 just placed at index 1, since the guard is the
    // only thing telling the naive delete "that slot isn't B anymore".

    it("replays a naive order, where A's move completes before B's unmount is attempted", () => {
      const { handle, a, b, c } = mountThree()

      handle.unregisterCard(0, a)
      handle.registerCard(1, a)
      handle.unregisterCard(1, b) // no-op: slot 1 now holds `a`, not `b`
      handle.unregisterCard(2, c)
      handle.registerCard(0, c)
      handle.setOptions(baseOptions({ count: 2 }))

      expect(c.getAttribute('aria-label')).toBe('1 of 2')
      expect(a.getAttribute('aria-label')).toBe('2 of 2')
      handle.rootRef(null)
    })

    it("replays Vue's actual order, B's beforeUnmount synchronous during patch, updates afterwards", () => {
      const { handle, a, b, c } = mountThree()

      handle.unregisterCard(1, b) // beforeUnmount, synchronous during patch
      handle.unregisterCard(0, a) // old ref cleared, in the updated pass
      handle.registerCard(1, a) // new ref set, in the updated pass
      handle.unregisterCard(2, c)
      handle.registerCard(0, c)
      handle.setOptions(baseOptions({ count: 2 }))

      expect(c.getAttribute('aria-label')).toBe('1 of 2')
      expect(a.getAttribute('aria-label')).toBe('2 of 2')
      handle.rootRef(null)
    })
  })

  it('handles a pure swap with no removal, [A, B] becoming [B, A]', () => {
    // The reorder-with-removal tests above
    // both happen to replay unregisterCard calls while the index they name
    // still holds the element being removed, so they never actually
    // exercise the guard's "no-op" branch on the path that matters. A pure
    // swap does: unregisterCard(1, B) below runs only after registerCard(1,
    // A) has already overwritten that slot, so the guard's `nodes.get(index)
    // !== el` check is the only thing standing between this replay and
    // silently losing A.
    const { handle, a, b } = mountTwo()

    // Precondition: before the swap, A is at 0 and B is at 1.
    expect(a.getAttribute('aria-label')).toBe('1 of 2')
    expect(b.getAttribute('aria-label')).toBe('2 of 2')

    handle.unregisterCard(0, a)
    handle.registerCard(1, a)
    handle.unregisterCard(1, b) // no-op: slot 1 now holds `a`, not `b`
    handle.registerCard(0, b)

    expect(b.getAttribute('aria-label')).toBe('1 of 2')
    expect(a.getAttribute('aria-label')).toBe('2 of 2')
    // Both cards are still tracked and still receive transforms; neither
    // was silently dropped by the reorder.
    expect(a.style.transform).not.toBe('')
    expect(b.style.transform).not.toBe('')

    // The label/transform check above passes even under a naive,
    // index-only unregisterCard: A's last real write happened at step 2,
    // already at its correct final pose, so losing A from the engine's own
    // node map at step 3 leaves no visible mark by itself. Force the engine
    // to recompute: move the active card. If A were silently dropped from
    // the engine's tracked nodes, this write would skip it and stay frozen
    // at its pre-move pose.
    //
    // Asserted on opacity, not transform: with count 2 and this exact
    // goTo, each card crosses between depth -1 (the invisible exit slot)
    // and depth 0 (the front card). applyPose
    // (packages/core/src/render/transform.ts) writes an invisible card's
    // transform as the neutral translate(0,0)/rotate(0)/scale(1),
    // identical to the front card's own real pose at depth 0 (fan()'s
    // pose(0, ...) is main 0, rotation 0, scale 1 too), so the transform
    // string alone does not reliably differ across this one transition,
    // even though the card was correctly recomputed. Opacity (0 at depth
    // -1, 1 at depth 0) still does.
    const aOpacityBeforeMove = a.style.opacity
    const bOpacityBeforeMove = b.style.opacity
    handle.goTo(1, { animate: false })
    expect(a.style.opacity).not.toBe(aOpacityBeforeMove)
    expect(b.style.opacity).not.toBe(bOpacityBeforeMove)

    handle.rootRef(null)
  })

  it('remounting the same element is a no-op', () => {
    const handle = createAdapterHandle(baseOptions({ count: 3 }))
    const container = document.createElement('div')
    handle.rootRef(container)
    const instance = handle.instance

    handle.rootRef(container)
    expect(handle.instance).toBe(instance)
    handle.rootRef(null)
  })

  it('runs a twice-subscribed function once after only one unsubscribe, and zero after both', () => {
    // Break-it proof: key `on()`'s bookkeeping by
    // function identity in a Set/Map instead of a per-call record. Two
    // symptoms both show up: after ONE unsubscribe the count already
    // diverges in some naive shapes, and after BOTH unsubscribes a
    // function-keyed Map still leaks one core-level registration forever
    // (its second `on()` call overwrote the first call's unsubscribe
    // reference, so the first registration is never reachable again). This
    // test's final assertion, zero calls after unsubscribing both, is what
    // actually catches that leak; a version that only checked "one
    // unsubscribe leaves one call" passed against the broken code too.
    const { handle } = mountThree()
    const fn = vi.fn()
    const offA = handle.on('change', fn)
    const offB = handle.on('change', fn)

    // Precondition: both registrations are live, so one 'change' calls fn
    // twice, once per registration.
    handle.next()
    expect(fn).toHaveBeenCalledTimes(2)
    fn.mockClear()

    offA()
    handle.next()
    expect(fn).toHaveBeenCalledTimes(1)
    fn.mockClear()

    offB()
    handle.next()
    expect(fn).toHaveBeenCalledTimes(0)

    handle.rootRef(null)
  })

  it('keeps a subscribe() listener firing after an axis rebuild', () => {
    const handle = createAdapterHandle(baseOptions({ count: 3 }))
    const listener = vi.fn()
    handle.subscribe(listener)

    const container = document.createElement('div')
    handle.registerCard(0, document.createElement('div'))
    handle.registerCard(1, document.createElement('div'))
    handle.registerCard(2, document.createElement('div'))
    handle.rootRef(container)

    // Precondition: the subscriber is already live and reachable before the
    // rebuild, same as "keeps a pre-mount subscriber subscribed across
    // mount" above, and next() reaches it on the pre-rebuild instance.
    listener.mockClear()
    handle.next()
    expect(listener).toHaveBeenCalled()
    listener.mockClear()

    handle.setOptions(baseOptions({ count: 3, axis: 'y' }))
    // The rebuild itself calls notify() once; that alone would pass even if
    // the new instance's store were never wired up, so clear it and prove
    // the wiring with a real change on the new instance instead.
    listener.mockClear()

    handle.next()
    expect(listener).toHaveBeenCalled()
    handle.rootRef(null)
  })

  it('remounts at the carried index after a genuine unmount and remount, no axis change', async () => {
    const handle = createAdapterHandle(baseOptions({ count: 5 }))
    const container = document.createElement('div')
    for (let i = 0; i < 5; i += 1) handle.registerCard(i, document.createElement('div'))
    handle.rootRef(container)

    handle.goTo(2, { animate: false })
    // Precondition: the position actually moved before unmounting.
    expect(handle.getSnapshot().activeIndex).toBe(2)

    handle.rootRef(null)
    // Teardown is deferred by a microtask, and a
    // same-element rootRef call before it runs would cancel it (see the new
    // "cancels a pending teardown" test below). Awaiting here lets the
    // teardown actually happen, so the remount below is a genuine one, not
    // a same-element no-op.
    await Promise.resolve()
    // Precondition: this was a genuine unmount, not a no-op.
    expect(handle.instance).toBeNull()

    handle.rootRef(container)
    expect(handle.instance).not.toBeNull()
    expect(handle.getSnapshot().activeIndex).toBe(2)
    handle.rootRef(null)
  })

  describe('deferred teardown on rootRef(null)', () => {
    it('cancels a pending teardown when the same element is re-attached in the same task, keeping the identical instance and exactly one live region', () => {
      const handle = createAdapterHandle(baseOptions({ count: 3 }))
      const container = document.createElement('div')
      handle.rootRef(container)
      const instance = handle.instance
      // Precondition: a real instance mounted.
      expect(instance).not.toBeNull()

      handle.rootRef(null)
      handle.rootRef(container)

      expect(handle.instance).toBe(instance)
      expect(container.querySelectorAll('[aria-live]').length).toBe(1)
    })
    // Break-it proof: remove the deferral, i.e. make
    // rootRef(null) call detach() synchronously as before. `handle.instance`
    // is no longer the same object (a fresh engine was created by the
    // following rootRef(container) call), and a second live region gets
    // appended alongside a leftover from the destroy/recreate cycle in some
    // variants of the naive fix; either way `toBe(instance)` fails.

    it('leaves the instance set synchronously after rootRef(null), and null only after a microtask, removing the live region', async () => {
      const handle = createAdapterHandle(baseOptions({ count: 3 }))
      const container = document.createElement('div')
      handle.rootRef(container)
      // Precondition: a real instance mounted, with its live region.
      expect(handle.instance).not.toBeNull()
      expect(container.querySelector('[aria-live]')).not.toBeNull()

      handle.rootRef(null)
      // Still set: teardown has not run yet.
      expect(handle.instance).not.toBeNull()
      expect(container.querySelector('[aria-live]')).not.toBeNull()

      await Promise.resolve()

      expect(handle.instance).toBeNull()
      expect(container.querySelector('[aria-live]')).toBeNull()
    })
    // Break-it proof: remove the deferral so
    // rootRef(null) calls detach() immediately. The first pair of
    // assertions (instance and live region still present right after
    // rootRef(null)) then fails: the instance is already null and the live
    // region already gone, before the microtask ever runs.

    it('destroys the old engine immediately and attaches the new one when a different element follows rootRef(null), with no deferral', () => {
      const handle = createAdapterHandle(baseOptions({ count: 3 }))
      const first = document.createElement('div')
      const second = document.createElement('div')
      handle.rootRef(first)
      const firstInstance = handle.instance
      // Precondition: mounted on `first`.
      expect(firstInstance).not.toBeNull()

      handle.rootRef(null)
      handle.rootRef(second)

      // No deferral for a genuinely different element: the swap is
      // synchronous, not scheduled.
      expect(handle.instance).not.toBeNull()
      expect(handle.instance).not.toBe(firstInstance)
      expect(second.querySelector('[aria-live]')).not.toBeNull()
      expect(first.querySelector('[aria-live]')).toBeNull()
    })
    // Break-it proof: make the `el === null` branch
    // in rootRef the ONLY place that ever calls `detach()`, so the "a
    // different element follows" branch just does `container = el;
    // attach(el)` without detaching first. `first`'s live region is still
    // there (`toBeNull()` on it fails) because the old engine was never torn
    // down, and a second engine now also lives on `second`.

    it('never fires a cancelled teardown later, even after another microtask', async () => {
      const handle = createAdapterHandle(baseOptions({ count: 3 }))
      const container = document.createElement('div')
      handle.rootRef(container)
      const instance = handle.instance
      expect(instance).not.toBeNull()

      handle.rootRef(null)
      handle.rootRef(container) // cancels the pending teardown

      // Precondition: the cancellation did not itself destroy anything.
      expect(handle.instance).toBe(instance)

      await Promise.resolve()
      await Promise.resolve()

      // The microtask the cancelled call originally scheduled has now had
      // every opportunity to run; it must still be a no-op.
      expect(handle.instance).toBe(instance)
      expect(container.querySelector('[aria-live]')).not.toBeNull()
    })
    // Break-it proof: drop the token check inside
    // the queued callback (`if (token !== teardownToken) return`), so every
    // scheduled teardown runs unconditionally. `instance` becomes null after
    // the microtasks even though the engine was very much still wanted,
    // and the live region disappears out from under the still-mounted
    // container.
  })

  describe('options that change while a teardown is pending', () => {
    function key(el: HTMLElement, k: string): void {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
    }

    it('still tears down when the axis changes between rootRef(null) and the microtask, and no on() listener fires afterwards', async () => {
      const { handle, container } = mountThree()
      const fn = vi.fn()
      handle.on('change', fn)
      // Precondition: the listener is bound to the live engine.
      handle.next()
      expect(fn).toHaveBeenCalledTimes(1)
      fn.mockClear()
      const before = handle.instance

      handle.rootRef(null)
      handle.setOptions(baseOptions({ count: 3, axis: 'y' }))
      // While the teardown is pending, setOptions only stores: no rebuild.
      expect(handle.instance).toBe(before)
      await Promise.resolve()
      await Promise.resolve()

      expect(handle.instance).toBeNull()
      expect(container.querySelector('[aria-live]')).toBeNull()
      handle.next()
      key(container, 'ArrowDown')
      key(container, 'ArrowRight')
      expect(fn).not.toHaveBeenCalled()
    })

    it('keeps one live engine with the new axis when the same element returns within the microtask', async () => {
      const { handle, container } = mountThree()
      handle.goTo(2, { animate: false })
      // Precondition: the position moved, and the engine is on the x axis.
      expect(handle.getSnapshot().activeIndex).toBe(2)
      key(container, 'ArrowDown')
      expect(handle.getSnapshot().activeIndex).toBe(2)

      handle.rootRef(null)
      handle.setOptions(baseOptions({ count: 3, axis: 'y' }))
      handle.rootRef(container)
      await Promise.resolve()
      await Promise.resolve()

      expect(handle.instance).not.toBeNull()
      expect(container.querySelectorAll('[aria-live]').length).toBe(1)
      expect(handle.getSnapshot().activeIndex).toBe(2)
      key(container, 'ArrowDown')
      expect(handle.getSnapshot().activeIndex).toBe(0)
    })

    it('applies a non-rebuilding change on the same-element return', () => {
      const { handle, container } = mountThree()
      const instance = handle.instance
      handle.rootRef(null)
      handle.setOptions(baseOptions({ count: 3, bounds: 'clamp' }))
      handle.rootRef(container)

      // Same engine, but it now clamps: prev at index 0 cannot move.
      expect(handle.instance).toBe(instance)
      expect(handle.getSnapshot().canPrev).toBe(false)
    })

    it('rebuilds in auto mode, keeping position, when cardWidth crosses to auto and the same element returns within the microtask', async () => {
      const { handle, container } = mountThree()
      handle.goTo(2, { animate: false })
      // Precondition: the position moved, and the live engine was built in
      // numeric cardWidth mode, so an auto update on it would throw.
      expect(handle.getSnapshot().activeIndex).toBe(2)
      const numeric = handle.instance!
      expect(() => numeric.update({ cardWidth: 'auto' })).toThrow()

      handle.rootRef(null)
      handle.setOptions(baseOptions({ count: 3, cardWidth: 'auto' }))
      expect(() => handle.rootRef(container)).not.toThrow()
      await Promise.resolve()
      await Promise.resolve()

      // Exactly one live engine, on the same element, in the new auto mode.
      expect(handle.instance).not.toBeNull()
      expect(container.querySelectorAll('[aria-live]').length).toBe(1)
      expect(handle.getSnapshot().activeIndex).toBe(2)
      const auto = handle.instance!
      expect(auto).not.toBe(numeric)
      expect(() => auto.update({ cardWidth: 'auto' })).not.toThrow()
    })
    // Break-it proof: drop the
    // `crossesAuto(prev.cardWidth, next.cardWidth) ||` clause from
    // needsRebuild. sync() then takes the update() path instead of
    // rebuilding, and the same-element rootRef(container) call throws
    // synchronously (the numeric-mode engine rejects an `auto` update, as
    // the precondition above already established), which this test catches
    // through the `not.toThrow()` assertion around it.
  })

  describe('crossing between a number and auto on a card dimension', () => {
    for (const dim of ['cardWidth', 'cardHeight'] as const) {
      it(`rebuilds and keeps position when ${dim} switches to 'auto' and back`, () => {
        const handle = createAdapterHandle(baseOptions({ count: 5 }))
        const container = document.createElement('div')
        for (let i = 0; i < 5; i += 1) handle.registerCard(i, document.createElement('div'))
        handle.rootRef(container)
        handle.goTo(3, { animate: false })
        const numeric = handle.instance!
        // Precondition: the engine was built in numeric mode.
        expect(() => numeric.update({ [dim]: 'auto' })).toThrow()

        expect(() => handle.setOptions(baseOptions({ count: 5, [dim]: 'auto' }))).not.toThrow()
        const auto = handle.instance!
        expect(auto).not.toBe(numeric)
        expect(handle.getSnapshot().activeIndex).toBe(3)
        // The new engine was built in auto mode.
        expect(() => auto.update({ [dim]: 'auto' })).not.toThrow()

        expect(() => handle.setOptions(baseOptions({ count: 5, [dim]: 250 }))).not.toThrow()
        expect(handle.instance).not.toBe(auto)
        expect(handle.getSnapshot().activeIndex).toBe(3)
        expect(() => handle.instance!.update({ [dim]: 260 })).not.toThrow()
        handle.rootRef(null)
      })
    }

    it('updates in place, without a rebuild, for a number to number change', () => {
      const { handle } = mountThree()
      const instance = handle.instance
      handle.setOptions(baseOptions({ count: 3, cardWidth: 250 }))
      expect(handle.instance).toBe(instance)
      handle.rootRef(null)
    })
  })

  it('keeps the carried position across the unmount gap, not startIndex', async () => {
    const handle = createAdapterHandle(baseOptions({ count: 5 }))
    const container = document.createElement('div')
    for (let i = 0; i < 5; i += 1) handle.registerCard(i, document.createElement('div'))
    handle.rootRef(container)
    handle.goTo(2, { animate: false })
    const seen: number[] = []
    handle.subscribe(() => seen.push(handle.getSnapshot().activeIndex))

    handle.rootRef(null)
    await Promise.resolve()
    // Precondition: this was a genuine unmount.
    expect(handle.instance).toBeNull()
    expect(handle.getSnapshot().activeIndex).toBe(2)

    // An option change while unmounted rebuilds the pre-mount snapshot; it
    // must still carry the position.
    handle.setOptions(baseOptions({ count: 5, threshold: 0.5 }))
    expect(handle.getSnapshot().activeIndex).toBe(2)

    handle.rootRef(container)
    expect(handle.getSnapshot().activeIndex).toBe(2)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((index) => index === 2)).toBe(true)
    handle.rootRef(null)
  })

  describe('mutation survivors', () => {
    // Mutants (ConditionalExpression x3, LogicalOperator): isPlainObject's
    // `typeof value === 'object' && value !== null` guard. `false` (a valid
    // rotation value) fails the typeof check; only a value that also passes
    // the null-exclusion should ever reach the shallow-compare path.
    it('treats rotation going from false to an object as a change, even an empty one', () => {
      const { handle } = mountThree()
      handle.setOptions(baseOptions({ count: 3, rotation: false }))
      const spy = vi.spyOn(handle.instance!, 'update')
      handle.setOptions(baseOptions({ count: 3, rotation: {} }))
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ rotation: {} }))
      handle.rootRef(null)
    })

    // Isolates the null-exclusion half of the same guard: a runtime `null`
    // (outside rotation's real type) must fail isPlainObject on the
    // null-check alone, even though `typeof null === 'object'` is true.
    // Confirmed by which error surfaces: the real guard lets the value
    // through to riffle.ts's own resolveRotation, which throws reading
    // `maxRotation` off null; a mutant that treats null as a plain object
    // instead throws earlier, from adapter.ts's own shallowEqual calling
    // Object.keys(null), with a different message.
    it('does not misread null as a plain object when shallow-comparing rotation', () => {
      const { handle } = mountThree()
      handle.setOptions(baseOptions({ count: 3, rotation: { maxRotation: 20 } }))
      expect(() =>
        handle.setOptions(baseOptions({ count: 3, rotation: null as unknown as false })),
      ).toThrow(/maxRotation/)
      handle.rootRef(null)
    })

    // Mutants (ConditionalExpression, EqualityOperator on line 86): the
    // `key === 'spring' || key === 'rotation'` gate around the shallow
    // compare. Widening it to every key would treat a fresh `layout` object
    // (same inner function references, different container) as unchanged
    // through a shallow compare, when layout is meant to compare by
    // identity. Narrowing it to drop 'rotation' would make a fresh
    // by-value-equal rotation literal register as changed every time.
    it('compares layout by identity, not a shallow key-by-key match', () => {
      const stepTravel = () => 10
      const pose = () => ({}) as never
      const layoutA = { name: 'custom', stepTravel, pose }
      const layoutB = { name: 'custom', stepTravel, pose } // same fns, new container
      const handle = createAdapterHandle(baseOptions({ count: 3, layout: layoutA }))
      const container = document.createElement('div')
      handle.rootRef(container)
      const spy = vi.spyOn(handle.instance!, 'update')
      handle.setOptions(baseOptions({ count: 3, layout: layoutB }))
      expect(spy).toHaveBeenCalledWith({ layout: layoutB })
      handle.rootRef(null)
    })

    it('does not call update for a fresh rotation object literal with equal values', () => {
      const handle = createAdapterHandle(baseOptions({ count: 3, rotation: { maxRotation: 16 } }))
      const container = document.createElement('div')
      handle.rootRef(container)
      const spy = vi.spyOn(handle.instance!, 'update')
      handle.setOptions(baseOptions({ count: 3, rotation: { maxRotation: 16 } }))
      expect(spy).not.toHaveBeenCalled()
      handle.rootRef(null)
    })

    // Regression coverage for the initial `teardownPending` value. Note:
    // this does NOT kill the BooleanLiteral mutant on its declaration
    // (`false` -> `true`), which is equivalent: every real mount path
    // (rootRef with a genuinely different, non-null element) calls
    // cancelTeardown() first, which unconditionally resets teardownPending
    // to false before instance and container are both set, so the mutated
    // initial value is always overwritten before anything reads it.
    it('does not start with a teardown already pending', () => {
      const handle = createAdapterHandle(baseOptions({ count: 3, threshold: 0.5 }))
      const container = document.createElement('div')
      handle.rootRef(container)
      const spy = vi.spyOn(handle.instance!, 'update')
      handle.setOptions(baseOptions({ count: 3 }))
      expect(spy).toHaveBeenCalled()
      handle.rootRef(null)
    })

    // Mutant (ConditionalExpression, refreshPreMount's `carryIndex ===
    // undefined ? options : { ...options, startIndex: carryIndex }` forced
    // to always take the carried branch): before anything has ever carried a
    // position, refreshPreMount must use the configured options untouched,
    // not overwrite a real configured startIndex with the (still undefined)
    // carry.
    it('keeps the configured startIndex in the pre-mount snapshot before anything has carried a position', () => {
      const handle = createAdapterHandle(baseOptions({ count: 5, startIndex: 3 }))
      // Still unmounted: this setOptions call runs refreshPreMount() with
      // carryIndex still undefined.
      handle.setOptions(baseOptions({ count: 5, startIndex: 3 }))
      expect(handle.getSnapshot().activeIndex).toBe(3)
    })

    // Mutants (UpdateOperator x2, on cancelTeardown's `teardownToken++` and
    // the null-branch's `const token = ++teardownToken`): the invalidation
    // token only has to differ from whatever a cancelled schedule captured.
    // Flipping either increment to a decrement makes the counter oscillate
    // between the same two values on an alternating schedule/cancel/schedule
    // sequence, so a token minted for an earlier, since-cancelled teardown
    // collides with the final, genuinely-pending one and both bodies run.
    it('does not resurrect a cancelled teardown through token reuse after schedule/cancel/schedule', async () => {
      const handle = createAdapterHandle(baseOptions({ count: 3 }))
      const container = document.createElement('div')
      handle.rootRef(container)
      const listener = vi.fn()
      handle.subscribe(listener)

      handle.rootRef(null) // schedules a teardown, later cancelled
      handle.rootRef(container) // cancels it
      handle.rootRef(null) // schedules the real, uncancelled teardown

      listener.mockClear()
      await Promise.resolve()
      await Promise.resolve()

      expect(handle.instance).toBeNull()
      // Exactly one teardown actually ran. A resurrected, cancelled one
      // would notify a second time for what should be a single transition.
      expect(listener).toHaveBeenCalledTimes(1)
    })

    // NoCoverage: cardRef's returned callback is never itself invoked by any
    // existing test (only cardRef() being called and returning a stable
    // function is checked).
    it('cardRef returns a ref callback that actually registers and unregisters', () => {
      const handle = createAdapterHandle(baseOptions({ count: 3 }))
      const container = document.createElement('div')
      handle.rootRef(container)
      const el = document.createElement('div')
      const ref = handle.cardRef(0)
      ref(el)
      expect(el.style.transform).not.toBe('')
      const spy = vi.spyOn(handle.instance!, 'registerNode')
      ref(null)
      expect(spy).toHaveBeenCalledWith(0, null)
      handle.rootRef(null)
    })

    // NoCoverage: subscribe()'s own returned unsubscribe is never called by
    // any existing test.
    it('subscribe returns a working unsubscribe', () => {
      const handle = createAdapterHandle(baseOptions({ count: 3 }))
      const fn = vi.fn()
      const off = handle.subscribe(fn)
      const container = document.createElement('div')
      handle.rootRef(container)
      expect(fn).toHaveBeenCalled()
      fn.mockClear()
      off()
      handle.next()
      expect(fn).not.toHaveBeenCalled()
      handle.rootRef(null)
    })

    // NoCoverage: prev() is never called by any existing adapter test.
    it('prev() delegates to the live instance', () => {
      const { handle } = mountThree()
      handle.goTo(1, { animate: false })
      expect(handle.getSnapshot().activeIndex).toBe(1)
      handle.prev()
      expect(handle.getSnapshot().activeIndex).toBe(0)
      handle.rootRef(null)
    })

    // Regression coverage for unregisterCard's element-match guard (already
    // fully covered against mutation by the keyed-reorder tests above).
    it('does nothing when unregistering an index that does not currently hold that element', () => {
      const { handle, a } = mountThree()
      const spy = vi.spyOn(handle.instance!, 'registerNode')
      const stray = document.createElement('div')
      handle.unregisterCard(0, stray) // `a`, not `stray`, is at index 0
      expect(spy).not.toHaveBeenCalled()
      // `a` is still tracked and still receives writes.
      handle.goTo(1, { animate: false })
      expect(a.style.transform).not.toBe('')
      handle.rootRef(null)
    })

    // Regression coverage for setOptions's guard while a teardown is
    // pending. Note: this does NOT kill the two line-299 mutants (the
    // ConditionalExpression forcing `!instance` to `false`, and the
    // LogicalOperator tightening `||` to `&&`). Both are equivalent given an
    // invariant that holds everywhere in this module: `instance` and
    // `container` are always both null or both non-null at any point
    // external code can observe them (attach() and the teardown microtask
    // always set/clear them together; the only moment they could differ is
    // mid-synchronous-call, never between two top-level calls). Since
    // `!instance` and `!container` are therefore always equal at the point
    // this guard runs, `A || B` and `A && B` produce the same result, and
    // forcing just `A` to `false` leaves `B` carrying the identical signal.
    it('defers a setOptions call while a teardown is pending, storing it instead of syncing', async () => {
      const { handle, container } = mountThree()
      handle.rootRef(null) // schedules the pending teardown
      const spy = vi.fn()
      const before = handle.instance
      const updateSpy = vi.spyOn(before!, 'update')
      handle.setOptions(baseOptions({ count: 3, threshold: 0.9 }))
      // Still pending: must not have synced onto the doomed instance.
      expect(updateSpy).not.toHaveBeenCalled()
      handle.rootRef(container) // cancels the teardown, same element
      expect(handle.instance).toBe(before)
      // The stored options now apply through the cancellation's own sync().
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ threshold: 0.9 }))
      spy.mockClear()
      handle.rootRef(null)
    })

    // Mutant (CallExpression, sync()'s rebuild branch `notify()` removed):
    // the existing axis-rebuild tests deliberately clear their listener mock
    // right after the rebuild and prove wiring with a later change instead
    // (see "keeps an on() listener bound across an axis rebuild, and
    // unsubscribes cleanly" above), so none of them observe the rebuild's
    // own notify() call.
    it('notifies subscribers synchronously when a rebuild happens via setOptions', () => {
      const { handle } = mountThree()
      const listener = vi.fn()
      handle.subscribe(listener)
      listener.mockClear()
      handle.setOptions(baseOptions({ count: 3, axis: 'y' }))
      expect(listener).toHaveBeenCalled()
      handle.rootRef(null)
    })

    // Mutant (ConditionalExpression / EqualityOperator on line 216's
    // `key === 'axis' || key === 'startIndex'` skip): axis can never
    // actually differ at this point (a real axis change already took the
    // rebuild branch above and returned), so only startIndex's half of this
    // skip is observable. startIndex has no entry in riffle.ts's
    // updateHandlers table at all, so if it slips into the diff instead of
    // being skipped, sync() calls instance.update() for a change that has
    // nothing to apply.
    it('never calls update() for a startIndex-only change after construction', () => {
      const { handle } = mountThree()
      const spy = vi.spyOn(handle.instance!, 'update')
      handle.setOptions(baseOptions({ count: 3, startIndex: 1 }))
      expect(spy).not.toHaveBeenCalled()
      handle.rootRef(null)
    })

    // Mutant (CallExpression, rootRef's `cancelTeardown()` removed on the
    // "genuinely different element" branch): without it, a teardown a prior
    // rootRef(null) scheduled for the OLD element is still live and fires
    // later, tearing down the engine that was just attached to the new one.
    it('invalidates a pending teardown when a genuinely different element replaces the current one', async () => {
      const handle = createAdapterHandle(baseOptions({ count: 3 }))
      const first = document.createElement('div')
      const second = document.createElement('div')
      handle.rootRef(first)
      handle.rootRef(null) // schedules a teardown for `first`
      handle.rootRef(second) // must cancel that pending teardown
      const instanceOnSecond = handle.instance
      expect(instanceOnSecond).not.toBeNull()

      await Promise.resolve()
      await Promise.resolve()

      expect(handle.instance).toBe(instanceOnSecond)
      expect(second.querySelector('[aria-live]')).not.toBeNull()
    })

    // Mutant (ConditionalExpression, registerCard's `nodes.get(index) ===
    // el` fast path forced to `false`): re-registering the identical element
    // at the same index must not call the engine's registerNode() again.
    it('does not re-register a card with the engine when the same element returns at the same index', () => {
      const { handle, a } = mountThree()
      const spy = vi.spyOn(handle.instance!, 'registerNode')
      handle.registerCard(0, a)
      expect(spy).not.toHaveBeenCalled()
      handle.rootRef(null)
    })

    // Mutant (CallExpression, unregisterCard's `nodes.delete(index)`
    // removed): without it, the adapter's own tracking still believes the
    // element is registered, so a later registerCard() with the same
    // element hits the fast path above and never reaches the engine again.
    it('clears its own tracking on unregister, so a later re-register with the same element still reaches the engine', () => {
      const { handle, a } = mountThree()
      handle.unregisterCard(0, a)
      a.style.transform = ''
      handle.registerCard(0, a)
      expect(a.style.transform).not.toBe('')
      handle.rootRef(null)
    })

    // Mutant (CallExpression, setOptions's `refreshPreMount()` removed):
    // observable only while unmounted, where getSnapshot() reads `preMount`
    // directly instead of a live instance.
    it('recomputes the pre-mount snapshot when options change while unmounted', () => {
      const handle = createAdapterHandle(baseOptions({ count: 3, startIndex: 0 }))
      expect(handle.getSnapshot().activeIndex).toBe(0)
      handle.setOptions(baseOptions({ count: 3, startIndex: 2 }))
      expect(handle.getSnapshot().activeIndex).toBe(2)
    })

    // Mutant (CallExpression, setOptions's `notify()` removed from its
    // unmounted/pending early-return branch): subscribers must hear about a
    // pre-mount snapshot change even though there is no live instance yet.
    it('notifies subscribers when options change while unmounted', () => {
      const handle = createAdapterHandle(baseOptions({ count: 3, startIndex: 0 }))
      const listener = vi.fn()
      handle.subscribe(listener)
      listener.mockClear()
      handle.setOptions(baseOptions({ count: 3, startIndex: 1 }))
      expect(listener).toHaveBeenCalled()
    })

    // Mutant (CallExpression, on()'s unsubscribe closure `registrations.
    // delete(reg)` removed): without it, an unsubscribed registration stays
    // in the tracked set, so a later rebuild's `for (const reg of
    // registrations) bindRegistration(reg)` resurrects it on the new
    // instance.
    it('actually removes a registration from tracking on unsubscribe, so a later rebuild does not resurrect it', () => {
      const { handle } = mountThree()
      const fn = vi.fn()
      const off = handle.on('change', fn)
      off()
      handle.setOptions(baseOptions({ count: 3, axis: 'y' })) // rebuild
      handle.next()
      expect(fn).not.toHaveBeenCalled()
      handle.rootRef(null)
    })
  })
})
