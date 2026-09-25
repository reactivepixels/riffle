import { createAdapterHandle, type RiffleOptions, type RiffleSnapshot } from '@rpxl/riffle'
import { computed, onBeforeUnmount, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { createCardDirective, createRootDirective } from './directives'

/**
 * Accepts a ref, a getter, or a plain options object, and returns `state`,
 * `activeIndex`, the two directives (`vRiffleRoot`, `vRiffleCard`), and the
 * imperative handle (`next`, `prev`, `goTo`, `on`, `instance`). Options are
 * compared with the previous set inside a `watch`, and only what changed
 * reaches the engine's `update()`.
 *
 * @example
 * ```ts
 * import { useRiffle } from '@rpxl/riffle/vue'
 *
 * const films = [{ title: 'Neon Harbor' }]
 * const riffle = useRiffle(() => ({ count: films.length, cardWidth: 300, cardHeight: 400 }))
 * ```
 */
export function useRiffle(options: MaybeRefOrGetter<RiffleOptions>) {
  const handle = createAdapterHandle({ ...toValue(options) })
  const state = shallowRef<RiffleSnapshot>(handle.getSnapshot())
  const stop = handle.subscribe(() => {
    state.value = handle.getSnapshot()
  })

  // Spreading reads every top-level key, so this tracks refs, getters and
  // reactive objects alike, and hands setOptions a plain copy to diff.
  watch(
    () => ({ ...toValue(options) }),
    (next) => handle.setOptions(next),
  )

  onBeforeUnmount(() => {
    stop()
    handle.rootRef(null)
  })

  return {
    state,
    activeIndex: computed(() => state.value.activeIndex),
    vRiffleRoot: createRootDirective(handle),
    vRiffleCard: createCardDirective(handle),
    get instance() {
      return handle.instance
    },
    next: handle.next,
    prev: handle.prev,
    goTo: handle.goTo,
    on: handle.on,
  }
}

/**
 * What `useRiffle` returns.
 *
 * @example
 * ```ts
 * import type { RiffleHandle } from '@rpxl/riffle/vue'
 *
 * function useStack(handle: RiffleHandle) {
 *   return handle.activeIndex
 * }
 * ```
 */
export type RiffleHandle = ReturnType<typeof useRiffle>
