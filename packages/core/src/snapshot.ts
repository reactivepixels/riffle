import type { RiffleOptions, RiffleSnapshot } from './types'

/**
 * The snapshot an instance created with these options reports before anything
 * moves. Adapters render from it before mount and during server rendering.
 *
 * Must agree with the engine's own first snapshot exactly, or every adapter
 * flashes on mount; tests/adapter.test.ts guards this with a property test
 * against a real instance rather than examples.
 *
 * @example
 * ```ts
 * import { initialSnapshot } from '@rpxl/riffle'
 *
 * const snapshot = initialSnapshot({ count: 5, startIndex: 2 })
 * ```
 */
export function initialSnapshot(options: RiffleOptions): RiffleSnapshot {
  const count = options.count
  const bounds = options.bounds ?? 'loop'
  const raw = options.startIndex ?? 0
  const start = bounds === 'clamp' ? Math.min(Math.max(raw, 0), Math.max(count - 1, 0)) : raw
  return {
    activeIndex: count > 0 ? ((start % count) + count) % count : 0,
    count,
    isDragging: false,
    isSettling: false,
    canPrev: bounds === 'loop' ? count > 1 : start > 0,
    canNext: bounds === 'loop' ? count > 1 : start < count - 1,
  }
}
