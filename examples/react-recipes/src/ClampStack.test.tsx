import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ClampStack from './ClampStack'
import { waypoints } from './waypoints'

afterEach(() => {
  cleanup()
})

describe('ClampStack', () => {
  it('disables Prev at index 0 and Next at the last index, and re-enables the other end on the way', () => {
    const { getByRole } = render(<ClampStack />)
    const prevButton = getByRole('button', { name: /^previous/i }) as HTMLButtonElement
    const nextButton = getByRole('button', { name: /^next/i }) as HTMLButtonElement

    // Precondition: starts at index 0, so Prev is genuinely disabled from
    // the very first render, not coincidentally never clicked yet, and Next
    // is genuinely enabled (there is more than one waypoint to clamp
    // against).
    expect(prevButton.disabled).toBe(true)
    expect(nextButton.disabled).toBe(false)

    // Click past the end. A disabled button ignores a real click (jsdom/
    // happy-dom honour `disabled` the same way a browser does), so clicking
    // more times than there are waypoints is safe and lands exactly on the
    // last index either way.
    for (let i = 0; i < waypoints.length + 2; i++) {
      act(() => nextButton.click())
    }

    // Clamped at the last card: Next is disabled, and Prev, which was
    // disabled at the start, is enabled again now that there is somewhere
    // to go back to.
    expect(nextButton.disabled).toBe(true)
    expect(prevButton.disabled).toBe(false)
  })
  // Break-it proof: remove `bounds: 'clamp'` from ClampStack.tsx's
  // `useRiffle` options (the default is `bounds: 'loop'`). Every assertion
  // above then fails: at index 0, `canPrev` is `true` under loop bounds (see
  // packages/core/src/snapshot.ts's `canPrev: bounds === 'loop' ? count > 1
  // : start > 0`), so `prevButton.disabled` is `false`, not `true`; and
  // repeatedly clicking Next simply wraps around instead of clamping at the
  // last index, so `nextButton.disabled` never becomes `true` at all.
})
