import { describe, expect, it } from 'vitest'
import { shouldGrow } from './growth'

// Ported verbatim from examples/react-infinite-feed/src/growth.test.ts: same
// cases, same assertions, proving the vanilla guard behaves identically to
// the one it was copied from.
describe('shouldGrow', () => {
  it('is false while a page is already loading, even at the end', () => {
    // Precondition: without the isLoading guard this exact state (active
    // card two from the end, threshold 2) is the one case the function
    // exists to say yes to. Asserting it here first proves the guard is
    // what flips the answer, not some other condition.
    expect(shouldGrow({ activeIndex: 5, count: 8, isLoading: false }, 2)).toBe(true)
    expect(shouldGrow({ activeIndex: 5, count: 8, isLoading: true }, 2)).toBe(false)
  })

  it('stays false on every check across a simulated loading window', () => {
    // Simulates the real failure mode: activeIndex sits inside the
    // threshold window for the whole 300ms a fetch takes, and something
    // re-checks growth several times during it. A correct guard answers
    // false every single time after the first.
    const state = { activeIndex: 6, count: 8, isLoading: false }
    let triggers = 0
    for (let tick = 0; tick < 5; tick++) {
      if (shouldGrow(state, 2)) {
        triggers++
        state.isLoading = true
      }
    }
    expect(triggers).toBe(1)
  })

  it('is false when not yet within the threshold of the end', () => {
    expect(shouldGrow({ activeIndex: 2, count: 8, isLoading: false }, 2)).toBe(false)
  })

  it('is false for an empty feed', () => {
    expect(shouldGrow({ activeIndex: 0, count: 0, isLoading: false }, 2)).toBe(false)
  })

  it('is true exactly at the threshold boundary', () => {
    // count 8, threshold 2: index 5 is the first index the rule covers
    // (8 - 1 - 2 = 5). Index 4 must not trigger.
    expect(shouldGrow({ activeIndex: 4, count: 8, isLoading: false }, 2)).toBe(false)
    expect(shouldGrow({ activeIndex: 5, count: 8, isLoading: false }, 2)).toBe(true)
  })
})
