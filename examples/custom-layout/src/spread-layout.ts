import type { LayoutGeometry, LayoutStrategy, Pose } from '@rpxl/riffle'

/**
 * Options for {@link spread}. Both are optional; see each field for its
 * default.
 */
export interface SpreadOptions {
  /** Degrees each card behind the front is rotated further than the last. Default 12. */
  angleStep?: number
  /** Scale lost per unit of depth. Default 0.07. The result is always floored at 0.5. */
  scaleStep?: number
}

/**
 * A "spread" layout: instead of the reference `fan()` stacking cards
 * straight behind one another, cards behind the front arc out along a
 * quarter turn of a circle, tilting as they go. This file is the worked
 * example for writing a `LayoutStrategy` against the public API only
 * (`@rpxl/riffle`'s exported types), and its comments are the source for
 * the docs `/layouts` page.
 *
 * ## What a `LayoutStrategy` is
 *
 * A `LayoutStrategy` has two members: `pose(depth, geometry, out)`, called
 * once per card on every animation frame the engine renders, and
 * `stepTravel(geometry)`, called to convert pixels to steps. Nothing else.
 * The engine owns measurement, dragging, springs and DOM writes; a layout
 * only maps a number (`depth`) to a pose (`main`, `cross`, `rotation`,
 * `scale`, `opacity`, `zIndex`).
 *
 * ## `pose(depth, geometry, out)`: write into `out`, never allocate
 *
 * `pose` must be pure (same `depth` and `geometry` always produce the same
 * pose) and it must mutate `out` field by field rather than returning a new
 * object. This is not a style preference: the engine's render loop calls
 * `pose` once per visible card, every animation frame a stack is dragging or
 * settling, and it reuses one `Pose` object per card across every one of
 * those calls (see the core's `writeNode`, which allocates each card's pose
 * once with `createPose()` and then hands the same object back into `pose`
 * forever after). A layout that returned `{ main, cross, ... }` fresh each
 * time would allocate one small object per card per frame, which is exactly
 * the kind of steady garbage that produces GC pauses and jank during a drag,
 * the one moment a card stack cannot afford to stutter. Writing into `out`
 * keeps the render loop's steady-state allocation at zero.
 *
 * `depth` is a continuous number, not an integer index: 0 is the front card,
 * and it moves smoothly through fractional values while the user drags or a
 * settle spring is still moving, so a layout that only looks correct at
 * integer depths will visibly stutter mid-gesture. Depth 0 or less is the
 * card currently at or animating through the front slot; this example
 * borrows the reference layout's exit handling for that range (see below),
 * because a custom "spread" arc has nothing useful to say about a card
 * mid-drag past the front, only about the cards waiting behind it.
 *
 * ## `stepTravel(geometry)` and the drag commit threshold
 *
 * `stepTravel` returns the pixel distance that corresponds to one full step
 * of `depth`, i.e. how far the front card must travel to become the next
 * card. The engine divides the pointer's raw drag distance by this number to
 * get `progress`, a signed fraction of one step (see `onMove` in the core's
 * `riffle.ts`: `motion.value = dragHome + info.deltaMain / travel`). On
 * release, that `progress` is compared against `threshold` (a fraction of a
 * step, default 0.25) to decide whether the drag commits to the next or
 * previous card, or springs back to where it started; a fast fling can also
 * commit regardless of distance, judged against `flingVelocity`. In short,
 * `stepTravel` sets the physical scale of "how far is a swipe": a layout
 * that returns too small a number makes every drag feel like it commits
 * instantly, and too large a number makes the stack feel like it never lets
 * go. This layout returns `cardExtent + gap`, the same distance the
 * reference `fan()` uses, and its own exit slot (the `depth <= 0` branch
 * below) is written in those same units so a drag tracks the pointer 1:1
 * right up to the moment it commits.
 *
 * ## `depth` under `loop` versus `clamp`
 *
 * How far `depth` ranges depends on `bounds`:
 *
 * - Under `bounds: 'loop'` (the default), `depth` is wrapped into the
 *   half-open range `[-1, count - 1)` (see the core's `wrap()` in
 *   `math/wrap.ts`). Depth `-1` is the off-screen exit slot a card passes
 *   through as it leaves the front; depths from just above `0` up to just
 *   under `count - 1` cover every other card, wrapping around so the card
 *   "before" index 0 is the one at the back of the stack. A layout can
 *   assume it will never see `depth >= count - 1` or `depth < -1` here,
 *   with one exception: for `count === 1` the general range collapses to
 *   `[-1, 0)`, which excludes 0 and would park the stack's only card
 *   off-screen forever, so `wrap()` special-cases it to always return `0`
 *   instead. A layout will see `depth === 0 === count - 1` for that single
 *   card, matching the legacy library's behavior that a stack of one always
 *   shows its single card at depth 0 and never moves.
 * - Under `bounds: 'clamp'`, there is no wraparound: `depth` is
 *   `Math.max(index - position, -1)`, so it is still floored at `-1` for
 *   the exit slot, but it is **not** bounded above. A stack of 50 cards
 *   sitting at its first card reports depths from `-1` up to `48` for its
 *   last card, even though only the first handful are ever visible. This
 *   layout does not need an explicit upper clamp because its opacity fade
 *   (below) already drives cards past `geometry.maxVisible` to fully
 *   transparent, but a layout that indexed an array by `depth` instead of
 *   computing from it would need to guard against an out-of-range depth
 *   itself under `clamp`.
 */
export function spread(options: SpreadOptions = {}): LayoutStrategy {
  const angleStep = options.angleStep ?? 12
  const scaleStep = options.scaleStep ?? 0.07

  return {
    name: 'spread',

    stepTravel(geometry: LayoutGeometry): number {
      return geometry.cardExtent + geometry.gap
    },

    // #region pose
    pose(depth: number, geometry: LayoutGeometry, out: Pose): Pose {
      if (depth <= 0) {
        // The exit slot: borrowed from the reference fan() layout so a drag
        // past the front tracks the pointer 1:1 in the same units
        // stepTravel() reports above.
        const t = -depth
        // When depth is 0, -depth is -0. Multiplying by a positive number
        // preserves -0, and Object.is(-0, 0) is false, so the trailing + 0
        // normalizes it rather than leaving a signed zero in the pose.
        out.main = t * (geometry.cardExtent + geometry.gap) + 0
        out.cross = 0
        out.rotation = 0
        out.scale = 1
        out.opacity = 1 - t * t
      } else {
        // The arc: each card behind the front sits `angleStep` degrees
        // further around a quarter turn, at a radius close to one card's
        // extent, so the stack reads as cards fanned open like a hand of
        // playing cards rather than stacked directly behind one another.
        const angleDeg = depth * angleStep
        const angleRad = (angleDeg * Math.PI) / 180
        const radius = geometry.cardExtent * 0.9
        out.main = radius * Math.sin(angleRad)
        out.cross = radius * (1 - Math.cos(angleRad))
        out.rotation = angleDeg
        const scale = 1 - scaleStep * depth
        out.scale = scale < 0.5 ? 0.5 : scale
        // Linear fade over the last unit of depth before maxVisible, so a
        // card fades out exactly as the reference layout's cards do, just
        // computed without reaching for the core's internal smoothstep
        // helper (not part of the public API this example is limited to).
        const fade = geometry.maxVisible - depth
        out.opacity = fade <= 0 ? 0 : fade >= 1 ? 1 : fade
      }
      out.zIndex = Math.round(geometry.count - depth)
      return out
    },
    // #endregion pose
  }
}
