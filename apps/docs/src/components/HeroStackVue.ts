/**
 * The Vue track overview page's own "hero" demo (`<Demo name="hero">` in
 * src/tracks/index.mdx; see src/lib/track-demos.ts). Same card data
 * (../lib/hero-cards.ts) and the same visible box size as VanillaRiffle.astro
 * (the landing page's own hero demo) and HeroStackReact.tsx
 * (hero-stack.css's `.riffle-hero__stack`), so all three read as the same
 * demo regardless of which track (or the landing page) a visitor is on.
 *
 * `.riffle-hero__stack` is sized by CSS alone; `<Riffle>` needs an actual
 * pixel number for `cardWidth`/`cardHeight`, so this component measures the
 * mounted box once and only then renders the engine into it, the same
 * "measure a sized box, then mount" order VanillaRiffle.astro's plain script
 * achieves for free by running after the box already has layout.
 *
 * Written with defineComponent and h(), like VueStack.ts, so it stays plain
 * TypeScript with no template to compile.
 *
 * `role`/`aria-roledescription` below: see ReactStack.tsx's own doc comment
 * for why this island supplies them itself rather than leaving them to the
 * core engine's own post-mount a11y setup.
 */
import { defineComponent, h, onMounted, ref } from 'vue'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/vue'
import { heroCards, type HeroCard } from '../lib/hero-cards'
import './hero-stack.css'

export default defineComponent({
  name: 'HeroStackVue',
  setup() {
    const measureEl = ref<HTMLElement | null>(null)
    const riffleRef = ref<RiffleInstance | null>(null)
    const size = ref<{ width: number; height: number } | null>(null)

    onMounted(() => {
      const el = measureEl.value
      if (el) size.value = { width: el.clientWidth, height: el.clientHeight }
    })

    return () =>
      h('div', { class: 'riffle-hero not-content' }, [
        h(
          'div',
          { ref: measureEl, class: 'riffle-hero__stack' },
          size.value
            ? [
                h(
                  Riffle,
                  {
                    'aria-label': 'Riffle live demo',
                    role: 'group',
                    'aria-roledescription': 'carousel',
                    cards: heroCards,
                    getKey: (_card: unknown, index: number) => heroCards[index]?.title,
                    cardWidth: size.value.width,
                    cardHeight: size.value.height,
                    ref: riffleRef,
                    cardClassName: 'riffle-hero__adapter-card',
                  },
                  {
                    card: ({ card }: { card: unknown }) => {
                      const heroCard = card as HeroCard
                      return h(
                        'div',
                        {
                          class: 'riffle-hero__card-face',
                          style: {
                            width: `${size.value!.width}px`,
                            height: `${size.value!.height}px`,
                            background: heroCard.gradient,
                          },
                        },
                        heroCard.title,
                      )
                    },
                  },
                ),
              ]
            : [],
        ),
        h('div', { class: 'riffle-hero__controls' }, [
          h(
            'button',
            {
              type: 'button',
              'aria-label': 'Previous card',
              onClick: () => riffleRef.value?.prev(),
            },
            [h('span', { 'aria-hidden': 'true' }, '← Prev')],
          ),
          h(
            'button',
            { type: 'button', 'aria-label': 'Next card', onClick: () => riffleRef.value?.next() },
            [h('span', { 'aria-hidden': 'true' }, 'Next →')],
          ),
        ]),
        h('p', { class: 'riffle-hero__hint' }, 'Drag a card, or use the buttons.'),
      ])
  },
})
