import { browserClock, createLoop, type Clock } from './animation/loop'
import {
  DEFAULT_SPRING,
  SPRING_PRESETS,
  isSettled,
  resolveSpring,
  springStep,
  type SpringState,
} from './animation/spring'
import { createA11y, formatCardLabel } from './a11y'
import { RiffleError } from './errors'
import { decideCommit } from './gesture/commit'
import { attachPointer } from './gesture/pointer'
import { createVelocityTracker } from './gesture/velocity'
import { attachKeyboard } from './keyboard'
import { observeSize } from './measure'
import { createPose, fan } from './layout/fan'
import { computeRotation, resolveRotation, type RotationInput } from './math/rotation'
import { wrap } from './math/wrap'
import { applyPose } from './render/transform'
import { createStore } from './store'
import type {
  Bounds,
  LayoutGeometry,
  LayoutStrategy,
  Pose,
  ReducedMotionMode,
  RiffleEventMap,
  RiffleOptions,
  RiffleSnapshot,
  RotationOptions,
  SpringConfig,
  SpringPreset,
} from './types'

/**
 * A live Riffle instance, returned by `createRiffle`. Framework-agnostic:
 * everything here works against plain `HTMLElement`s and callbacks, which is
 * what every adapter (`@rpxl/riffle/react`, `@rpxl/riffle/vue`) builds on.
 *
 * @example
 * ```ts
 * import { createRiffle } from '@rpxl/riffle'
 *
 * const stack = document.getElementById('stack')!
 * const riffle = createRiffle(stack, { count: 5, cardWidth: 300, cardHeight: 400 })
 * riffle.registerNode(0, stack.children[0] as HTMLElement)
 * riffle.next()
 * ```
 */
export interface Riffle {
  /** Advances to the next card, with the spring's animation. */
  next(): void
  /** Moves to the previous card, with the spring's animation. */
  prev(): void
  /** Moves to `index`, animated unless `opts.animate` is false. */
  goTo(index: number, opts?: { animate?: boolean }): void
  /** Registers (or, passed `null`, unregisters) the element for card `index`. */
  registerNode(index: number, el: HTMLElement | null): void
  /** Changes how many cards are in the stack, clamping the active card if needed. */
  setCount(n: number): void
  /** Applies changed options. A key present with the value `undefined` resets that option to its default. */
  update(opts: Partial<RiffleOptions>): void
  /** Detaches every listener and observer and clears the inline styles this instance wrote. */
  destroy(): void
  /** Notified whenever `getSnapshot()` would return a new value. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void
  /** The current discrete state. Referentially stable while nothing has changed. */
  getSnapshot(): RiffleSnapshot
  /** Subscribes to one engine event. Returns an unsubscribe function. */
  on<K extends keyof RiffleEventMap>(event: K, fn: (payload: RiffleEventMap[K]) => void): () => void
  /**
   * Continuous position in cards. Raw and unbounded under `bounds: 'loop'`:
   * its rounded value mod `count` is the active card. Meaningful at any time.
   * High-frequency, so it is a getter and never part of the snapshot.
   */
  readonly position: number
  /**
   * Pixels the pointer has travelled along the main axis while dragging, 0
   * otherwise. Not part of the snapshot.
   */
  readonly dragOffset: number
  /**
   * Signed fraction of one step the current drag has covered, 0 when not
   * dragging. Not part of the snapshot.
   */
  readonly progress: number
  /**
   * Positions per second, signed like `position`. While dragging, the
   * pointer's velocity over the tracker's window; after release, the spring's
   * velocity, which starts from the release velocity so the value is
   * continuous across release; 0 at rest. Not part of the snapshot.
   */
  readonly velocity: number
}

/**
 * `clock` is injectable so tests can drive frames without rAF. Deliberately
 * not exported: createRiffle's public signature is RiffleOptions
 * only, so this test-only hook never becomes part of the published
 * `dist/index.d.ts` contract with an unnameable parameter type.
 */
interface InternalOptions extends RiffleOptions {
  clock?: Clock
}

/** A registered event handler, erased to its payload-agnostic shape. */
type Listener = (payload: never) => void

/**
 * One subscription's record. Giving each `on()` call its own
 * record (rather than removing by function identity) is what makes an
 * unsubscribe remove exactly the registration it closed over, even when the
 * same function was subscribed more than once.
 */
interface Registration {
  fn: Listener
  active: boolean
}

/** Per-event listener storage. Never replaced; compaction rewrites it in place. */
interface Bucket {
  regs: Array<Registration | null>
  /** Emit depth for THIS event only (an earlier design used a single counter shared across all events). */
  depth: number
  /** True once a slot has been tombstoned and not yet compacted. */
  dirty: boolean
}

// Shared across both call sites (here and setCount) so the message exists
// once in the bundle rather than twice. RiffleError messages are not part
// of the API (see errors.ts): consumers branch on `code`, never on text.
const INVALID_COUNT_MESSAGE = 'count must be a non-negative integer'

function invalidOption(message: string): never {
  throw new RiffleError('INVALID_OPTION', message)
}

function isPositive(x: number): boolean {
  return Number.isFinite(x) && x > 0
}

function assertOptions(o: RiffleOptions): void {
  if (!Number.isInteger(o.count) || o.count < 0) {
    throw new RiffleError('INVALID_COUNT', INVALID_COUNT_MESSAGE)
  }
  // Every range check is written as `!(in range)`, so NaN, which fails
  // every comparison, is rejected rather than slipping through.
  if (o.threshold !== undefined && !(o.threshold > 0 && o.threshold <= 1)) {
    invalidOption('threshold must be in (0, 1]')
  }
  if (o.crossFollow !== undefined && !(o.crossFollow >= 0 && o.crossFollow <= 1)) {
    invalidOption('crossFollow must be in [0, 1]')
  }
  if (o.flingVelocity !== undefined && !isPositive(o.flingVelocity)) {
    invalidOption('flingVelocity must be finite and > 0')
  }
  if (o.maxVisible !== undefined && !(Number.isInteger(o.maxVisible) && o.maxVisible >= 1)) {
    invalidOption('maxVisible must be an integer >= 1')
  }
  const spring = o.spring
  // An unknown preset name from a plain-JS caller (a cast
  // bypassing the SpringPreset union, or an unvalidated framework prop)
  // otherwise resolves to `undefined` in resolveSpring and throws on the
  // first animation frame instead of here, at the point the bad value was
  // actually supplied.
  if (typeof spring === 'string' && !(spring in SPRING_PRESETS)) {
    invalidOption(`unknown spring preset: ${spring}`)
  }
  // A zero stiffness or damping never settles, so the frame loop would run
  // forever.
  if (typeof spring === 'object' && !(isPositive(spring.stiffness) && isPositive(spring.damping))) {
    invalidOption('spring stiffness and damping must be finite and > 0')
  }
  // startIndex was never validated before, so an out-of-range or fractional
  // value silently produced an inconsistent starting snapshot.
  if (o.startIndex !== undefined && !Number.isInteger(o.startIndex)) {
    invalidOption('startIndex must be an integer')
  }
  // cardWidth/cardHeight/gap feed directly into stepTravel()'s
  // denominator. A negative or non-finite value (e.g. a measured width of
  // 0/0 passed before first paint) poisons every position calculation with
  // NaN/Infinity, and the loop never settles because isSettled compares
  // against it. 'auto' is a valid non-numeric value and is left alone here.
  if (typeof o.cardWidth === 'number' && !(Number.isFinite(o.cardWidth) && o.cardWidth >= 0)) {
    invalidOption('cardWidth must be finite and >= 0')
  }
  if (typeof o.cardHeight === 'number' && !(Number.isFinite(o.cardHeight) && o.cardHeight >= 0)) {
    invalidOption('cardHeight must be finite and >= 0')
  }
  if (o.gap !== undefined && !(Number.isFinite(o.gap) && o.gap >= 0)) {
    invalidOption('gap must be finite and >= 0')
  }
  // getLabel feeds card aria-labels and
  // announcements directly, so anything other than a function fails loudly
  // here rather than producing a confusing aria-label at update time.
  if (o.getLabel !== undefined && typeof o.getLabel !== 'function') {
    invalidOption('getLabel must be a function')
  }
}

/**
 * cardWidth/cardHeight can only ever be re-applied within the mode chosen at
 * construction: a number resets to another number, 'auto' stays 'auto'
 * (there is no numeric default once measurement owns the value), and
 * crossing between the two throws, because measurement is wired up once, at
 * construction. Validation only; mutation happens separately once every key
 * in an update() call has passed this check, so a bad key never leaves
 * another option half-applied.
 */
function checkDimensionToggle(
  raw: number | 'auto' | undefined,
  isAuto: boolean,
  key: 'cardWidth' | 'cardHeight',
): void {
  if (isAuto) {
    if (raw !== undefined && raw !== 'auto') {
      invalidOption(`${key} cannot switch from 'auto' after construction`)
    }
  } else if (raw === 'auto') {
    invalidOption(`${key} cannot switch to 'auto' after construction`)
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function computeReduced(mode: ReducedMotionMode): boolean {
  return mode === 'ignore' ? false : mode === 'respect' || prefersReducedMotion()
}

/**
 * Matches DOM EventTarget semantics for a throwing listener:
 * reported, never swallowed, and never allowed to stop the rest of dispatch.
 */
function reportListenerError(error: unknown): void {
  if (typeof globalThis.reportError === 'function') globalThis.reportError(error)
  else
    queueMicrotask(() => {
      throw error
    })
}

/**
 * `threshold`'s default: the fraction of one step a drag must cover, on
 * distance alone, to commit to the next or previous card, when
 * `RiffleOptions.threshold` is omitted.
 *
 * @example
 * ```ts
 * import { DEFAULT_THRESHOLD } from '@rpxl/riffle'
 *
 * const options = { count: 5, threshold: DEFAULT_THRESHOLD }
 * ```
 */
export const DEFAULT_THRESHOLD = 0.25

/**
 * `flingVelocity`'s default, in pixels per millisecond: the release speed
 * that commits a drag regardless of distance, when
 * `RiffleOptions.flingVelocity` is omitted.
 *
 * @example
 * ```ts
 * import { DEFAULT_FLING_VELOCITY } from '@rpxl/riffle'
 *
 * const options = { count: 5, flingVelocity: DEFAULT_FLING_VELOCITY }
 * ```
 */
export const DEFAULT_FLING_VELOCITY = 0.5

/**
 * `crossFollow`'s default: how much a card follows the pointer across the
 * drag axis while dragging, when `RiffleOptions.crossFollow` is omitted.
 *
 * @example
 * ```ts
 * import { DEFAULT_CROSS_FOLLOW } from '@rpxl/riffle'
 *
 * const options = { count: 5, crossFollow: DEFAULT_CROSS_FOLLOW }
 * ```
 */
export const DEFAULT_CROSS_FOLLOW = 0.18

/**
 * One defaults record shared by construction and by
 * update()'s "a key present with the value undefined resets that option to
 * its default" rule, so the two can never drift. spring, rotation and
 * layout are not scalars and keep their own default constants/factories
 * (DEFAULT_SPRING, `{}` through resolveRotation, and DEFAULT_LAYOUT below).
 * `threshold`, `flingVelocity` and `crossFollow` read the exported
 * constants above rather than repeating the numbers, so the engine's own
 * defaults and the published constants can never drift apart.
 */
const DEFAULTS: {
  gap: number
  maxVisible: number
  bounds: Bounds
  threshold: number
  flingVelocity: number
  crossFollow: number
  draggable: boolean
  reducedMotion: ReducedMotionMode
} = {
  gap: 20,
  maxVisible: 4,
  bounds: 'loop',
  threshold: DEFAULT_THRESHOLD,
  flingVelocity: DEFAULT_FLING_VELOCITY,
  crossFollow: DEFAULT_CROSS_FOLLOW,
  draggable: true,
  reducedMotion: 'auto',
}

/**
 * update()'s default layout when a caller resets `layout` to undefined: the
 * library's own fan, not whatever the constructor happened to receive.
 * Stateless (pose() writes into the caller's `out` argument, never into
 * anything captured here), so one instance is safe to share.
 */
const DEFAULT_LAYOUT: LayoutStrategy = fan()

/**
 * update()'s per-option table. Each entry knows how to apply an
 * already-validated value, and what its own default is for the
 * undefined-resets-to-default rule, so every option's semantics live in one
 * place instead of a long if chain. Method shorthand (not an arrow-typed
 * property) is deliberate: TypeScript checks method parameters
 * bivariantly, which is what lets entries with genuinely different value
 * types share one table without an `apply(value: any)` at every entry.
 */
interface UpdateHandler<T> {
  default: T
  apply(value: T): void
}

/**
 * Builds and attaches a Riffle engine to `container`. Register each card's
 * element with `registerNode` after this returns; nothing renders until at
 * least one card is registered.
 *
 * @example
 * ```ts
 * import { createRiffle } from '@rpxl/riffle'
 *
 * const stack = document.getElementById('stack')!
 * const riffle = createRiffle(stack, { count: 5, cardWidth: 300, cardHeight: 400 })
 * for (let i = 0; i < 5; i++) {
 *   const card = stack.appendChild(document.createElement('div'))
 *   riffle.registerNode(i, card)
 * }
 * riffle.next()
 * ```
 */
export function createRiffle(container: HTMLElement, options: RiffleOptions): Riffle {
  assertOptions(options)

  // The merged options as of the last successful construction or
  // update() call, kept only so update() always validates against the
  // instance's current state rather than the options object it was built
  // with. A field holding `undefined` here means "at its default", which is
  // exactly what assertOptions' own undefined-skips-validation checks
  // already treat as always-valid.
  let current: RiffleOptions = { ...options }

  let count = options.count
  let axis = options.axis ?? 'x'
  let bounds: Bounds = options.bounds ?? DEFAULTS.bounds
  let threshold = options.threshold ?? DEFAULTS.threshold
  let flingVelocity = options.flingVelocity ?? DEFAULTS.flingVelocity
  let crossFollow = options.crossFollow ?? DEFAULTS.crossFollow
  let draggable = options.draggable ?? DEFAULTS.draggable
  let layout = options.layout ?? fan()
  let spring = resolveSpring(options.spring)
  // Defaults resolved once here, not on every frame of a drag.
  let rotationOptions = options.rotation === false ? null : resolveRotation(options.rotation ?? {})
  let reducedMotionMode: ReducedMotionMode = options.reducedMotion ?? DEFAULTS.reducedMotion
  let reduced = computeReduced(reducedMotionMode)

  // The clock is hoisted here. Allocating `{ now: () => performance.now() }`
  // on every pointermove inline is wasted work on the
  // highest-frequency path in the engine. Read via a cast: the public
  // signature above is RiffleOptions, and `clock` is a test-only injection
  // point that is not part of the published contract.
  const clock = (options as InternalOptions).clock ?? browserClock()

  // Width and height are independent of axis; applyExtents alone
  // decides which one is the main (cardExtent) vs cross (crossExtent) axis.
  // An earlier version derived
  // crossExtent's fallback from cardWidth only inside the axis === 'y'
  // branch, so axis: 'y' with only cardWidth supplied never took that
  // branch and left cardExtent wrongly set to cardWidth.
  let width = typeof options.cardWidth === 'number' ? options.cardWidth : 300
  let height = typeof options.cardHeight === 'number' ? options.cardHeight : 400
  const autoWidth = options.cardWidth === 'auto'
  const autoHeight = options.cardHeight === 'auto'

  const geometry: LayoutGeometry = {
    cardExtent: 0,
    crossExtent: 0,
    gap: options.gap ?? DEFAULTS.gap,
    maxVisible: options.maxVisible ?? DEFAULTS.maxVisible,
    count,
  }

  function applyExtents(): void {
    geometry.cardExtent = axis === 'x' ? width : height
    geometry.crossExtent = axis === 'x' ? height : width
  }
  applyExtents()

  // An out-of-range startIndex under bounds: 'clamp' must not be able
  // to start the engine in a state its own canPrev/canNext already say is
  // invalid.
  const requestedStart = options.startIndex ?? 0
  const initialValue =
    bounds === 'clamp'
      ? Math.min(Math.max(requestedStart, 0), Math.max(count - 1, 0))
      : requestedStart
  const motion: SpringState = { value: initialValue, velocity: 0 }
  let target = motion.value
  let destroyed = false

  // Per-card scratch. Allocated once, mutated forever.
  const nodes = new Map<number, HTMLElement>()
  const poses = new Map<number, Pose>()
  const written = new Map<number, Pose>()

  let dragging = false
  let dragHome = 0
  let dragDeltaMain = 0
  let dragDeltaCross = 0
  let grabOffsetCross = 0

  const tracker = createVelocityTracker()
  // Arrays, not Sets. A Set forces emit() to copy into an array
  // (`[...set]`) on every call to get a stable iteration order, which
  // allocates on the drag path exactly like the reused drag payload below.
  //
  // Compaction must mutate the array in place,
  // never replace it. Rebuilding a fresh array and repointing the map entry
  // orphans every unsubscribe closure created before
  // that rebuild: they still hold the old array, so calling one after a
  // later compaction silently does nothing. Each event keeps exactly one
  // bucket for the instance's whole life; unsubscribe always looks its
  // registration up by identity in the live bucket from the map, never
  // through a captured reference.
  //
  // An earlier design shared one `emitting` counter across
  // every event and removed listeners by function identity. Both were real
  // defects. A listener that throws skipped `emitting -= 1`, wedging
  // compaction for the rest of the instance's life; an event only ever
  // emitted from inside another event's listener never saw the shared
  // counter reach zero, so it never compacted either; and removing by
  // function value meant unsubscribing one registration of a twice-
  // subscribed function could remove the other one instead. Each `on()` call
  // now gets its own `Registration` record, so identity is per subscription,
  // not per function, and each event's `Bucket` carries its own `depth` and
  // `dirty` flag, so reentrancy in one event cannot starve or corrupt
  // another's compaction.
  const listeners = new Map<keyof RiffleEventMap, Bucket>()
  // A mutable record, not a snapshot of options.getLabel taken at
  // construction. update({ getLabel }) rewrites this same object's field, so
  // a11y.ts's per-call `config.getLabel` read (and the announce call in
  // syncActive below) both pick up a change immediately, with nothing else
  // in this module ever reading the stale `options.getLabel` again.
  const a11yConfig = { axis, getLabel: options.getLabel }
  const a11y = createA11y(container, a11yConfig)

  // One payload object, reused every frame of a drag. The `drag` event's
  // contract says "payload is reused, do not retain it" -- allocating a
  // fresh object per pointermove would both contradict that and cost real
  // garbage on the highest-frequency path.
  const dragPayload = { progress: 0, offset: 0 }

  // computeRotation's input, filled in place every frame of a drag
  // rather than allocated as a fresh literal per card per frame.
  const rotationInput: RotationInput = {
    progress: 0,
    grabOffsetCross: 0,
    crossExtent: 0,
    deltaMain: 0,
    deltaCross: 0,
  }

  function assertAlive(): void {
    if (destroyed) throw new RiffleError('DESTROYED', 'instance already destroyed')
  }

  function activeIndexOf(value: number): number {
    if (count === 0) return 0
    const rounded = Math.round(value)
    return ((rounded % count) + count) % count
  }

  // Iterates a plain array by index, with the length captured before the
  // loop starts, so emit() allocates nothing (no Set copy, no iterator).
  //
  // Semantics divergence from the store: the store snapshots its listener
  // list before every notification (Redux semantics), so unsubscribing
  // during a notification still lets that round finish as originally
  // scheduled. emit() does not: it follows
  // DOM EventTarget semantics instead, where removing a listener during
  // dispatch prevents it from running if it has not been called yet.
  // Nested compaction (below) is what makes this array-shifting-free rather
  // than an allocation-per-call snapshot. The store can afford a copy
  // because it only notifies on discrete, infrequent changes; emit() carries
  // `drag` on every pointer move and must not allocate there. Listener
  // storage is per event, each with its own emit depth, so
  // reentrancy across different events (one event emitted only from inside
  // another's listener) cannot starve that event's compaction.
  function emit<K extends keyof RiffleEventMap>(event: K, payload: RiffleEventMap[K]): void {
    const bucket = listeners.get(event)
    if (!bucket) return
    const regs = bucket.regs
    const length = regs.length
    bucket.depth += 1
    try {
      for (let i = 0; i < length; i += 1) {
        const reg = regs[i]
        if (reg && reg.active) {
          try {
            ;(reg.fn as (p: RiffleEventMap[K]) => void)(payload)
          } catch (error) {
            // A throwing listener must not skip every
            // listener registered after it, and must not escape emit() and
            // halt the frame loop that called it (a settle listener runs
            // from inside the loop's own settled() hook).
            reportListenerError(error)
          }
        }
      }
    } finally {
      // try/finally: depth must come back down and a pending
      // compaction must still run even though a listener's own throw is now
      // caught above, this finally still protects against a future defect
      // reintroducing an escaping throw between here and the loop.
      bucket.depth -= 1
      if (bucket.depth === 0 && bucket.dirty) compact(bucket)
    }
  }

  // Runs only once the outermost emit for this event has finished (nested
  // emits, e.g. a listener triggering another emit of the SAME event, leave
  // compaction to the call that brings that event's own depth back to
  // zero). In place: the regs array is never replaced, so no unsubscribe
  // closure can ever hold a stale reference to it.
  function compact(bucket: Bucket): void {
    const regs = bucket.regs
    let write = 0
    for (let read = 0; read < regs.length; read += 1) {
      const reg = regs[read]
      if (reg) regs[write++] = reg
    }
    regs.length = write
    bucket.dirty = false
  }

  // activeIndex is derived from `target`, the committed destination, not
  // from `motion.value`, which tracks the finger mid-drag. Deriving from
  // motion.value means a drag past 50% reports a card change the user never
  // committed, and worse, next() sets target before motion.value has moved,
  // so the index the snapshot reports lags a whole frame behind (or never
  // updates at all if the drag settles back to zero net change).
  const store = createStore<RiffleSnapshot>(() => ({
    activeIndex: activeIndexOf(target),
    count,
    isDragging: dragging,
    isSettling: !dragging && !isSettled(motion, target),
    canPrev: bounds === 'loop' ? count > 1 : target > 0,
    canNext: bounds === 'loop' ? count > 1 : target < count - 1,
  }))

  let lastAnnounced = store.getSnapshot().activeIndex
  // The live region announces the card the user lands on, not every
  // card a rapid burst of navigation passes through. Not on the frame path
  // (it runs once per settled change, never per drag frame), so allocating
  // a fresh timer here is fine.
  let announceTimer: ReturnType<typeof setTimeout> | null = null

  const stepTravel = () => layout.stepTravel(geometry)

  /** Pointer px/ms to positions per second. 0 when stepTravel is unusable. */
  function positionsPerSecond(pixelsPerMs: number): number {
    const travel = stepTravel()
    return travel > 0 ? (pixelsPerMs * 1000) / travel : 0
  }

  // Hoisted out of write() and called via nodes.forEach(writeNode)
  // instead of `for (const [index, el] of nodes)`. A Map's for...of
  // allocates an iterator plus a two-element entry array per step;
  // Map.prototype.forEach allocates neither, and this runs once per card
  // every animation frame.
  function writeNode(el: HTMLElement, index: number): void {
    let pose = poses.get(index)
    if (!pose) {
      pose = createPose()
      poses.set(index, pose)
    }
    let last = written.get(index)
    if (!last) {
      last = createPose()
      // Force the first write. NaN in every field guarantees a mismatch
      // against applyPose's per-field comparison, whatever the computed
      // pose turns out to be. Forcing zIndex alone is
      // not enough: the front card's resting pose (main 0, cross 0,
      // rotation 0, scale 1) is bit-for-bit identical to createPose()'s
      // defaults, so the transform-relevant fields would compare equal
      // and the very first transform would silently never be written.
      last.main = Number.NaN
      last.cross = Number.NaN
      last.rotation = Number.NaN
      last.scale = Number.NaN
      last.opacity = Number.NaN
      last.zIndex = Number.NaN
      written.set(index, last)
    }

    // Only a loop wraps. Under clamp there is nothing before the first
    // card or after the last, so cards already passed stay parked in the
    // exit slot instead of fanning back in behind the front.
    const delta = index - motion.value
    const depth = bounds === 'clamp' ? Math.max(delta, -1) : wrap(delta, count)
    layout.pose(depth, geometry, pose)

    // crossFollow does not depend on rotation. They are unrelated
    // features -- rotation: false must not silently disable vertical
    // follow too.
    if (dragging && depth <= 0 && depth > -1) {
      if (rotationOptions) {
        rotationInput.progress = motion.value - dragHome
        rotationInput.grabOffsetCross = grabOffsetCross
        rotationInput.crossExtent = geometry.crossExtent
        rotationInput.deltaMain = dragDeltaMain
        rotationInput.deltaCross = dragDeltaCross
        pose.rotation += computeRotation(rotationInput, rotationOptions)
      }
      pose.cross += dragDeltaCross * crossFollow
    }

    applyPose(el, pose, axis, last)
  }

  function write(): void {
    nodes.forEach(writeNode)
  }

  // A compositing hint for the cards that visibly
  // transform during a drag, cleared the moment the gesture settles rather
  // than left on indefinitely, since an unbounded `will-change` is its own
  // performance foot-gun. The direction of the drag is not yet
  // known at dragstart, so all three of home - 1, home and home + 1 are
  // marked (a forward-only guess left the card doing the large exit-slot
  // transform on a backward drag, home - 1, unmarked). Under loop the
  // neighbours wrap; under clamp an out-of-range neighbour is simply
  // skipped, since there is nothing before the first card or after the
  // last. A Set dedupes the small-count cases (e.g. count 2, where
  // home - 1 and home + 1 wrap to the same card).
  let dragWillChangeEls: HTMLElement[] = []

  function markWillChange(): void {
    clearWillChange()
    if (count === 0) return
    const home = activeIndexOf(dragHome)
    const raw = [home - 1, home, home + 1]
    const indices =
      bounds === 'clamp'
        ? raw.filter((i) => i >= 0 && i < count)
        : raw.map((i) => ((i % count) + count) % count)
    const seen = new Set<number>()
    for (const index of indices) {
      if (seen.has(index)) continue
      seen.add(index)
      const el = nodes.get(index)
      if (el) {
        el.style.willChange = 'transform'
        dragWillChangeEls.push(el)
      }
    }
  }

  function clearWillChange(): void {
    for (const el of dragWillChangeEls) el.style.willChange = ''
    dragWillChangeEls = []
  }

  // Which registered node (if any) is being measured for 'auto'
  // geometry, and how to stop observing it. Only ever engaged when
  // autoWidth or autoHeight is true; otherwise measured stays null and
  // measureFrom is never called, so a fixed-size stack pays nothing for
  // this at runtime beyond the two booleans above.
  let measured: HTMLElement | null = null
  let stopMeasuring: () => void = () => {}
  // Bumped on every measureFrom call so a callback
  // from a superseded observer (stopMeasuring() disconnected it, but a
  // disconnect is not guaranteed to suppress an already-queued browser
  // notification, and a stale reference could in principle still be fired
  // directly) is a provable no-op rather than clobbering geometry with a
  // detached element's size.
  let measureGeneration = 0

  function measureFrom(el: HTMLElement | null): void {
    stopMeasuring()
    measured = el
    stopMeasuring = () => {}
    if (!el) return
    const generation = ++measureGeneration
    stopMeasuring = observeSize(el, (w, h) => {
      if (generation !== measureGeneration) return
      if (autoWidth) width = w
      if (autoHeight) height = h
      applyExtents()
      write()
    })
  }

  // settle is emitted from the loop's own settled transition, and the
  // store is notified there too. A plain store subscription
  // fires on any qualifying snapshot change, including setCount, and would
  // never notify the store when the animation actually
  // finished, so isSettling would go stale.
  let wasSettled = true
  const loop = createLoop(clock, {
    integrate: (dt) => {
      if (!dragging) springStep(motion, target, spring, dt)
    },
    write,
    settled: () => {
      if (dragging || !isSettled(motion, target)) {
        wasSettled = false
        return false
      }
      motion.value = target
      motion.velocity = 0
      // loop.ts calls write() before settled(), so without a write
      // here the hard-set above never reaches the DOM; the resting
      // transform can sit up to 0.001 of a step off target (isSettled's
      // own tolerance), which is above applyPose's 0.01px rounding floor
      // at ordinary geometry.
      write()
      if (!wasSettled) {
        wasSettled = true
        clearWillChange()
        store.notify()
        emit('settle', { index: activeIndexOf(target) })
      }
      return true
    },
  })

  // A consumer listener can call destroy() synchronously from inside an
  // emit() (e.g. a 'dragstart' or 'dragend' handler). destroy() runs
  // loop.stop() immediately, but the code that called emit() keeps running
  // afterward and, without this guard, would call loop.kick() right after,
  // resurrecting a frame request post-stop. Because the pointer was already
  // detached at that point, onEnd never fires to clear `dragging`, so
  // settled() would return false forever and the resurrected loop would
  // never halt. Every call to loop.kick() in this file goes through here.
  function kick(): void {
    if (!destroyed) loop.kick()
  }

  function syncActive(previousIndex: number, direction: 1 | -1): void {
    // Subscribers see the new snapshot first; accessibility state is DOM
    // work that does not go through the store.
    store.notify()
    const next = store.getSnapshot().activeIndex
    // Accessibility state (roles, tabindex, inert, focus-follow) updates
    // before 'change' fires, so the new active card is already focusable
    // when listeners run. A listener that focuses a field inside it wins,
    // because its focus() call comes after the engine's focus-follow.
    if (next !== lastAnnounced) {
      lastAnnounced = next
      a11y.update(next, count)
      // Debounce 150ms after the last change so a rapid
      // burst of navigation announces only where it lands.
      if (announceTimer !== null) clearTimeout(announceTimer)
      announceTimer = setTimeout(() => {
        announceTimer = null
        a11y.announce(formatCardLabel(next, count, a11yConfig.getLabel))
      }, 150)
    }
    if (next !== previousIndex) {
      emit('change', { index: next, previousIndex, direction })
    }
  }

  /** Under clamp, the nearest in-range position; under loop, unchanged. */
  function clampTarget(next: number): number {
    return bounds === 'clamp' ? Math.min(Math.max(next, 0), Math.max(count - 1, 0)) : next
  }

  // direction is derived from the target delta's sign, not from
  // comparing the resulting indices. `next > previous ? 1 : -1` reports -1
  // for a forward wrap from index 2 to index 0 (2 -> 3, displayed as 0)
  // because it compares ordering, not the direction actually travelled.
  function setTarget(next: number, animate = true): void {
    // destroy() can run synchronously inside a
    // dragend or change listener, partway through the same onEnd call that
    // goes on to call setTarget. Both branches below write to the DOM
    // and/or notify a store a consumer's subscriber might still be
    // listening to, so the guard covers both, not just the non-animated
    // one (the animated branch's kick() already no-ops once destroyed, but
    // syncActive() did not, and syncActive is common to both branches).
    if (destroyed) return
    const previousIndex = store.getSnapshot().activeIndex
    const previousTarget = target
    target = clampTarget(next)
    const direction: 1 | -1 = target >= previousTarget ? 1 : -1
    if (!animate || reduced) {
      motion.value = target
      motion.velocity = 0
      write()
      // Reaching rest here without ever entering
      // the frame loop must still fire settle, exactly once. A loop
      // already running from a previous animated navigation would
      // otherwise reach its own settled() hook on a later frame and, since
      // wasSettled is still false there, emit settle a second time. Stop
      // that frame and latch settled first, so it never gets the chance.
      loop.stop()
      wasSettled = true
      clearWillChange()
      syncActive(previousIndex, direction)
      if (activeIndexOf(target) !== previousIndex) {
        emit('settle', { index: activeIndexOf(target) })
      }
      return
    }
    kick()
    syncActive(previousIndex, direction)
  }

  const detachPointer = attachPointer(
    container,
    {
      axis,
      slop: 6,
      enabled: () => !destroyed && draggable && count > 1,
      getTime: () => clock.now(),
    },
    {
      onStart(info) {
        if (destroyed) return
        dragging = true
        // Continuous, not rounded. onStart and onMove both run inside
        // the first qualifying pointermove, so if an animation is still in
        // flight (e.g. a rapid second swipe), rounding here snaps the card
        // up to half a step the instant the finger lands. Rounding happens
        // only at commit time, in onEnd.
        dragHome = motion.value
        dragDeltaMain = 0
        dragDeltaCross = 0
        grabOffsetCross = info.grabOffsetCross
        motion.velocity = 0
        tracker.reset()
        markWillChange()
        store.notify()
        emit('dragstart', { index: activeIndexOf(target), pointerType: info.pointerType })
        kick()
      },

      onMove(info) {
        if (destroyed) return
        // A zero or negative stepTravel (e.g. cardWidth: 0, gap: 0,
        // plausible from a measured width read before first paint) would
        // otherwise poison motion.value with NaN/Infinity, which then
        // poisons every depth calculation and every written transform, and
        // keeps the loop from ever settling.
        const travel = stepTravel()
        if (!(travel > 0)) return
        dragDeltaMain = info.deltaMain
        dragDeltaCross = info.deltaCross
        tracker.add(info.deltaMain, info.time)
        motion.value = dragHome + info.deltaMain / travel
        dragPayload.progress = motion.value - dragHome
        dragPayload.offset = info.deltaMain
        emit('drag', dragPayload)
        kick()
      },

      onEnd(info) {
        if (destroyed) return
        // Round only now, at commit time.
        const home = Math.round(dragHome)
        const progress = motion.value - dragHome
        const pixelsPerMs = tracker.get(info.time)
        dragging = false

        const decision = info.cancelled
          ? { commit: false, direction: 0 as const }
          : decideCommit({ progress, velocity: pixelsPerMs, threshold, flingVelocity })
        // The destination is clamped before dragend is emitted, so a
        // prev fling at a clamp end reports what actually happens: nothing.
        const destination = clampTarget(decision.commit ? home + decision.direction : home)
        const committed = destination !== home

        // A cancelled gesture returns to origin; handing it
        // the fling velocity too would give it an overshoot the user never
        // asked for. Otherwise the fling goes to the spring in positions per
        // second, the same conversion the velocity getter uses mid-drag,
        // so the value it reports is continuous across release.
        if (!info.cancelled) motion.velocity = positionsPerSecond(pixelsPerMs)
        tracker.reset()
        // Otherwise dragOffset reads stale after the drag ends, e.g.
        // still 250 at rest after a 250px drag, breaking the identity
        // progress = dragOffset / travel.
        dragDeltaMain = 0
        dragDeltaCross = 0

        // Subscribers, and a dragend listener reading getSnapshot(),
        // see isDragging false before dragend fires.
        store.notify()
        emit('dragend', { committed, direction: committed ? decision.direction : 0 })
        setTarget(destination)
      },
    },
  )

  // The per-option apply table for update(). Declared once per
  // instance (not per call) since every entry closes over this instance's
  // own `let`s and its `a11y`/`a11yConfig`.
  const updateHandlers = {
    bounds: {
      default: DEFAULTS.bounds,
      apply(value: Bounds) {
        // Switching to clamp mid-loop must not let a stack that has
        // travelled past the ends (target far outside 0..count-1 under an
        // unbounded loop) jump: pin target and motion.value to the
        // currently displayed card first.
        const switchingToClamp = value === 'clamp' && bounds !== 'clamp'
        bounds = value
        if (switchingToClamp) {
          const activeIndex = activeIndexOf(target)
          target = activeIndex
          motion.value = activeIndex
          motion.velocity = 0
        }
      },
    },
    threshold: {
      default: DEFAULTS.threshold,
      apply(value: number) {
        threshold = value
      },
    },
    flingVelocity: {
      default: DEFAULTS.flingVelocity,
      apply(value: number) {
        flingVelocity = value
      },
    },
    crossFollow: {
      default: DEFAULTS.crossFollow,
      apply(value: number) {
        crossFollow = value
      },
    },
    draggable: {
      default: DEFAULTS.draggable,
      apply(value: boolean) {
        draggable = value
      },
    },
    spring: {
      default: DEFAULT_SPRING as SpringPreset | SpringConfig,
      apply(value: SpringPreset | SpringConfig) {
        spring = resolveSpring(value)
      },
    },
    rotation: {
      default: {} as RotationOptions | false,
      apply(value: RotationOptions | false) {
        rotationOptions = value === false ? null : resolveRotation(value)
      },
    },
    reducedMotion: {
      default: DEFAULTS.reducedMotion,
      apply(value: ReducedMotionMode) {
        reducedMotionMode = value
        reduced = computeReduced(value)
      },
    },
    layout: {
      default: DEFAULT_LAYOUT,
      apply(value: LayoutStrategy) {
        layout = value
      },
    },
    gap: {
      default: DEFAULTS.gap,
      apply(value: number) {
        geometry.gap = value
      },
    },
    maxVisible: {
      default: DEFAULTS.maxVisible,
      apply(value: number) {
        geometry.maxVisible = value
      },
    },
    getLabel: {
      default: undefined as ((index: number) => string) | undefined,
      apply(value: ((index: number) => string) | undefined) {
        a11yConfig.getLabel = value
        a11y.update(activeIndexOf(target), count)
      },
    },
  } satisfies Record<string, UpdateHandler<any>>

  type UpdateKey = keyof typeof updateHandlers

  const api: Riffle = {
    next() {
      assertAlive()
      setTarget(Math.round(target) + 1)
    },
    prev() {
      assertAlive()
      setTarget(Math.round(target) - 1)
    },
    goTo(index, opts) {
      assertAlive()
      // An integer index only, like next()/prev() implicitly
      // guarantee by construction.
      if (!Number.isInteger(index)) {
        invalidOption('goTo expects an integer index')
      }
      // Under loop, target is unbounded, so the raw distance from the
      // current position to `index` overstates how far the stack actually
      // needs to travel: goTo(4) from index 0 in a five-card ring is one
      // step back (4, displayed the same as -1), not four steps forward.
      // Take the shortest signed delta, ties going forward.
      if (bounds === 'loop' && count > 0) {
        const from = activeIndexOf(target)
        let delta = (((index - from) % count) + count) % count
        if (delta > count / 2) delta -= count
        setTarget(target + delta, opts?.animate !== false)
      } else {
        setTarget(index, opts?.animate !== false)
      }
    },
    registerNode(index, el) {
      // The only public method with no liveness guard. Without this,
      // calling it after destroy() re-populates `nodes`, re-applies every
      // a11y attribute through a11y.update, and writes style.transform,
      // directly breaking "destroy leaves no DOM attribute". A silent
      // return, not assertAlive()'s throw: this is commonly called from a
      // ref-callback/cleanup path that should not be disrupted by throwing
      // during unmount.
      if (destroyed) return
      if (el === null) {
        const removed = nodes.get(index)
        nodes.delete(index)
        poses.delete(index)
        written.delete(index)
        // The measured node just unregistered. Fall back to any
        // other registered card, or stop measuring if none remain.
        if (removed && removed === measured) {
          const next = nodes.values().next()
          measureFrom(next.done ? null : next.value)
        }
      } else {
        const previous = nodes.get(index)
        if (previous && previous !== el) {
          // The written-pose cache is keyed by index, not by
          // element. Without clearing it here, a fresh element swapped in
          // at an already-used index (the Vue adapter's keyed reorders)
          // inherits the old element's "already written" record,
          // and applyPose skips writing to it until its pose next changes.
          written.delete(index)
        }
        nodes.set(index, el)
        if ((autoWidth || autoHeight) && !measured) {
          // Only when 'auto' is in play, and only the first node to
          // register drives the measurement; later registrations at a
          // different index do not restart it (measureFrom on unregister
          // already keeps it going).
          measureFrom(el)
        } else if (previous === measured && previous !== el) {
          // registerNode(sameIndex, newEl) without
          // an intervening null (e.g. the Vue adapter's keyed reorders)
          // replaces the measured element in place. Without this,
          // `measured` keeps pointing at the old, likely detached element,
          // its ResizeObserver goes on watching something no longer in the
          // DOM, and the new element is never observed, so 'auto' sizing
          // silently stops tracking resizes.
          measureFrom(el)
        }
      }
      // null must pass through to
      // the a11y layer so update() never writes attributes to a detached
      // element.
      a11y.registerNode(index, el)
      a11y.update(activeIndexOf(target), count)
      // A newly registered node needs its pose applied immediately, not on
      // the next animation frame: nothing may be animating (e.g. the stack
      // is at rest), in which case the loop is not running and no frame is
      // coming.
      write()
    },
    setCount(n) {
      assertAlive()
      if (!Number.isInteger(n) || n < 0) {
        throw new RiffleError('INVALID_COUNT', INVALID_COUNT_MESSAGE)
      }
      count = n
      geometry.count = n
      // Under bounds: 'clamp', target (and motion.value with it) must
      // never be left pointing past the new count. Left unclamped, the
      // snapshot contradicts itself: activeIndexOf wraps target back into
      // range for display while canPrev/canNext keep reading the
      // still-out-of-range target, so the arrow that looks enabled moves
      // the user the wrong way.
      if (bounds === 'clamp') {
        const max = Math.max(count - 1, 0)
        target = Math.min(Math.max(target, 0), max)
        motion.value = target
        motion.velocity = 0
      }
      // Every card kept its old count in its aria-label
      // ("k of 3") until something called a11y.update with the new one;
      // nothing did.
      a11y.update(activeIndexOf(target), count)
      store.notify()
      // write() below applies the corrected pose synchronously; both target
      // and motion.value are already hard-set above, so there is nothing
      // left for the animation loop to correct and no need to kick it.
      write()
    },
    update(next) {
      assertAlive()

      // Validate everything before mutating anything, so a bad key never
      // leaves other options half-applied.
      //
      // A half-applied axis change is worse than an honest
      // refusal. Mutating the local `axis` used by write() would leave the
      // pointer (attached at the old axis), touch-action (set once at
      // attach), a11y (captured axis at construction) and geometry's
      // cardExtent/crossExtent silently out of sync with it. Equal to the
      // current axis is now tolerated as a no-op; only a real change
      // throws. A real re-attach is a future enhancement, not supported yet.
      if (next.axis !== undefined && next.axis !== axis) {
        invalidOption('axis is immutable after creation')
      }
      if ('cardWidth' in next) checkDimensionToggle(next.cardWidth, autoWidth, 'cardWidth')
      if ('cardHeight' in next) checkDimensionToggle(next.cardHeight, autoHeight, 'cardHeight')
      const merged: RiffleOptions = { ...current, ...next, count: next.count ?? count }
      assertOptions(merged)
      current = merged

      // Apply. Table-driven for the eleven resettable scalar/object options
      // above; axis is immutable (already checked, so present-and-equal is
      // a no-op here), count routes through setCount, startIndex is a
      // one-time initial value (like defaultValue on an input, it is never
      // touched again), and cardWidth/cardHeight needed the mode check
      // above but have no table entry of their own.
      for (const key of Object.keys(updateHandlers) as UpdateKey[]) {
        if (!(key in next)) continue
        const raw = next[key]
        const handler = updateHandlers[key] as UpdateHandler<any>
        handler.apply(raw === undefined ? handler.default : raw)
      }
      if ('cardWidth' in next && !autoWidth) {
        width = next.cardWidth === undefined ? 300 : (next.cardWidth as number)
      }
      if ('cardHeight' in next && !autoHeight) {
        height = next.cardHeight === undefined ? 400 : (next.cardHeight as number)
      }
      // count has no default to reset to (it is a required field, not an
      // optional one with a fallback), so update({ count: undefined }) is
      // deliberately a no-op rather than an error or a reset to anything.
      if ('count' in next && next.count !== undefined) api.setCount(next.count)

      applyExtents()
      store.notify()
      write()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      loop.stop()
      detachPointer()
      detachKeyboard()
      stopMeasuring()
      if (announceTimer !== null) {
        clearTimeout(announceTimer)
        announceTimer = null
      }
      a11y.destroy()
      // An inline transform/opacity/zIndex left behind after
      // destroy is a card frozen mid-stack, not the untouched element a
      // caller handed in. will-change never belongs on a destroyed
      // instance's nodes either.
      nodes.forEach((el) => {
        el.style.transform = ''
        el.style.opacity = ''
        el.style.zIndex = ''
        el.style.willChange = ''
      })
      // Deactivate before clearing: an emit() already iterating its own
      // captured regs array (destroy() called from inside a listener) skips
      // an inactive registration, so no later listener runs against a
      // torn-down instance.
      listeners.forEach((bucket) => bucket.regs.forEach((reg) => reg && (reg.active = false)))
      listeners.clear()
      nodes.clear()
      poses.clear()
      written.clear()
    },
    subscribe(fn) {
      // After destroy, a real subscription would leak a
      // listener store.notify() will never reach again, with nothing to
      // ever call the unsubscribe it returned.
      if (destroyed) return () => {}
      return store.subscribe(fn)
    },
    getSnapshot: store.getSnapshot,
    on(event, fn) {
      // Same reasoning as subscribe above.
      if (destroyed) return () => {}
      let bucket = listeners.get(event)
      if (!bucket) {
        bucket = { regs: [], depth: 0, dirty: false }
        listeners.set(event, bucket)
      }
      // This call's own Registration record, not the bare
      // function. Two `on()` calls for the same function get two distinct
      // records, so unsubscribing one never touches the other's.
      const reg: Registration = { fn: fn as Listener, active: true }
      bucket.regs.push(reg)
      return () => {
        if (!reg.active) return
        reg.active = false
        // Looked up by identity in the live bucket from the map on every
        // call, never through a captured reference: the regs array for this
        // event is never replaced (compact() mutates in place), so this
        // always finds the registration if it is still present, however
        // many other subscribes/unsubscribes happened in between.
        const live = listeners.get(event)
        if (!live) return
        const index = live.regs.indexOf(reg)
        if (index === -1) return
        if (live.depth > 0) {
          live.regs[index] = null
          live.dirty = true
        } else {
          live.regs.splice(index, 1)
        }
      }
    },
    get position() {
      return motion.value
    },
    get dragOffset() {
      return dragging ? dragDeltaMain : 0
    },
    get progress() {
      return dragging ? motion.value - dragHome : 0
    },
    get velocity() {
      return dragging ? positionsPerSecond(tracker.get(clock.now())) : motion.velocity
    },
  }

  // The keyboard stays enabled when draggable is false: disabling drag must
  // never disable keyboard access. Disabled once destroyed, and (like the
  // pointer) once there is nothing to navigate between.
  const detachKeyboard = attachKeyboard(container, axis, () => !destroyed && count > 1, {
    next: () => api.next(),
    prev: () => api.prev(),
    first: () => api.goTo(0),
    last: () => api.goTo(count - 1),
  })

  // No a11y.update()/write() here: at this point in construction, nothing
  // has called api.registerNode yet (the caller cannot, since it does not
  // have `api` until createRiffle returns it below), so both this
  // instance's `nodes` map and a11y's own are still empty and these calls
  // would be a no-op over an empty map. registerNode itself already calls
  // a11y.update() and write() once a node is actually registered.
  return api
}
