import type { SpringConfig, SpringPreset } from '../types'

export interface SpringState {
  value: number
  velocity: number
}

/**
 * The `stiffness`/`damping` behind each named {@link SpringPreset}. Frozen,
 * so a consumer mutating an exported preset cannot change the feel of
 * every instance created afterwards.
 *
 * @example
 * ```ts
 * import { SPRING_PRESETS } from '@rpxl/riffle'
 *
 * const { stiffness, damping } = SPRING_PRESETS.snappy
 * ```
 */
export const SPRING_PRESETS: Readonly<Record<SpringPreset, Readonly<SpringConfig>>> =
  /* @__PURE__ */ Object.freeze({
    snappy: Object.freeze({ stiffness: 420, damping: 38 }),
    smooth: Object.freeze({ stiffness: 260, damping: 30 }),
    stiff: Object.freeze({ stiffness: 600, damping: 48 }),
  })

/**
 * The spring `createRiffle` uses when `options.spring` is omitted.
 *
 * @example
 * ```ts
 * import { DEFAULT_SPRING } from '@rpxl/riffle'
 *
 * const options = { count: 5, spring: DEFAULT_SPRING }
 * ```
 */
export const DEFAULT_SPRING: Readonly<SpringConfig> = /* @__PURE__ */ Object.freeze({
  stiffness: 340,
  damping: 34,
})

export function resolveSpring(
  spec: SpringPreset | SpringConfig | undefined,
): Readonly<SpringConfig> {
  if (spec === undefined) return DEFAULT_SPRING
  if (typeof spec === 'string') return SPRING_PRESETS[spec]
  return spec
}

/**
 * One semi-implicit Euler step. Mutates `state` in place so the frame loop
 * allocates nothing. Always call with a fixed `dt`; see animation/loop.ts.
 */
export function springStep(
  state: SpringState,
  target: number,
  config: Readonly<SpringConfig>,
  dt: number,
): void {
  const acceleration = -config.stiffness * (state.value - target) - config.damping * state.velocity
  state.velocity += acceleration * dt
  state.value += state.velocity * dt
}

export function isSettled(state: SpringState, target: number): boolean {
  return Math.abs(state.value - target) < 0.001 && Math.abs(state.velocity) < 0.01
}
