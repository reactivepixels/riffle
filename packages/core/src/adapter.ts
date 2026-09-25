import { createRiffle, type Riffle } from './riffle'
import { initialSnapshot } from './snapshot'
import { shallowEqual } from './store'
import type { RiffleEventMap, RiffleOptions, RiffleSnapshot } from './types'

/**
 * The framework-agnostic glue behind every Riffle adapter (React's
 * `useRiffle`, Vue's `useRiffle` and its directives): builds and tears down
 * the engine as `rootRef`/`registerCard` attach and detach elements, and
 * diffs option objects into `update()` calls so a framework never has to.
 *
 * @example
 * ```ts
 * import { createAdapterHandle } from '@rpxl/riffle'
 *
 * const handle = createAdapterHandle({ count: 5, cardWidth: 300, cardHeight: 400 })
 * const stack = document.querySelector<HTMLElement>('#stack')
 * handle.rootRef(stack)
 * const el = document.querySelector<HTMLElement>('#card-0')
 * if (el) handle.registerCard(0, el)
 * handle.next()
 * ```
 */
export interface AdapterHandle {
  /** The live engine, or null before the container mounts and after it unmounts. */
  readonly instance: Riffle | null
  /**
   * Attach to the container, or pass null to detach. Stable identity; safe to
   * call repeatedly. A null call does not tear the engine down immediately:
   * it defers teardown by one microtask, and if `rootRef` is called again
   * with the same element before that microtask runs, the pending teardown
   * is cancelled and the live engine is kept. This makes a
   * null-then-same-element round trip within one tick, such as React's
   * StrictMode double-invoking ref callbacks at mount, or an inline ref
   * callback that recreates on every render, a no-op rather than a
   * destroy-and-rebuild.
   *
   * Call it with null before moving to a different element, as React and Vue
   * both do. A different element tears the old engine down synchronously
   * (including one whose teardown is pending) and attaches a fresh one.
   *
   * While a teardown is pending, setOptions only stores the options. If the
   * same element returns, they are applied then (rebuilding if they need
   * it); if the teardown runs, the next attach builds with them.
   */
  readonly rootRef: (el: HTMLElement | null) => void
  /**
   * A stable ref callback for the card at `index`. Relies on the framework
   * detaching every changed ref before attaching any, which React guarantees.
   * Frameworks that process refs one node at a time should use
   * registerCard and unregisterCard instead.
   */
  cardRef(index: number): (el: HTMLElement | null) => void
  /** Registers the element for the card at `index`, same as calling `cardRef(index)` with it. */
  registerCard(index: number, el: HTMLElement): void
  /** Only unregisters if `el` is still the element registered at `index`. */
  unregisterCard(index: number, el: HTMLElement): void
  /**
   * Apply changed options. Diffs against the previous set and calls the
   * engine's update() with only what changed. An axis change, or a card
   * dimension crossing between a number and 'auto', rebuilds the engine and
   * keeps position. `startIndex` is read only when an engine is first built.
   */
  setOptions(next: RiffleOptions): void
  /** Notified whenever `getSnapshot()` would return a new value. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Referentially stable while nothing has changed, including across mount. */
  getSnapshot(): RiffleSnapshot
  /** Subscribes to one engine event. Returns an unsubscribe function; a no-op while unmounted. */
  on<K extends keyof RiffleEventMap>(event: K, fn: (payload: RiffleEventMap[K]) => void): () => void
  /** Advances to the next card, animated. A no-op while unmounted. */
  next(): void
  /** Moves to the previous card, animated. A no-op while unmounted. */
  prev(): void
  /** Moves to `index`, animated unless `opts.animate` is false. A no-op while unmounted. */
  goTo(index: number, opts?: { animate?: boolean }): void
}

type AnyListener = (payload: never) => void

/**
 * One `on()` call's own record. Keying listeners by function identity in a
 * Set or Map would collapse the same function subscribed twice into one
 * entry, so one unsubscribe would remove both (the engine's own
 * Registration in riffle.ts avoids the same trap). Every call to `on()` gets its own
 * record here, independent of whether the same function was passed before,
 * so an unsubscribe removes exactly the registration it closed over, both in
 * this registry and on the live instance.
 */
interface EventRegistration {
  event: keyof RiffleEventMap
  fn: AnyListener
  /** This registration's unsubscribe on the live instance, or null while unmounted. */
  off: (() => void) | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * `spring` and `rotation` compare shallowly when both
 * sides are plain objects, so an inline `spring={{ stiffness: 300, damping:
 * 30 }}` prop does not call `update` on every render just because the
 * framework handed it a fresh object literal with the same values. `layout`
 * and `getLabel` (and every other option) compare by identity; callers are
 * expected to memoise those.
 */
function optionChanged(key: keyof RiffleOptions, prev: unknown, next: unknown): boolean {
  if ((key === 'spring' || key === 'rotation') && isPlainObject(prev) && isPlainObject(next)) {
    return !shallowEqual(prev, next)
  }
  return prev !== next
}

/** True when `a` and `b` sit on opposite sides of the number versus 'auto' line. */
function crossesAuto(a: number | 'auto' | undefined, b: number | 'auto' | undefined): boolean {
  return (a === 'auto') !== (b === 'auto')
}

/**
 * Changes the engine cannot apply through update(), because they are wired up
 * once at construction: the axis, and a card dimension crossing between a
 * number and 'auto' (measurement is attached or not at construction). The
 * handle rebuilds for these and keeps position.
 */
function needsRebuild(prev: RiffleOptions, next: RiffleOptions): boolean {
  return (
    (next.axis ?? 'x') !== (prev.axis ?? 'x') ||
    crossesAuto(prev.cardWidth, next.cardWidth) ||
    crossesAuto(prev.cardHeight, next.cardHeight)
  )
}

/**
 * Builds an {@link AdapterHandle}: the piece every framework binding wraps
 * to drive the engine from `rootRef`/`registerCard` calls instead of talking
 * to `createRiffle` directly. `initial` seeds the pre-mount snapshot; the
 * engine itself is not built until `rootRef` attaches a container.
 *
 * @example
 * ```ts
 * import { createAdapterHandle } from '@rpxl/riffle'
 *
 * const handle = createAdapterHandle({ count: 5 })
 * ```
 */
export function createAdapterHandle(initial: RiffleOptions): AdapterHandle {
  let options = initial
  /** The options the live instance was built with or last synced to. */
  let applied = initial
  let instance: Riffle | null = null
  let container: HTMLElement | null = null
  let carryIndex: number | undefined
  let preMount = initialSnapshot(options)
  let lastReturned: RiffleSnapshot | null = null
  let storeOff: () => void = () => {}
  /**
   * `rootRef(null)` does not tear the engine down synchronously. React 19
   * StrictMode double-invokes ref callbacks at mount (attach, then a simulated
   * unmount: null, then the same element again), and an inline consumer ref
   * (`ref={(el) => ...}`) recreates the composed ref on every render, which
   * makes a framework detach the old ref and attach the new one to the same
   * DOM node on every render. Both land here as `rootRef(null)` followed, in
   * the same tick, by `rootRef` with the identical element. Destroying and
   * recreating the engine on that round trip would kill an in-flight drag and
   * rebuild on every render, so a null call only schedules the teardown, on
   * the next microtask, and `container` keeps pointing at the outgoing element
   * until that microtask runs.
   *
   * `teardownPending` is true from that null call until the teardown runs or
   * is cancelled. Only cancelTeardown() and the scheduled callback itself
   * clear it; attaching a fresh engine never does, so a rebuild cannot
   * silently cancel a teardown. The token makes a superseded or cancelled
   * schedule a safe no-op: only the closure created by the most recent null
   * call can act, and only if nothing has cancelled it since.
   */
  let teardownToken = 0
  let teardownPending = false

  const nodes = new Map<number, HTMLElement>()
  const cardRefs = new Map<number, (el: HTMLElement | null) => void>()
  const subscribers = new Set<() => void>()
  // Every live `on()` registration, across every event, in insertion order.
  // Not keyed by event or by function: see EventRegistration above.
  const registrations = new Set<EventRegistration>()

  const notify = (): void => {
    for (const fn of [...subscribers]) fn()
  }

  /** The snapshot reported while unmounted: the carried position, else startIndex. */
  function refreshPreMount(): void {
    preMount = initialSnapshot(
      carryIndex === undefined ? options : { ...options, startIndex: carryIndex },
    )
  }

  function bindRegistration(reg: EventRegistration): void {
    if (!instance) return
    reg.off = instance.on(reg.event, reg.fn as never)
  }

  function cancelTeardown(): void {
    teardownToken++
    teardownPending = false
  }

  function attach(el: HTMLElement): void {
    const start = carryIndex ?? options.startIndex
    instance = createRiffle(el, start === undefined ? options : { ...options, startIndex: start })
    applied = options
    for (const [index, node] of nodes) instance.registerNode(index, node)
    storeOff = instance.subscribe(notify)
    for (const reg of registrations) bindRegistration(reg)
  }

  function detach(): void {
    if (!instance) return
    carryIndex = instance.getSnapshot().activeIndex
    refreshPreMount()
    storeOff()
    storeOff = () => {}
    // Unbind every registration from the outgoing instance, but keep the
    // registration itself: a rebuild reattaches it to the new instance in
    // the next attach() call, and unsubscribe removes it from
    // `registrations` regardless of whether it is currently bound.
    for (const reg of registrations) {
      reg.off?.()
      reg.off = null
    }
    instance.destroy()
    instance = null
  }

  /** Bring the live instance up to date with `options`: rebuild, update, or nothing. */
  function sync(): void {
    if (!instance || !container || applied === options) return
    const prev = applied
    const next = options
    if (needsRebuild(prev, next)) {
      const el = container
      detach()
      attach(el)
      notify()
      return
    }
    applied = next
    const changed: Record<string, unknown> = {}
    let any = false
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<keyof RiffleOptions>
    for (const key of keys) {
      if (key === 'axis' || key === 'startIndex') continue
      if (optionChanged(key, prev[key], next[key])) {
        changed[key] = next[key]
        any = true
      }
    }
    if (any) instance.update(changed as Partial<RiffleOptions>)
  }

  const rootRef = (el: HTMLElement | null): void => {
    if (el === container) {
      // Re-attached to the element already recorded as current: cancel
      // whatever teardown a preceding null call scheduled, if any, keep the
      // live engine, and apply any options that arrived while it was
      // pending.
      if (teardownPending) {
        cancelTeardown()
        sync()
      }
      return
    }
    if (el === null) {
      // Defer: `container` stays as the outgoing element (see the field
      // comment above) so a same-element re-attach above still takes the
      // fast path. Only tear down if nothing cancels or supersedes this by
      // the next microtask.
      const token = ++teardownToken
      teardownPending = true
      queueMicrotask(() => {
        if (token !== teardownToken) return
        teardownPending = false
        detach()
        container = null
        notify()
      })
      return
    }
    // A genuinely different, non-null element: tear down whatever is live
    // (including one whose teardown was merely pending) immediately and
    // attach fresh with the current options.
    cancelTeardown()
    detach()
    container = el
    attach(el)
    notify()
  }

  const handle: AdapterHandle = {
    get instance() {
      return instance
    },
    rootRef,
    cardRef(index) {
      let ref = cardRefs.get(index)
      if (!ref) {
        ref = (el) => {
          if (el) {
            handle.registerCard(index, el)
          } else {
            const current = nodes.get(index)
            if (current) handle.unregisterCard(index, current)
          }
        }
        cardRefs.set(index, ref)
      }
      return ref
    },
    registerCard(index, el) {
      if (nodes.get(index) === el) return
      nodes.set(index, el)
      instance?.registerNode(index, el)
    },
    unregisterCard(index, el) {
      if (nodes.get(index) !== el) return
      nodes.delete(index)
      instance?.registerNode(index, null)
    },
    setOptions(next) {
      options = next
      refreshPreMount()
      // While unmounted, or while a teardown is pending, only store the
      // options: the next attach builds with them, a same-element return
      // syncs them, and a teardown that runs makes them moot.
      if (!instance || !container || teardownPending) {
        notify()
        return
      }
      sync()
    },
    subscribe(listener) {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    getSnapshot() {
      const next = instance ? instance.getSnapshot() : preMount
      if (lastReturned && shallowEqual(lastReturned, next)) return lastReturned
      lastReturned = next
      return next
    },
    on(event, fn) {
      const reg: EventRegistration = { event, fn: fn as AnyListener, off: null }
      registrations.add(reg)
      bindRegistration(reg)
      return () => {
        if (!registrations.has(reg)) return
        registrations.delete(reg)
        reg.off?.()
        reg.off = null
      }
    },
    next() {
      instance?.next()
    },
    prev() {
      instance?.prev()
    },
    goTo(index, opts) {
      instance?.goTo(index, opts)
    },
  }
  return handle
}
