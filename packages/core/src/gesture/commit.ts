export interface CommitInput {
  /** Drag distance as a signed fraction of one step. */
  progress: number
  /** Pixels per millisecond, signed. */
  velocity: number
  /** Fraction of a step that commits on distance alone. */
  threshold: number
  /** Pixels per millisecond that commits regardless of distance. */
  flingVelocity: number
}

export interface CommitDecision {
  commit: boolean
  direction: 1 | -1 | 0
}

/**
 * Decide what a release means.
 *
 * Velocity takes precedence over distance whenever it clears the fling bar,
 * because it is the more recent statement of intent. Dragging forty percent
 * one way and then flicking back should follow the flick.
 */
export function decideCommit(input: CommitInput): CommitDecision {
  const byFling = Math.abs(input.velocity) >= input.flingVelocity
  const byDistance = Math.abs(input.progress) >= input.threshold

  if (!byFling && !byDistance) return { commit: false, direction: 0 }

  const signal = byFling ? input.velocity : input.progress
  return { commit: true, direction: signal > 0 ? 1 : -1 }
}
