import type { RotationOptions } from '../types'

export interface RotationInput {
  /** Signed drag distance as a fraction of one step. */
  progress: number
  /** Where the pointer grabbed the card, across the axis, relative to its centre. */
  grabOffsetCross: number
  /** Card size across the axis, in pixels. */
  crossExtent: number
  /** Total pointer travel along the axis, in pixels. */
  deltaMain: number
  /** Total pointer travel across the axis, in pixels. */
  deltaCross: number
}

/**
 * Every rotation option with its default filled in. Not `Required<>`: under
 * exactOptionalPropertyTypes that keeps the explicit `| undefined` the
 * options declare, so it would not actually mean "resolved".
 *
 * @example
 * ```ts
 * import type { ResolvedRotation } from '@rpxl/riffle'
 *
 * const resolved: ResolvedRotation = { maxRotation: 16, baseFactor: 0.35, leverFactor: 0.65, trajFactor: 0.15 }
 * ```
 */
export type ResolvedRotation = Record<keyof RotationOptions, number>

/**
 * `RotationOptions`'s defaults, resolved. Frozen, like the spring
 * presets; see animation/spring.ts.
 *
 * @example
 * ```ts
 * import { DEFAULT_ROTATION } from '@rpxl/riffle'
 *
 * const maxDegrees = DEFAULT_ROTATION.maxRotation // 16
 * ```
 */
export const DEFAULT_ROTATION: Readonly<ResolvedRotation> = /* @__PURE__ */ Object.freeze({
  maxRotation: 16,
  baseFactor: 0.35,
  leverFactor: 0.65,
  trajFactor: 0.15,
})

/**
 * Fill in every rotation option's default once, at construction, so the
 * per-frame computeRotation call does no fallback work. Field by field rather
 * than a spread, so an explicit `undefined` still falls back to the default.
 */
export function resolveRotation(options: RotationOptions): ResolvedRotation {
  return {
    maxRotation: options.maxRotation ?? DEFAULT_ROTATION.maxRotation,
    baseFactor: options.baseFactor ?? DEFAULT_ROTATION.baseFactor,
    leverFactor: options.leverFactor ?? DEFAULT_ROTATION.leverFactor,
    trajFactor: options.trajFactor ?? DEFAULT_ROTATION.trajFactor,
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/**
 * Degrees to add to the front card's pose while it is being dragged.
 *
 * Three contributions. The distance term tilts with how far the card has been
 * pulled. The lever term makes the grab point matter: pull from near the top
 * edge and the card pivots one way, pull from near the bottom and the same
 * drag pivots it the other. The trajectory term adds a little more tilt to a
 * diagonal drag than to a flat one.
 */
export function computeRotation(input: RotationInput, options: Readonly<ResolvedRotation>): number {
  const max = options.maxRotation
  const baseFactor = options.baseFactor
  const leverFactor = options.leverFactor
  const trajFactor = options.trajFactor

  const pull = clamp(input.progress, -1, 1)
  const half = input.crossExtent / 2
  const lever = half > 0 ? clamp(-input.grabOffsetCross / half, -1, 1) : 0

  const base = max * pull * baseFactor
  const leverTilt = max * pull * lever * leverFactor

  let traj = 0
  if (trajFactor !== 0 && (input.deltaMain !== 0 || input.deltaCross !== 0)) {
    traj = max * Math.sin(Math.atan2(input.deltaCross, input.deltaMain)) * trajFactor
  }

  return clamp(base + leverTilt + traj, -max, max)
}
