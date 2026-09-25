import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { wrap } from '../src/math/wrap'

describe('wrap', () => {
  it('puts the active card at depth 0', () => {
    expect(wrap(0, 5)).toBe(0)
  })

  it('puts the next card at depth 1', () => {
    expect(wrap(1, 5)).toBe(1)
  })

  it('lets a card just past the front read as slightly negative, not as the back', () => {
    expect(wrap(-0.1, 5)).toBeCloseTo(-0.1, 10)
  })

  it('places the fully exited card at depth -1', () => {
    expect(wrap(-1, 5)).toBe(-1)
  })

  it('wraps a card more than one step past the front around to the back', () => {
    expect(wrap(-1.1, 5)).toBeCloseTo(3.9, 10)
  })

  it('treats the last depth as the exit slot', () => {
    expect(wrap(4, 5)).toBe(-1)
  })

  it('returns 0 for a non-positive count rather than NaN', () => {
    expect(wrap(3, 0)).toBe(0)
  })

  it('keeps a one-card stack visible at depth 0 regardless of delta', () => {
    // Break-it: remove the `count === 1` guard in wrap() and this fails,
    // because the range [-1, count - 1) collapses to [-1, 0) for count 1,
    // which excludes 0 and returns -1 instead.
    expect(wrap(0, 1)).toBe(0)
    expect(wrap(0.7, 1)).toBe(0)
    expect(wrap(-3.2, 1)).toBe(0)
  })

  it('stays in range at a floating-point seam where the negative correction rounds up to count', () => {
    // Constructed by searching for a delta where (delta + 1) % count lands on
    // a tiny negative number whose sum with count rounds to exactly count in
    // double precision. Before the `d -= count` guard, wrap(-1.0000000000000002, 3)
    // returned 2, which is outside the documented range [-1, count - 1) = [-1, 2).
    // Break-it: remove the `if (d >= count) d -= count` line in wrap() and
    // this fails: the function returns 2 instead of -1.
    const delta = -1.0000000000000002
    const count = 3
    const result = wrap(delta, count)
    expect(result).toBeGreaterThanOrEqual(-1)
    expect(result).toBeLessThan(count - 1)
    expect(result).toBe(-1)
  })

  it('always lands in [-1, count - 1), and equals 0 for a one-card stack', () => {
    fc.assert(
      fc.property(
        fc.float({ min: -1000, max: 1000, noNaN: true }),
        fc.integer({ min: 1, max: 200 }),
        (delta, count) => {
          const d = wrap(delta, count)
          if (count === 1) return d === 0
          return d >= -1 && d < count - 1
        },
      ),
      { numRuns: 100000 },
    )
  })

  it('is periodic in count, compared modulo count at the seam', () => {
    // Near the wrap point, -1 and count - 1 are the same position on the
    // ring, and floating-point rounding in `delta + count` can legitimately
    // put the two sides of this comparison on opposite sides of the seam.
    // A circular value's periodicity has to be compared modulo count, not
    // with a plain absolute difference.
    fc.assert(
      fc.property(
        fc.float({ min: -100, max: 100, noNaN: true }),
        fc.integer({ min: 2, max: 50 }),
        (delta, count) => {
          const diff = Math.abs(wrap(delta, count) - wrap(delta + count, count))
          return diff < 1e-9 || Math.abs(diff - count) < 1e-9
        },
      ),
      { numRuns: 100000 },
    )
  })
})
