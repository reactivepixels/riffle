import { smoothstep } from '../math/smoothstep'
import type { LayoutGeometry, LayoutStrategy, Pose } from '../types'

/**
 * Tunes `fan()`'s look.
 *
 * @example
 * ```ts
 * import { fan } from '@rpxl/riffle'
 *
 * const layout = fan({ scaleStep: 0.1, offset: 24 })
 * ```
 */
export interface FanOptions {
  /** Scale lost per unit of depth. Default 0.08. */
  scaleStep?: number
  /** Pixels each card behind the front is offset. Default 32. */
  offset?: number
}

/**
 * A fresh, zeroed pose. Allocate these once per card, never per frame.
 *
 * @example
 * ```ts
 * import { createPose } from '@rpxl/riffle'
 *
 * const pose = createPose()
 * ```
 */
export function createPose(): Pose {
  return { main: 0, cross: 0, rotation: 0, scale: 1, opacity: 1, zIndex: 0 }
}

/**
 * The default layout: the front card at the origin, cards behind fanned to the
 * negative side at decreasing scale, and a linear exit slot across depth
 * -1 to 0 so a drag tracks the finger 1:1.
 *
 * @example
 * ```ts
 * import { createRiffle, fan } from '@rpxl/riffle'
 *
 * const riffle = createRiffle(stack, { count: 5, layout: fan({ scaleStep: 0.1 }) })
 * ```
 */
export function fan(options: FanOptions = {}): LayoutStrategy {
  const scaleStep = options.scaleStep ?? 0.08
  const offset = options.offset ?? 32

  return {
    name: 'fan',

    stepTravel(geometry) {
      return geometry.cardExtent + geometry.gap
    },

    pose(depth, geometry, out) {
      if (depth <= 0) {
        const t = -depth
        // When depth is 0, -depth is -0. Multiplying by a positive number
        // preserves -0, and Object.is(-0, 0) is false. Normalize it here
        // rather than loosening the test assertion.
        out.main = t * (geometry.cardExtent + geometry.gap) + 0
        out.cross = 0
        out.scale = 1
        out.opacity = 1 - t * t
      } else {
        out.main = -offset * depth
        out.cross = 0
        const scale = 1 - scaleStep * depth
        out.scale = scale < 0 ? 0 : scale
        out.opacity = 1 - smoothstep(geometry.maxVisible - 1, geometry.maxVisible, depth)
      }
      out.rotation = 0
      out.zIndex = Math.round(geometry.count - depth)
      return out
    },
  }
}
