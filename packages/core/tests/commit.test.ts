import { describe, expect, it } from 'vitest'
import { decideCommit } from '../src/gesture/commit'

const base = { threshold: 0.25, flingVelocity: 0.5 }

describe('decideCommit', () => {
  it('returns to rest below both bars', () => {
    expect(decideCommit({ ...base, progress: 0.1, velocity: 0.1 })).toEqual({
      commit: false,
      direction: 0,
    })
  })

  it('commits forward on distance alone', () => {
    expect(decideCommit({ ...base, progress: 0.4, velocity: 0 })).toEqual({
      commit: true,
      direction: 1,
    })
  })

  it('commits backward on distance alone', () => {
    expect(decideCommit({ ...base, progress: -0.4, velocity: 0 })).toEqual({
      commit: true,
      direction: -1,
    })
  })

  it('commits on a fling that barely moved', () => {
    expect(decideCommit({ ...base, progress: 0.05, velocity: 1.2 })).toEqual({
      commit: true,
      direction: 1,
    })
  })

  it('lets a late flick win against the direction already dragged', () => {
    // The POC prefers sign(offset) and only consults velocity when offset is
    // exactly zero, so it advances forward here, against the user's flick.
    expect(decideCommit({ ...base, progress: 0.4, velocity: -0.8 })).toEqual({
      commit: true,
      direction: -1,
    })
  })

  it('uses distance when velocity is below the fling bar', () => {
    expect(decideCommit({ ...base, progress: 0.4, velocity: -0.2 })).toEqual({
      commit: true,
      direction: 1,
    })
  })

  it('treats the threshold as inclusive', () => {
    expect(decideCommit({ ...base, progress: 0.25, velocity: 0 })).toEqual({
      commit: true,
      direction: 1,
    })
  })

  it('treats the fling bar as inclusive', () => {
    expect(decideCommit({ ...base, progress: 0, velocity: 0.5 })).toEqual({
      commit: true,
      direction: 1,
    })
  })

  it('does not commit on a dead release at the origin', () => {
    expect(decideCommit({ ...base, progress: 0, velocity: 0 })).toEqual({
      commit: false,
      direction: 0,
    })
  })

  // Mutant 430 (EqualityOperator, `signal > 0 ? 1 : -1` loosened to `signal
  // >= 0`): the tie-break at signal exactly zero only fires when a commit is
  // forced with a zero threshold, since riffle.ts never configures a real
  // instance with threshold <= 0. decideCommit is a pure function with no
  // such floor of its own, so calling it directly at the degenerate boundary
  // is the only way to observe which side of the tie `direction` lands on.
  it('breaks a tie at signal exactly zero toward -1, not 1 (mutant 430)', () => {
    expect(decideCommit({ progress: 0, velocity: 0, threshold: 0, flingVelocity: 0.5 })).toEqual({
      commit: true,
      direction: -1,
    })
  })
})
