import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { Riffle } from '../../src/vue/Riffle'

/**
 * Server render, then hydrate that exact HTML, and collect Vue's hydration
 * warnings. Vue only runs its mismatch checks in development builds (which
 * tests use), so a production page never logs these; this is where they are
 * caught.
 */
async function hydrationWarnings(root: Component): Promise<string[]> {
  const container = document.createElement('div')
  container.innerHTML = await renderToString(createSSRApp(root))
  document.body.append(container)

  const warnings: string[] = []
  const app = createSSRApp(root)
  app.config.warnHandler = (msg) => warnings.push(msg)
  const errors: unknown[] = []
  const original = console.error
  console.error = (...args: unknown[]) => errors.push(args[0])
  try {
    app.mount(container)
  } finally {
    console.error = original
  }
  app.unmount()
  container.remove()
  return [...warnings, ...errors.map(String)].filter((msg) => /hydration/i.test(msg))
}

const slot = { card: ({ card }: { card: unknown }) => h('span', String(card)) }

describe('hydration', () => {
  it('the Riffle drop-in hydrates without a mismatch', async () => {
    const warnings = await hydrationWarnings({
      render: () => h(Riffle, { cards: ['a', 'b', 'c'], cardWidth: 300, cardHeight: 400 }, slot),
    })
    expect(warnings).toEqual([])
  })

  it('hydrates without a mismatch when the consumer styles the root', async () => {
    // Vue only compares an element's style when its vnode has one, so this
    // is the case that exposes server-only styles.
    const warnings = await hydrationWarnings({
      render: () =>
        h(
          Riffle,
          {
            cards: ['a', 'b', 'c'],
            cardWidth: 300,
            cardHeight: 400,
            style: { justifyContent: 'center' },
          },
          slot,
        ),
    })
    expect(warnings).toEqual([])
  })

  it('a consumer inline display wins on the server and the client alike', async () => {
    const root = {
      render: () =>
        h(
          Riffle,
          { cards: ['a', 'b'], cardWidth: 300, cardHeight: 400, style: { display: 'inline-grid' } },
          slot,
        ),
    }
    const html = await renderToString(createSSRApp(root))
    const doc = document.createElement('div')
    doc.innerHTML = html
    expect((doc.querySelector('[data-riffle-root]') as HTMLElement).style.display).toBe(
      'inline-grid',
    )
    expect(await hydrationWarnings(root)).toEqual([])
  })
})
