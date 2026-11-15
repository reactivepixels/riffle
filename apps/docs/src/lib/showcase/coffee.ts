/**
 * Showcase scene 5, coffee origins: one bag per origin, and on every change
 * the whole scene floods to the front bag's own colour, with the type
 * following it there. Each bag carries its flood and ink colours as data
 * attributes, server rendered by src/components/showcase/CoffeeOrigins.astro,
 * every pair checked for WCAG AA contrast. The `setup` region is what that
 * scene's "View the code" panel shows.
 */
// #region setup
import { createRiffle, fan } from '@rpxl/riffle'
// #endregion setup

export function mountCoffeeOrigins(scene: HTMLElement): void {
  const stack = scene.querySelector<HTMLElement>('[data-stack]')
  const prevButton = scene.querySelector<HTMLButtonElement>('[data-prev]')
  const nextButton = scene.querySelector<HTMLButtonElement>('[data-next]')
  if (!stack || !prevButton || !nextButton) return

  // #region setup
  const bags = Array.from(stack.querySelectorAll<HTMLElement>('.bag'))

  const riffle = createRiffle(stack, {
    count: bags.length,
    cardWidth: 'auto',
    cardHeight: 'auto',
    maxVisible: 4,
    layout: fan({ offset: 36, scaleStep: 0.06 }),
    getLabel: (i) => bags[i]!.dataset.label!,
  })
  bags.forEach((bag, i) => riffle.registerNode(i, bag))

  // Your brand, your colours: the scene floods to the bag in front, and
  // the headline, copy and buttons follow through the --ink property.
  riffle.on('change', ({ index }) => {
    const { flood, ink } = bags[index]!.dataset
    scene.style.setProperty('--bg', flood!)
    scene.style.setProperty('--ink', ink!)
  })

  // #endregion setup
  // The roast and tasting notes for the bag in front, under the stack.
  const detailText = scene.querySelector<HTMLElement>('[data-detail-text]')
  riffle.on('change', ({ index }) => {
    if (detailText) detailText.textContent = bags[index]!.dataset.detail!
  })
  // #region setup

  prevButton.addEventListener('click', () => riffle.prev())
  nextButton.addEventListener('click', () => riffle.next())
  // #endregion setup
}
