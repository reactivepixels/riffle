import type {
  AdapterHandle,
  Axis,
  Bounds,
  LayoutStrategy,
  ReducedMotionMode,
  Riffle as RiffleEngine,
  RiffleEventMap,
  RiffleOptions,
  RiffleSnapshot,
  RotationOptions,
  SpringConfig,
  SpringPreset,
} from '@rpxl/riffle'
import {
  defineComponent,
  h,
  onBeforeUnmount,
  withDirectives,
  type ComponentObjectPropsOptions,
  type DefineSetupFnComponent,
  type PropType,
  type SlotsType,
  type VNodeChild,
} from 'vue'
import { useRiffle } from './useRiffle'

/**
 * Every RiffleOptions key except `count`, which the drop-in derives from
 * `cards.length`. `satisfies Record<keyof Omit<RiffleOptions, 'count'>,
 * true>` makes a missing key a compile error (the Record requires every key)
 * and so is an extra one (excess property checking on the object literal),
 * so a new core option cannot be silently dropped by this component.
 */
const OPTION_KEY_FLAGS = {
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

const OPTION_KEYS = Object.keys(OPTION_KEY_FLAGS) as (keyof typeof OPTION_KEY_FLAGS)[]

/** Copies only the option keys whose prop value is not undefined. */
function pickDefinedOptions(props: Record<string, unknown>): Partial<RiffleOptions> {
  const out: Partial<RiffleOptions> = {}
  for (const key of OPTION_KEYS) {
    const value = props[key]
    if (value !== undefined) (out as Record<string, unknown>)[key] = value
  }
  return out
}

/**
 * Props for the `<Riffle>` drop-in, generic over the card type `T`. Every
 * RiffleOptions key except `count` (derived from `cards.length`) is a prop
 * here too.
 *
 * @example
 * ```ts
 * import type { RiffleProps } from '@rpxl/riffle/vue'
 *
 * const props: RiffleProps<{ title: string }> = { cards: [{ title: 'Neon Harbor' }] }
 * ```
 */
export interface RiffleProps<T> extends Omit<RiffleOptions, 'count'> {
  /** The cards to render. Each becomes one registered card, in order. */
  cards: readonly T[]
  /** Stable key per card. Defaults to the index; provide one for lists that reorder. */
  getKey?: (card: T, index: number) => PropertyKey
  /** A class for every card element. */
  cardClassName?: string
}

/**
 * Card slot props, typed by whatever array you pass to `cards`: `card` is
 * that array's element type, not `unknown`.
 *
 * @example
 * ```ts
 * import type { RiffleCardSlotProps } from '@rpxl/riffle/vue'
 *
 * function renderCard({ card, index }: RiffleCardSlotProps<{ title: string }>) {
 *   return `${index}: ${card.title}`
 * }
 * ```
 */
export interface RiffleCardSlotProps<T> {
  /** The card at `index`. */
  card: T
  /** The card's position in the `cards` array you passed. */
  index: number
}

type RiffleEmits = { change: (event: RiffleEventMap['change']) => true }
type RiffleSlots<T> = SlotsType<{ card: (props: RiffleCardSlotProps<T>) => VNodeChild }>

/**
 * The component this module actually builds, before the generic cast below.
 * `T` is `unknown` here: Vue 3.3+'s function-signature `defineComponent`
 * cannot carry a per-usage type parameter through both a runtime `props`
 * object (needed for the Boolean-default trap below) and a `slots` option at
 * once, so the runtime shape is authored once, monomorphically, exactly the
 * way it was before this component had a type parameter at all.
 */
const RUNTIME_PROPS = {
  cards: { type: Array as PropType<readonly unknown[]>, required: true },
  getKey: {
    type: Function as PropType<(card: unknown, index: number) => PropertyKey>,
    default: undefined,
  },
  cardClassName: { type: String, default: undefined },
  cardWidth: { type: [Number, String] as PropType<number | 'auto'>, default: undefined },
  cardHeight: { type: [Number, String] as PropType<number | 'auto'>, default: undefined },
  gap: { type: Number, default: undefined },
  maxVisible: { type: Number, default: undefined },
  bounds: { type: String as PropType<Bounds>, default: undefined },
  axis: { type: String as PropType<Axis>, default: undefined },
  threshold: { type: Number, default: undefined },
  flingVelocity: { type: Number, default: undefined },
  startIndex: { type: Number, default: undefined },
  // Every prop whose type includes Boolean must declare `default:
  // undefined`. Without it Vue casts an absent Boolean prop to `false`,
  // which would silently disable dragging for every consumer who did not
  // set `draggable`.
  draggable: { type: Boolean, default: undefined },
  spring: { type: [String, Object] as PropType<SpringPreset | SpringConfig>, default: undefined },
  rotation: {
    type: [Boolean, Object] as PropType<false | RotationOptions>,
    default: undefined,
  },
  crossFollow: { type: Number, default: undefined },
  reducedMotion: { type: String as PropType<ReducedMotionMode>, default: undefined },
  layout: { type: Object as PropType<LayoutStrategy>, default: undefined },
  getLabel: {
    type: Function as PropType<(index: number) => string>,
    default: undefined,
  },
} satisfies ComponentObjectPropsOptions<RiffleProps<unknown>>

const RawRiffle = defineComponent({
  name: 'Riffle',
  props: RUNTIME_PROPS,
  emits: {
    change: (_event: RiffleEventMap['change']) => true,
  },
  slots: Object as SlotsType<{
    card: (props: RiffleCardSlotProps<unknown>) => VNodeChild
  }>,
  setup(props, { emit, expose, slots }) {
    const riffle = useRiffle(() => ({
      ...pickDefinedOptions(props),
      count: props.cards.length,
    }))

    const offChange = riffle.on('change', (event) => emit('change', event))
    onBeforeUnmount(offChange)

    expose({
      next: riffle.next,
      prev: riffle.prev,
      goTo: riffle.goTo,
      on: riffle.on,
      get instance() {
        return riffle.instance
      },
      activeIndex: riffle.activeIndex,
      state: riffle.state,
    })

    return () =>
      withDirectives(
        h(
          'div',
          // On the vnode rather than left to the directive, so the server and
          // the client agree on it and Vue's hydration check does too. A
          // consumer's own style falls through after this and wins.
          { style: { display: 'grid' } },
          props.cards.map((card, index) =>
            withDirectives(
              h(
                'div',
                {
                  key: props.getKey ? props.getKey(card, index) : index,
                  class: props.cardClassName,
                },
                slots.card?.({ card, index }) ?? undefined,
              ),
              [[riffle.vRiffleCard, index]],
            ),
          ),
        ),
        [[riffle.vRiffleRoot]],
      )
  },
})

/**
 * `RawRiffle` above is built once, monomorphically (see its own comment).
 * This is the type consumers actually see: a generic constructor, one type
 * parameter per usage, built from Vue's own `DefineSetupFnComponent`, the
 * type its function-signature `defineComponent` overload itself returns.
 * Casting into it changes nothing at runtime, only the type `<Riffle
 * :cards="films">` infers `card` and `getKey` as in a template: `films`'s
 * element type, not `unknown`. The same erase-then-recast shape the React
 * adapter's `forwardRef` cast uses for the same reason (`Riffle.tsx`).
 */
type GenericRiffleComponent = new <T>(
  props: RiffleProps<T>,
) => InstanceType<DefineSetupFnComponent<RiffleProps<T>, RiffleEmits, RiffleSlots<T>>>

/**
 * The drop-in card stack, generic over the card type. Pass `cards` and a
 * `#card="{ card, index }"` slot: `card` is typed as `cards`'s element type
 * at every call site. Every Riffle option is a prop, plus `getKey` for lists
 * that reorder and `cardClassName` for a class on every card element.
 *
 * @example
 * ```vue
 * <template>
 *   <Riffle aria-label="Films" :cards="films" :card-width="300" :card-height="400">
 *     <template #card="{ card }">
 *       <div class="poster">{{ card.title }}</div>
 *     </template>
 *   </Riffle>
 * </template>
 *
 * <script setup lang="ts">
 * import { Riffle } from '@rpxl/riffle/vue'
 *
 * const films = [{ title: 'Neon Harbor' }]
 * </script>
 * ```
 */
export const Riffle = RawRiffle as unknown as GenericRiffleComponent

/**
 * What a parent's template ref on `<Riffle>` receives: imperative control and
 * the current state. The same members as the React drop-in's `riffleRef`.
 * Vue unwraps the refs, so `activeIndex` and `state` read as plain values,
 * and they are reactive when read in a template or computed.
 *
 * @example
 * ```ts
 * import { ref } from 'vue'
 * import type { RiffleInstance } from '@rpxl/riffle/vue'
 *
 * const riffleRef = ref<RiffleInstance | null>(null)
 * // later: riffleRef.value?.next()
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
  on: AdapterHandle['on']
  /** The live engine, or null before mount and after unmount. */
  readonly instance: RiffleEngine | null
  /** The card currently at the front. Reactive when read in a template or a `computed`. */
  readonly activeIndex: number
  /** The full current snapshot. Reactive when read in a template or a `computed`. */
  readonly state: RiffleSnapshot
}
