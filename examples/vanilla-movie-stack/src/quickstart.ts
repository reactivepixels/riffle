import { createRiffle } from '@rpxl/riffle'

const stack = document.getElementById('stack')!
// One grid cell for every card: Riffle positions them from there with transforms.
// justify-content keeps that cell the card's own width (centred), so the fan
// scales about the card itself.
stack.style.cssText = 'display: grid; justify-content: center; padding: 32px 0'
// Name the carousel: screen readers announce this label with it.
stack.setAttribute('aria-label', 'Films')

const riffle = createRiffle(stack, { count: 5, cardWidth: 300, cardHeight: 400 })

for (let i = 0; i < 5; i++) {
  const card = stack.appendChild(document.createElement('div'))
  card.textContent = String(i + 1)
  card.style.cssText = `grid-area: 1 / 1; width: 300px; height: 400px; border-radius: 16px;
    background: hsl(${i * 72} 65% 45%); color: white; display: grid; place-items: center`
  riffle.registerNode(i, card)
}

// Drag the front card, or wire riffle.next(), riffle.prev() and riffle.goTo(index)
// to controls of your own.
