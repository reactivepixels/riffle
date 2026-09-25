/**
 * Continuous depth of a card, wrapped into `[-1, count - 1)`.
 *
 * Depth 0 is the front card. Depth -1 is the off-screen exit slot. The range
 * starts at -1 rather than 0 so a card just past the front reads as a small
 * negative number and slides out, instead of teleporting to the back.
 *
 * For `count === 1` the range `[-1, count - 1)` collapses to `[-1, 0)`, which
 * excludes 0 and would park the only card off-screen at every delta. That
 * matches the legacy library's special case: a stack of one always shows its
 * single card at depth 0 and never moves.
 *
 * Near the wrap seam, `delta + 1` can be a tiny negative number, and the
 * `d += count` correction below can round up to exactly `count` in floating
 * point, which would put the result at `count - 1`, outside the documented
 * range. The trailing `d -= count` guard corrects that.
 *
 * @param delta - `cardIndex - position`
 * @param count - number of cards in the ring
 *
 * @example
 * ```ts
 * import { wrap } from '@rpxl/riffle'
 *
 * // card index 2, position 0.4, 5 cards in the ring
 * const depth = wrap(2 - 0.4, 5)
 * ```
 */
export function wrap(delta: number, count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 0
  let d = (delta + 1) % count
  if (d < 0) d += count
  if (d >= count) d -= count
  return d - 1
}
