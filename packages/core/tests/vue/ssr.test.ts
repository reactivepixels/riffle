// @vitest-environment node
import {
  createSSRApp,
  defineComponent,
  h,
  withDirectives,
  type DirectiveBinding,
  type ObjectDirective,
  type VNode,
} from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import type { AdapterHandle } from '@rpxl/riffle'
import { createCardDirective, createRootDirective } from '../../src/vue/directives'
import { Riffle } from '../../src/vue/Riffle'
import { useRiffle } from '../../src/vue/useRiffle'

/** Parse the rendered HTML with a real DOM parser rather than matching strings. */
async function parse(html: string): Promise<Document> {
  const { Window } = await import('happy-dom')
  const window = new Window()
  window.document.body.innerHTML = html
  return window.document as unknown as Document
}

describe('server rendering', () => {
  it('stacks the root and the cards before hydration, through the directives', async () => {
    // Precondition: this really is a server render, with no DOM to write to.
    expect(typeof document).toBe('undefined')

    const Comp = defineComponent({
      setup() {
        const riffle = useRiffle({ count: 2, cardWidth: 300, cardHeight: 400 })
        return () =>
          withDirectives(
            h('section', { class: 'stack' }, [
              withDirectives(h('article'), [[riffle.vRiffleCard, 0]]),
              withDirectives(h('article'), [[riffle.vRiffleCard, 1]]),
            ]),
            [[riffle.vRiffleRoot]],
          )
      },
    })
    const doc = await parse(await renderToString(createSSRApp(Comp)))

    const root = doc.querySelector('section') as HTMLElement
    expect(root.hasAttribute('data-riffle-root')).toBe(true)
    expect(root.style.display).toBe('grid')
    expect(root.className).toBe('stack')
    const cards = [...doc.querySelectorAll('article')] as HTMLElement[]
    expect(cards.map((card) => card.getAttribute('data-riffle-card'))).toEqual(['0', '1'])
    for (const card of cards) expect(card.style.gridArea).toBe('1 / 1')
  })

  it('stacks the Riffle drop-in before hydration', async () => {
    const app = createSSRApp({
      render: () =>
        h(
          Riffle,
          { cards: ['a', 'b', 'c'], cardWidth: 300, cardHeight: 400 },
          { card: ({ card }: { card: unknown }) => h('span', String(card)) },
        ),
    })
    const doc = await parse(await renderToString(app))

    const root = doc.querySelector('[data-riffle-root]') as HTMLElement | null
    expect(root).not.toBeNull()
    expect(root!.style.display).toBe('grid')
    const cards = [...doc.querySelectorAll('[data-riffle-card]')] as HTMLElement[]
    expect(cards.length).toBe(3)
    expect(cards[2]!.getAttribute('data-riffle-card')).toBe('2')
    expect(cards[2]!.style.gridArea).toBe('1 / 1')
    expect(cards[2]!.textContent).toBe('c')
  })

  it('keeps a style binding that already sets display or grid-area', async () => {
    const Comp = defineComponent({
      setup() {
        const riffle = useRiffle({ count: 2, cardWidth: 300, cardHeight: 400 })
        return () =>
          withDirectives(
            h('section', { style: 'display: inline-grid; gap: 4px' }, [
              withDirectives(h('article', { style: [{ gridArea: '1 / 1 / 2 / 2' }] }), [
                [riffle.vRiffleCard, 0],
              ]),
              withDirectives(h('article', { style: { width: '10px' } }), [[riffle.vRiffleCard, 1]]),
            ]),
            [[riffle.vRiffleRoot]],
          )
      },
    })
    const doc = await parse(await renderToString(createSSRApp(Comp)))

    const root = doc.querySelector('section') as HTMLElement
    expect(root.style.display).toBe('inline-grid')
    expect(root.style.gap).toBe('4px')
    const [first, second] = [...doc.querySelectorAll('article')] as HTMLElement[]
    expect(first!.style.gridArea).toBe('1 / 1 / 2 / 2')
    // A style binding without grid-area still gets the stacking cell.
    expect(second!.style.gridArea).toBe('1 / 1')
    expect(second!.style.width).toBe('10px')
  })

  it('still stacks when a compiled template calls the directives without a vnode', () => {
    // Vue's compiled server templates (every .vue file, and so Nuxt) call
    // getSSRProps(binding, null); only render functions pass the vnode.
    // getSSRProps never touches the handle, so an empty one is enough, and no
    // component instance is needed.
    const handle = {} as AdapterHandle
    const riffle = {
      vRiffleRoot: createRootDirective(handle),
      vRiffleCard: createCardDirective(handle),
    }
    const noVnode = null as unknown as VNode
    const binding = (value: unknown) => ({ value }) as DirectiveBinding
    expect(
      (riffle.vRiffleRoot as ObjectDirective).getSSRProps!(binding(undefined), noVnode),
    ).toEqual({
      style: { display: 'grid' },
      'data-riffle-root': '',
    })
    expect(
      (riffle.vRiffleCard as ObjectDirective<HTMLElement, number>).getSSRProps!(
        binding(0) as DirectiveBinding<number>,
        noVnode,
      ),
    ).toEqual({
      style: { gridArea: '1 / 1' },
      'data-riffle-card': '0',
    })
  })
})
