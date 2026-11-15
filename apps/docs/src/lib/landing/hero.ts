/**
 * The landing page's hero stack: six pieces of showcase art in one live
 * Riffle stack. On every change the whole hero floods to the front card's
 * own colour, and the caption under the stack names the card and links to
 * the showcase scene it comes from. Every card carries its flood, ink,
 * caption and link as data attributes, server rendered by
 * src/pages/index.astro, each flood and ink pair checked for WCAG AA.
 */
import { createRiffle, fan } from '@rpxl/riffle'

export function mountLandingHero(hero: HTMLElement): void {
  const stack = hero.querySelector<HTMLElement>('[data-stack]')
  const prevButton = hero.querySelector<HTMLButtonElement>('[data-prev]')
  const nextButton = hero.querySelector<HTMLButtonElement>('[data-next]')
  const caption = hero.querySelector<HTMLAnchorElement>('[data-hero-caption]')
  if (!stack || !prevButton || !nextButton || !caption) return

  const cards = Array.from(stack.querySelectorAll<HTMLElement>('.hero-card'))

  const riffle = createRiffle(stack, {
    count: cards.length,
    cardWidth: 'auto',
    cardHeight: 'auto',
    maxVisible: 4,
    layout: fan({ offset: 40, scaleStep: 0.07 }),
    getLabel: (i) => cards[i]!.dataset.label!,
  })
  cards.forEach((card, i) => riffle.registerNode(i, card))

  riffle.on('change', ({ index }) => {
    const { flood, ink, caption: text, href } = cards[index]!.dataset
    hero.style.setProperty('--bg', flood!)
    hero.style.setProperty('--ink', ink!)
    caption.textContent = text!
    caption.href = href!
  })

  prevButton.addEventListener('click', () => riffle.prev())
  nextButton.addEventListener('click', () => riffle.next())
}
