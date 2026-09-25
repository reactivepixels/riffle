import type { RiffleSnapshot } from '@rpxl/riffle'
import { useRef, useSyncExternalStore } from 'react'
import type { RiffleHandle } from './useRiffle'

/**
 * Subscribe to one slice of the snapshot. A component selecting `activeIndex`
 * does not re-render when `isDragging` flips. The selected value is cached per
 * snapshot, so a selector that returns a new object is safe.
 *
 * @example
 * ```tsx
 * import { useRiffle, useRiffleState } from '@rpxl/riffle/react'
 *
 * function Stack({ films }: { films: { title: string }[] }) {
 *   const riffle = useRiffle({ count: films.length })
 *   const activeIndex = useRiffleState(riffle, (snapshot) => snapshot.activeIndex)
 *   return <p>{films[activeIndex]?.title}</p>
 * }
 * ```
 */
export function useRiffleState<T>(
  riffle: RiffleHandle,
  selector: (snapshot: RiffleSnapshot) => T,
): T {
  const cache = useRef<{ snapshot: RiffleSnapshot; selector: typeof selector; value: T } | null>(
    null,
  )
  const read = (): T => {
    const snapshot = riffle.getSnapshot()
    const hit = cache.current
    if (hit && hit.snapshot === snapshot && hit.selector === selector) return hit.value
    const value = selector(snapshot)
    cache.current = { snapshot, selector, value }
    return value
  }
  return useSyncExternalStore(riffle.subscribe, read, read)
}
