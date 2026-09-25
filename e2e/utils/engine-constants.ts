/**
 * Numbers pulled straight from the engine so specs test real thresholds, not
 * guesses. Each constant cites the source line it was read from; if the
 * engine's defaults ever change, these must be re-derived from the same
 * files, not adjusted to make a spec pass.
 */

/** packages/core/src/gesture/velocity.ts: DEFAULT_WINDOW_MS. */
export const VELOCITY_WINDOW_MS = 100

/** packages/core/src/riffle.ts: attachPointer(container, { slop: 6, ... }). */
export const SLOP_PX = 6

/** packages/core/src/riffle.ts: DEFAULTS.threshold (fraction of one step). */
export const COMMIT_THRESHOLD = 0.25

/** packages/core/src/riffle.ts: DEFAULTS.flingVelocity (px/ms). */
export const FLING_VELOCITY_PX_MS = 0.5

/** playwright.config.ts's device-emulation project name for real CDP touch input. */
export const MOBILE_PROJECT = 'mobile-chromium'

/**
 * One example's step travel in pixels: `layout.stepTravel(geometry)` for the
 * default fan layout is `cardExtent + gap` (packages/core/src/layout/fan.ts).
 * `progress = dragOffset / travel`, so every drag distance below is derived
 * from this, not eyeballed.
 */
export interface ExampleGeometry {
  cardExtent: number
  gap: number
}

export function stepTravelPx(geometry: ExampleGeometry): number {
  return geometry.cardExtent + geometry.gap
}
