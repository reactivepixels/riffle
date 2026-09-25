import { createAdapterHandle, type AdapterHandle, type RiffleOptions } from '@rpxl/riffle'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type Ref,
  type RefCallback,
} from 'react'
import { mergeRef } from './refs'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Stack every card in one grid cell. The engine positions them with transforms. */
const ROOT_STYLE: CSSProperties = { display: 'grid' }
const CARD_STYLE: CSSProperties = { gridArea: '1 / 1' }

type ElementProps = HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> }

/**
 * What `useRiffle` returns: the imperative handle plus a pair of prop
 * getters that wire whatever markup you render to the engine.
 *
 * @example
 * ```tsx
 * import { useRiffle } from '@rpxl/riffle/react'
 *
 * function Stack({ films }: { films: { title: string }[] }) {
 *   const riffle = useRiffle({ count: films.length, cardWidth: 300, cardHeight: 400 })
 *   return <div {...riffle.getRootProps()} />
 * }
 * ```
 */
export interface RiffleHandle extends Pick<
  AdapterHandle,
  'instance' | 'subscribe' | 'getSnapshot' | 'on' | 'next' | 'prev' | 'goTo'
> {
  /** Props for the stack container. Your own props win, except `ref`, which is composed. */
  getRootProps<P extends ElementProps>(
    props?: P,
  ): P & { ref: RefCallback<HTMLElement>; style: CSSProperties }
  /**
   * Props for the card at `index`. Your own props win, except `ref`, which
   * is composed. Pass a stable ref: one whose identity changes every render
   * re-registers that card with the engine on every render too. Harmless
   * (registerCard is idempotent for the same element), but wasted work.
   */
  getCardProps<P extends ElementProps>(
    index: number,
    props?: P,
  ): P & { ref: RefCallback<HTMLElement>; style: CSSProperties }
}

/**
 * Creates one adapter per component instance and returns prop getters plus
 * the imperative handle. `options` is diffed against the previous render's
 * inside an effect, so passing a fresh object every render is safe; only
 * what actually changed reaches the engine's `update()`.
 *
 * @example
 * ```tsx
 * import { useRiffle } from '@rpxl/riffle/react'
 *
 * function Stack({ films }: { films: { title: string }[] }) {
 *   const riffle = useRiffle({ count: films.length, cardWidth: 300, cardHeight: 400 })
 *   return (
 *     <div {...riffle.getRootProps()}>
 *       {films.map((film, i) => (
 *         <div key={i} {...riffle.getCardProps(i)}>{film.title}</div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useRiffle(options: RiffleOptions): RiffleHandle {
  const [adapter] = useState(() => createAdapterHandle(options))

  // Diffed inside setOptions, so running every render is cheap and safe.
  useIsomorphicLayoutEffect(() => {
    adapter.setOptions(options)
  })

  return useMemo<RiffleHandle>(
    () => ({
      get instance() {
        return adapter.instance
      },
      subscribe: adapter.subscribe,
      getSnapshot: adapter.getSnapshot,
      on: adapter.on,
      next: adapter.next,
      prev: adapter.prev,
      goTo: adapter.goTo,
      getRootProps(props) {
        return {
          ...props,
          'data-riffle-root': '',
          ref: mergeRef(adapter.rootRef, props?.ref),
          style: props?.style ? { ...ROOT_STYLE, ...props.style } : ROOT_STYLE,
        } as never
      },
      getCardProps(index, props) {
        return {
          ...props,
          'data-riffle-card': index,
          ref: mergeRef(adapter.cardRef(index), props?.ref),
          style: props?.style ? { ...CARD_STYLE, ...props.style } : CARD_STYLE,
        } as never
      },
    }),
    [adapter],
  )
}
