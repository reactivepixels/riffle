/**
 * The same stack outside <script setup>, from a handle you create yourself.
 * A template outside <script setup> cannot use a setup binding as a
 * directive, and a component's `directives` option is shared by every
 * instance, so it cannot hold one engine per instance. A render function can:
 * build the directives from the handle and pass them to withDirectives.
 * Shown on the docs site's Vue page.
 */
import { createAdapterHandle } from '@rpxl/riffle'
import { createCardDirective, createRootDirective } from '@rpxl/riffle/vue'
import { defineComponent, h, withDirectives } from 'vue'
import { filmAt, films, posterGradient } from './films'

const WIDTH = 160
const HEIGHT = 240

const getLabel = (index: number) => filmAt(index).title

export default defineComponent({
  name: 'RenderFunctionStack',
  setup() {
    const handle = createAdapterHandle({
      count: films.length,
      cardWidth: WIDTH,
      cardHeight: HEIGHT,
      getLabel,
    })
    // The root directive detaches the engine when the element unmounts.
    const vRiffleRoot = createRootDirective(handle)
    const vRiffleCard = createCardDirective(handle)

    return () =>
      withDirectives(
        h(
          'section',
          { 'aria-label': 'Films', style: { width: `${WIDTH}px` } },
          films.map((film, index) =>
            withDirectives(
              h('article', {
                key: film.title,
                style: {
                  width: `${WIDTH}px`,
                  height: `${HEIGHT}px`,
                  borderRadius: '16px',
                  background: posterGradient(film),
                },
              }),
              [[vRiffleCard, index]],
            ),
          ),
        ),
        [[vRiffleRoot]],
      )
  },
})
