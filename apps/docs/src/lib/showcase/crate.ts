/**
 * Showcase scene 2, crate digging: record sleeves on a looping horizontal
 * stack. When the stack comes to rest the record slides partway out of the
 * front sleeve and spins; grabbing the stack, or moving to another sleeve,
 * tucks it back in. The markup is server rendered by
 * src/components/showcase/CrateDigging.astro, and the slide and spin are
 * CSS transitions keyed off the `is-playing` class set here. The `setup`
 * region is what that scene's "View the code" panel shows.
 */
// #region setup
import { createRiffle, fan } from '@rpxl/riffle'
// #endregion setup

export function mountCrateDigging(scene: HTMLElement): void {
  const stack = scene.querySelector<HTMLElement>('[data-stack]')
  const nowPlaying = scene.querySelector<HTMLElement>('[data-now-playing]')
  if (!stack || !nowPlaying) return

  // #region setup
  const sleeves = Array.from(stack.querySelectorAll<HTMLElement>('.sleeve'))

  // bounds defaults to 'loop': the crate never runs out.
  const riffle = createRiffle(stack, {
    count: sleeves.length,
    cardWidth: 'auto',
    cardHeight: 'auto',
    maxVisible: 4,
    layout: fan({ offset: 30, scaleStep: 0.06 }),
    getLabel: (i) => sleeves[i]!.dataset.label!,
  })
  sleeves.forEach((sleeve, i) => riffle.registerNode(i, sleeve))

  // At rest, the record slides out of the front sleeve and spins.
  riffle.on('settle', ({ index }) => sleeves[index]!.classList.add('is-playing'))

  // Grab the stack, or move to another sleeve, and it slides back in.
  const tuckAway = () => sleeves.forEach((sleeve) => sleeve.classList.remove('is-playing'))
  riffle.on('dragstart', tuckAway)
  riffle.on('change', ({ index }) => {
    tuckAway()
    nowPlaying.textContent = sleeves[index]!.dataset.label!
  })

  // The first sleeve never settled into place, so it starts out playing.
  sleeves[0]!.classList.add('is-playing')
  // #endregion setup
}
