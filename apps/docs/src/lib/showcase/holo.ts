/**
 * Showcase scene 3, holo trading cards: an exaggerated grab tilt, and a foil
 * sheen that reads the drag every frame. The handler only writes two custom
 * properties on the held card; src/components/showcase/HoloCards.astro's
 * CSS turns them into the holo band's slide and the glare's strength, with
 * transforms and opacity alone. The `setup` region is what that scene's
 * "View the code" panel shows.
 */
// #region setup
import { createRiffle } from '@rpxl/riffle'
// #endregion setup

export function mountHoloCards(scene: HTMLElement): void {
  const stack = scene.querySelector<HTMLElement>('[data-stack]')
  if (!stack) return

  // #region setup
  const cards = Array.from(stack.querySelectorAll<HTMLElement>('.holo'))

  const riffle = createRiffle(stack, {
    count: cards.length,
    cardWidth: 'auto',
    cardHeight: 'auto',
    // A big tilt, mostly from where you grab: corners swing hardest.
    rotation: { maxRotation: 24, leverFactor: 0.9 },
    getLabel: (i) => cards[i]!.dataset.label!,
  })
  cards.forEach((card, i) => riffle.registerNode(i, card))

  let held: HTMLElement | null = null
  let width = 1
  riffle.on('dragstart', ({ index }) => {
    held = cards[index]!
    width = held.offsetWidth
    held.classList.add('is-held')
  })

  // Every frame of the drag: no allocation, just two numbers for the CSS.
  riffle.on('drag', ({ progress, offset }) => {
    if (!held) return
    held.style.setProperty('--shift', (offset / width).toFixed(3))
    held.style.setProperty('--glow', Math.min(1, Math.abs(progress)).toFixed(3))
  })

  // Let go and the light settles back with a CSS transition.
  riffle.on('dragend', () => {
    if (!held) return
    held.classList.remove('is-held')
    held.style.setProperty('--shift', '0')
    held.style.setProperty('--glow', '0')
    held = null
  })
  // #endregion setup
}
