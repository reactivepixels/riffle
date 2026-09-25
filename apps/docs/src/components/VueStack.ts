/**
 * The Vue half of the landing page's "One engine, three frameworks" section
 * (see index.mdx). A real @rpxl/riffle/vue stack driving the same film data
 * the Vue movie-stack example ships, so the docs page and the example stay
 * one source of truth instead of two that can drift apart.
 *
 * Written with defineComponent and h() rather than a .vue single-file
 * component, so it stays plain TypeScript with no template to compile.
 *
 * `role`/`aria-roledescription` below: see ReactStack.tsx's own doc comment
 * for why this island supplies them itself rather than leaving them to the
 * core engine's own post-mount a11y setup (packages/core/src/a11y.ts).
 */
import { defineComponent, h, ref } from 'vue'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/vue'
import {
  filmAt,
  films,
  posterGradient,
  type Film,
} from '../../../../examples/vue-movie-stack/src/films'
import './demo-stack.css'

const POSTER_WIDTH = 160
const POSTER_HEIGHT = 240

// Module scope, so the engine sees the same function every time.
const getLabel = (index: number) => filmAt(index).title

export default defineComponent({
  name: 'VueStack',
  setup() {
    const activeIndex = ref(0)
    const riffleRef = ref<RiffleInstance | null>(null)

    return () =>
      h('div', { class: 'demo-stack' }, [
        h('p', { class: 'demo-stack__label' }, 'Vue'),
        h(
          Riffle,
          {
            'aria-label': 'Films',
            role: 'group',
            'aria-roledescription': 'carousel',
            cards: films,
            getKey: (_card: unknown, index: number) => filmAt(index).title,
            getLabel,
            cardWidth: POSTER_WIDTH,
            cardHeight: POSTER_HEIGHT,
            style: { width: `${POSTER_WIDTH}px`, height: `${POSTER_HEIGHT}px` },
            ref: riffleRef,
            onChange: (event: { index: number }) => {
              activeIndex.value = event.index
            },
          },
          {
            // The slot's `card` prop is typed `unknown` today, so narrow it
            // with a cast.
            card: ({ card }: { card: unknown }) => {
              const film = card as Film
              return h('div', {
                class: 'demo-stack__poster',
                style: { background: posterGradient(film) },
              })
            },
          },
        ),
        h('div', { class: 'demo-stack__controls' }, [
          h(
            'button',
            {
              type: 'button',
              'aria-label': 'Previous film',
              onClick: () => riffleRef.value?.prev(),
            },
            [h('span', { 'aria-hidden': 'true' }, '‹')],
          ),
          h('span', { class: 'demo-stack__title' }, filmAt(activeIndex.value).title),
          h(
            'button',
            { type: 'button', 'aria-label': 'Next film', onClick: () => riffleRef.value?.next() },
            [h('span', { 'aria-hidden': 'true' }, '›')],
          ),
        ]),
      ])
  },
})
