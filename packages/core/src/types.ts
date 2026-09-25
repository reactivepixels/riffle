/**
 * A card's visual state. Mutated in place by layouts; never allocated per frame.
 *
 * @example
 * ```ts
 * import { createPose, fan } from '@rpxl/riffle'
 *
 * const pose = createPose()
 * fan().pose(0, geometry, pose) // the front card's resting pose
 * ```
 */
export interface Pose {
  /** Pixels along the drag axis. */
  main: number
  /** Pixels across the drag axis. */
  cross: number
  /** Degrees. */
  rotation: number
  /** 1 at full size, shrinking toward 0 further back in the fan. */
  scale: number
  /**
   * 0..1. Cards fade out as they exit or fall past `maxVisible`.
   *
   * A card whose opacity reaches 0 (after rounding to three decimals) is
   * parked at the neutral pose: its transform is written with no
   * translation, rotation or scale, not at its layout offset, so an
   * invisible card never widens the page. Do not rely on a CSS `opacity`
   * transition to fade such a card out in place: the transform moves to
   * neutral in the same write, so a transitioned fade plays at the neutral
   * position. Fade through the pose's own opacity instead.
   */
  opacity: number
  /** Stacking order. Higher paints on top. */
  zIndex: number
}

/**
 * Measured geometry handed to a layout.
 *
 * @example
 * ```ts
 * import type { LayoutGeometry } from '@rpxl/riffle'
 *
 * const geometry: LayoutGeometry = { cardExtent: 300, crossExtent: 400, gap: 20, maxVisible: 4, count: 5 }
 * ```
 */
export interface LayoutGeometry {
  /** Card size along the main axis, in pixels. */
  cardExtent: number
  /** Card size across the main axis, in pixels. */
  crossExtent: number
  /** Pixels of space a layout leaves between cards. */
  gap: number
  /** How many cards behind the front one a layout keeps visible before fading them out. */
  maxVisible: number
  /** Total number of cards in the stack. */
  count: number
}

/**
 * Maps a continuous depth to a pose. Must be pure and must write into `out`
 * rather than allocating. Depth 0 is the front card; negative depth is exiting.
 *
 * @example
 * ```ts
 * import { fan, type LayoutStrategy } from '@rpxl/riffle'
 *
 * const layout: LayoutStrategy = fan({ scaleStep: 0.1 })
 * ```
 */
export interface LayoutStrategy {
  /** The layout's own name, for debugging. `fan()`'s is `'fan'`. */
  readonly name: string
  /** Writes `out`'s fields for `depth` and returns it. */
  pose(depth: number, geometry: LayoutGeometry, out: Pose): Pose
  /** Pixels the front card travels to advance one position. */
  stepTravel(geometry: LayoutGeometry): number
}

/**
 * The drag axis: horizontal or vertical.
 *
 * @example
 * ```ts
 * import type { Axis } from '@rpxl/riffle'
 *
 * const axis: Axis = 'y'
 * ```
 */
export type Axis = 'x' | 'y'

/**
 * What happens at the ends of the stack: `'loop'` wraps past the last card
 * back to the first, `'clamp'` stops there.
 *
 * @example
 * ```ts
 * import type { Bounds } from '@rpxl/riffle'
 *
 * const bounds: Bounds = 'clamp'
 * ```
 */
export type Bounds = 'loop' | 'clamp'

/**
 * A named spring feel, resolved to a {@link SpringConfig} by `SPRING_PRESETS`.
 *
 * @example
 * ```ts
 * import type { SpringPreset } from '@rpxl/riffle'
 *
 * const preset: SpringPreset = 'snappy'
 * ```
 */
export type SpringPreset = 'snappy' | 'smooth' | 'stiff'

/**
 * Whether the engine honours `prefers-reduced-motion`. `'auto'` respects it,
 * `'respect'` forces reduced motion on, `'ignore'` always animates.
 *
 * @example
 * ```ts
 * import type { ReducedMotionMode } from '@rpxl/riffle'
 *
 * const mode: ReducedMotionMode = 'respect'
 * ```
 */
export type ReducedMotionMode = 'auto' | 'respect' | 'ignore'

/**
 * A spring's feel, in stiffness and damping.
 *
 * @example
 * ```ts
 * import type { SpringConfig } from '@rpxl/riffle'
 *
 * const spring: SpringConfig = { stiffness: 340, damping: 34 }
 * ```
 */
export interface SpringConfig {
  /** Higher pulls harder toward the target. */
  stiffness: number
  /** Higher settles with less overshoot. */
  damping: number
}

/**
 * Tunes the tilt a card picks up while it is being dragged. Pass `false` to
 * `RiffleOptions.rotation` instead of this shape to disable rotation entirely.
 *
 * Every optional field below is declared `?: T | undefined` so that,
 * under exactOptionalPropertyTypes, a consumer (or `update()`) may pass an
 * explicit `undefined` to mean "use the default".
 *
 * @example
 * ```ts
 * import type { RotationOptions } from '@rpxl/riffle'
 *
 * const rotation: RotationOptions = { maxRotation: 24, leverFactor: 0.8 }
 * ```
 */
export interface RotationOptions {
  /** Degrees. Default 16. */
  maxRotation?: number | undefined
  /** Contribution from drag distance alone. Default 0.35. */
  baseFactor?: number | undefined
  /** Contribution from where the card was grabbed. Default 0.65. */
  leverFactor?: number | undefined
  /** Contribution from the angle of travel. Default 0.15. */
  trajFactor?: number | undefined
}

/**
 * Everything `createRiffle` accepts. Only `count` is required; everything
 * else has a default.
 *
 * @example
 * ```ts
 * import type { RiffleOptions } from '@rpxl/riffle'
 *
 * const options: RiffleOptions = { count: 5, cardWidth: 300, cardHeight: 400, bounds: 'clamp' }
 * ```
 */
export interface RiffleOptions {
  /** How many cards are in the stack. */
  count: number
  /** Pixels, or `'auto'` to measure a registered card. Default 300 when omitted as a number. */
  cardWidth?: number | 'auto' | undefined
  /** Pixels, or `'auto'` to measure a registered card. Default 400 when omitted as a number. */
  cardHeight?: number | 'auto' | undefined
  /** Pixels of space the default fan layout leaves between cards. Default 20. */
  gap?: number | undefined
  /** How many cards behind the front one stay visible before fading out. Default 4. */
  maxVisible?: number | undefined
  /** `'loop'` wraps past the ends, `'clamp'` stops there. Default `'loop'`. */
  bounds?: Bounds | undefined
  /** The drag axis. Default `'x'`. Immutable after construction: `update()` throws on a change. */
  axis?: Axis | undefined
  /** Fraction of one step, 0..1. Default 0.25. */
  threshold?: number | undefined
  /** Pixels per millisecond. Default 0.5. */
  flingVelocity?: number | undefined
  /** The active card at construction. Read once; call `goTo` to move later. Default 0. */
  startIndex?: number | undefined
  /** Whether dragging is enabled. Keyboard navigation stays on regardless. Default true. */
  draggable?: boolean | undefined
  /** A named preset, or your own stiffness and damping. Default `{ stiffness: 340, damping: 34 }`. */
  spring?: SpringPreset | SpringConfig | undefined
  /** Tilt while dragging, or `false` to disable it. Default the {@link RotationOptions} defaults. */
  rotation?: false | RotationOptions | undefined
  /** How much the card follows the finger across the axis, 0..1. Default 0.18. */
  crossFollow?: number | undefined
  /** Whether to honour `prefers-reduced-motion`. Default `'auto'`. */
  reducedMotion?: ReducedMotionMode | undefined
  /** The pose strategy. Default `fan()`. */
  layout?: LayoutStrategy | undefined
  /**
   * A caller-supplied label per card index. The card's aria-label becomes
   * `${getLabel(i)}, ${i + 1} of ${count}`, and announcements use the same
   * string. Omit it for the bare position.
   */
  getLabel?: ((index: number) => string) | undefined
}

/**
 * Discrete state only. High-frequency values live behind getters on Riffle.
 *
 * @example
 * ```ts
 * import type { RiffleSnapshot } from '@rpxl/riffle'
 *
 * const snapshot: RiffleSnapshot = riffle.getSnapshot()
 * console.log(snapshot.activeIndex, snapshot.canNext)
 * ```
 */
export interface RiffleSnapshot {
  /** The card currently at the front. */
  activeIndex: number
  /** How many cards are in the stack. */
  count: number
  /** Whether a pointer is currently dragging the stack. */
  isDragging: boolean
  /** Whether the spring is still animating toward its target. */
  isSettling: boolean
  /** Whether `prev()` would move the stack. */
  canPrev: boolean
  /** Whether `next()` would move the stack. */
  canNext: boolean
}

/**
 * Every event `Riffle.on` can subscribe to, keyed by name, with each key's
 * payload type.
 *
 * @example
 * ```ts
 * riffle.on('change', (event) => console.log(event.index))
 * ```
 */
export interface RiffleEventMap {
  /** The active card changed, whether from a drag, a button, or `goTo()`. */
  change: { index: number; previousIndex: number; direction: 1 | -1 }
  /** A drag gesture started. */
  dragstart: { index: number; pointerType: 'mouse' | 'touch' | 'pen' }
  /**
   * Fires once per pointer move, which browsers coalesce to frame cadence.
   * Do not retain the payload: it is reused between calls. Do not allocate
   * in this handler.
   */
  drag: { progress: number; offset: number }
  /** A drag gesture ended, committed or not. */
  dragend: { committed: boolean; direction: 1 | -1 | 0 }
  /** The spring reached its target and the stack is at rest. */
  settle: { index: number }
}
