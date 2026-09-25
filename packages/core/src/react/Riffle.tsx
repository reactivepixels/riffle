import type {
  Riffle as RiffleEngine,
  RiffleEventMap,
  RiffleOptions,
  RiffleSnapshot,
} from '@rpxl/riffle'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ForwardedRef,
  type HTMLAttributes,
  type Key,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { useRiffle, type RiffleHandle } from './useRiffle'

/**
 * Every RiffleOptions key except `count`, which the drop-in derives from
 * `cards.length`. `satisfies Record<...>` makes a missing or an extra key a
 * compile error, so a new core option cannot silently end up forwarded to
 * the DOM as an attribute instead of reaching the engine.
 */
const OPTION_KEYS = {
  cardWidth: true,
  cardHeight: true,
  gap: true,
  maxVisible: true,
  bounds: true,
  axis: true,
  threshold: true,
  flingVelocity: true,
  startIndex: true,
  draggable: true,
  spring: true,
  rotation: true,
  crossFollow: true,
  reducedMotion: true,
  layout: true,
  getLabel: true,
} satisfies Record<keyof Omit<RiffleOptions, 'count'>, true>

/**
 * What `riffleRef` receives: imperative control and a read of the current
 * state. The same members as the Vue drop-in's template ref. Reading
 * `activeIndex` or `state` here does not re-render anything; use `onChange`
 * for that.
 *
 * @example
 * ```tsx
 * import { useRef } from 'react'
 * import { Riffle, type RiffleInstance } from '@rpxl/riffle/react'
 *
 * function Stack({ films }: { films: { title: string }[] }) {
 *   const riffleRef = useRef<RiffleInstance>(null)
 *   return (
 *     <Riffle riffleRef={riffleRef} cards={films} cardWidth={300} cardHeight={400}>
 *       {(film) => <div>{film.title}</div>}
 *     </Riffle>
 *   )
 * }
 * ```
 */
export interface RiffleInstance {
  /** Advances to the next card, with the spring's animation. */
  next(): void
  /** Moves to the previous card, with the spring's animation. */
  prev(): void
  /** Moves to `index`, animated unless `opts.animate` is false. */
  goTo(index: number, opts?: { animate?: boolean }): void
  /** Subscribes to one engine event. Returns an unsubscribe function. */
  on: RiffleHandle['on']
  /** The live engine, or null before mount and after unmount. */
  readonly instance: RiffleEngine | null
  /** The card currently at the front. Not reactive; read it, do not watch it. */
  readonly activeIndex: number
  /** The full current snapshot. Not reactive; read it, do not watch it. */
  readonly state: RiffleSnapshot
}

/**
 * Props for the `<Riffle>` drop-in. Every `RiffleOptions` key except `count`
 * (derived from `cards.length`) is a prop here too.
 *
 * @example
 * ```tsx
 * import type { RiffleProps } from '@rpxl/riffle/react'
 *
 * const films = [{ title: 'Neon Harbor' }]
 * const props: RiffleProps<{ title: string }> = {
 *   cards: films,
 *   children: (film) => <div>{film.title}</div>,
 * }
 * ```
 */
export interface RiffleProps<T>
  extends
    Omit<RiffleOptions, 'count'>,
    Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onChange' | 'draggable'> {
  /** The cards to render. Each becomes one registered card, in order. */
  cards: readonly T[]
  /** Renders one card's content. */
  children: (card: T, index: number) => ReactNode
  /** Stable key per card. Defaults to the index; provide one for lists that reorder. */
  getKey?: (card: T, index: number) => Key
  /** Fires whenever the active index changes, whether from a drag, a button, or `goTo()`. */
  onChange?: (event: RiffleEventMap['change']) => void
  /** Receives the imperative handle, for controls such as external next and prev buttons. */
  riffleRef?: Ref<RiffleInstance | null>
  /** A class applied to every card element. */
  cardClassName?: string
  /** The root element. Composed with Riffle's own root ref; see the `Riffle` doc comment. */
  ref?: Ref<HTMLDivElement>
}

function RiffleInner<T>(props: RiffleProps<T>, ref: ForwardedRef<HTMLDivElement>) {
  // `props.ref` is declared on RiffleProps for consumers, but `forwardRef`
  // never actually puts it on the props object it hands to this render
  // function: it always arrives as the second argument instead. Destructure
  // it out here anyway so `rest` can never carry a stale `ref` key onto
  // `attrs` ahead of the real one below.
  const {
    cards,
    children,
    getKey,
    onChange,
    riffleRef,
    cardClassName,
    ref: _ignored,
    ...rest
  } = props
  const options: Record<string, unknown> = { count: cards.length }
  const attrs: Record<string, unknown> = { ref }
  for (const [key, value] of Object.entries(rest)) {
    if (key in OPTION_KEYS) options[key] = value
    else attrs[key] = value
  }
  const riffle = useRiffle(options as unknown as RiffleOptions)

  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => riffle.on('change', (event) => onChangeRef.current?.(event)), [riffle])

  useImperativeHandle(
    riffleRef,
    (): RiffleInstance => ({
      next: riffle.next,
      prev: riffle.prev,
      goTo: riffle.goTo,
      on: riffle.on,
      get instance() {
        return riffle.instance
      },
      get activeIndex() {
        return riffle.getSnapshot().activeIndex
      },
      get state() {
        return riffle.getSnapshot()
      },
    }),
    [riffle],
  )

  return (
    <div {...riffle.getRootProps(attrs)}>
      {cards.map((card, index) => (
        <div
          key={getKey ? getKey(card, index) : index}
          {...riffle.getCardProps(index, { className: cardClassName })}
        >
          {children(card, index)}
        </div>
      ))}
    </div>
  )
}

/**
 * The drop-in card stack. Pass `cards` and a render-prop child. Every other
 * prop that is not a Riffle option (such as `id`, `aria-label` or `data-*`)
 * goes to the root element, with `style` and `className` merged.
 *
 * `ref` reaches the root element: it is composed with Riffle's own root ref,
 * the same way `getRootProps` composes a `ref` passed through `rest`. The
 * component is wrapped in `forwardRef` so this works under both React 18 and
 * React 19: React 19 accepts `ref` as a plain prop on a function component,
 * but React 18 strips a bare `ref` before the function ever sees it, so only
 * `forwardRef` receives it on 18. `forwardRef` also erases the generic `<T>`
 * from `RiffleInner`'s signature, so the exported value is cast back to a
 * generic call signature; this changes nothing at runtime, only the type
 * consumers see.
 *
 * @example
 * ```tsx
 * import { Riffle } from '@rpxl/riffle/react'
 *
 * function Stack({ films }: { films: { title: string }[] }) {
 *   return (
 *     <Riffle aria-label="Films" cards={films} cardWidth={300} cardHeight={400}>
 *       {(film) => <div className="poster">{film.title}</div>}
 *     </Riffle>
 *   )
 * }
 * ```
 */
export const Riffle = forwardRef(RiffleInner) as <T>(
  props: RiffleProps<T> & { ref?: Ref<HTMLDivElement> },
) => ReactElement | null
