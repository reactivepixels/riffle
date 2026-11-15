/**
 * Showcase scene 1, boarding passes: a vertical wallet that stops at the
 * first and last leg, and tints the whole scene to the front pass's
 * destination on every change. The markup (and each pass's label, tint and
 * route code, as data attributes) is server rendered by
 * src/components/showcase/BoardingPasses.astro. The `setup` region is what
 * that scene's "View the code" panel shows.
 */
// #region setup
import { createRiffle, fan } from '@rpxl/riffle'
// #endregion setup

export function mountBoardingPasses(scene: HTMLElement): void {
  const stack = scene.querySelector<HTMLElement>('[data-stack]')
  const prevButton = scene.querySelector<HTMLButtonElement>('[data-prev]')
  const nextButton = scene.querySelector<HTMLButtonElement>('[data-next]')
  const counter = scene.querySelector<HTMLElement>('[data-counter]')
  const backdrop = scene.querySelector<HTMLElement>('[data-backdrop]')
  if (!stack || !prevButton || !nextButton || !counter || !backdrop) return

  // #region setup
  const passes = Array.from(stack.querySelectorAll<HTMLElement>('.pass'))

  const riffle = createRiffle(stack, {
    count: passes.length,
    axis: 'y',
    bounds: 'clamp',
    cardWidth: 'auto',
    cardHeight: 'auto',
    maxVisible: 4,
    layout: fan({ offset: 60, scaleStep: 0.07 }),
    getLabel: (i) => passes[i]!.dataset.label!,
  })
  passes.forEach((pass, i) => riffle.registerNode(i, pass))

  // The whole scene takes on the colour of wherever you fly next.
  riffle.on('change', ({ index }) => {
    const pass = passes[index]!
    scene.style.setProperty('--bg', pass.dataset.tint!)
    backdrop.dataset.code = pass.dataset.code
  })

  // Clamped at both ends, so the buttons say when there is nowhere to go.
  const sync = () => {
    const { activeIndex, canPrev, canNext } = riffle.getSnapshot()
    prevButton.setAttribute('aria-disabled', String(!canPrev))
    nextButton.setAttribute('aria-disabled', String(!canNext))
    counter.textContent = `${activeIndex + 1} / ${passes.length}`
  }
  riffle.subscribe(sync)
  sync()
  prevButton.addEventListener('click', () => riffle.prev())
  nextButton.addEventListener('click', () => riffle.next())
  // #endregion setup
}
