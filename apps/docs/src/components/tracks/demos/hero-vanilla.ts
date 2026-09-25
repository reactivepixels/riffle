/**
 * The vanilla hero as a track demo: the same cards (../../../lib/hero-cards.ts),
 * stylesheet and markup as the landing page's VanillaRiffle.astro, built
 * into whatever element it is given rather than into fixed ids, so it can
 * mount anywhere and more than once. Returns a teardown that destroys the
 * engine and empties the element.
 */
import { createRiffle } from '@rpxl/riffle'
import { heroCards } from '../../../lib/hero-cards'
import '../../hero-stack.css'

function button(label: string, text: string): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.setAttribute('aria-label', label)
  el.textContent = text
  return el
}

export function mount(host: HTMLElement): () => void {
  const root = document.createElement('div')
  root.className = 'riffle-hero not-content'

  const stack = document.createElement('div')
  stack.className = 'riffle-hero__stack'
  stack.setAttribute('role', 'group')
  stack.setAttribute('aria-label', 'Riffle live demo')

  const cardEls = heroCards.map((card, i) => {
    const el = document.createElement('div')
    el.className = 'riffle-hero__card'
    el.style.background = card.gradient
    el.dataset.index = String(i)
    el.textContent = card.title
    return el
  })
  stack.append(...cardEls)

  const controls = document.createElement('div')
  controls.className = 'riffle-hero__controls'
  const prev = button('Previous card', '← Prev')
  const next = button('Next card', 'Next →')
  controls.append(prev, next)

  const hint = document.createElement('p')
  hint.className = 'riffle-hero__hint'
  hint.textContent = 'Drag a card, or use the buttons.'

  root.append(stack, controls, hint)
  host.replaceChildren(root)

  const riffle = createRiffle(stack, {
    count: cardEls.length,
    cardWidth: stack.clientWidth,
    cardHeight: stack.clientHeight,
  })
  cardEls.forEach((el, i) => riffle.registerNode(i, el))
  next.addEventListener('click', () => riffle.next())
  prev.addEventListener('click', () => riffle.prev())

  return () => {
    riffle.destroy()
    host.replaceChildren()
  }
}
