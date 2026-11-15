/**
 * Showcase scene 6, stories: 9:16 cards with a segmented progress bar that
 * calls `next()` every few seconds. The bar is the timer: a CSS animation
 * fills the active segment and `next()` runs when it ends, so pausing the
 * animation (drag, hover, focus, the pause button, or the scene leaving the
 * screen) pauses the timer with it. Under `prefers-reduced-motion` nothing
 * advances on its own. The markup is server rendered by
 * src/components/showcase/Stories.astro. The `setup` region is what that
 * scene's "View the code" panel shows.
 */
// #region setup
import { createRiffle } from '@rpxl/riffle'
// #endregion setup
import { prefersReducedMotion } from './lazy'

export function mountStories(scene: HTMLElement): void {
  const stack = scene.querySelector<HTMLElement>('[data-stack]')
  const bar = scene.querySelector<HTMLElement>('[data-bar]')
  const pauseButton = scene.querySelector<HTMLButtonElement>('[data-pause]')
  const prevButton = scene.querySelector<HTMLButtonElement>('[data-prev]')
  const nextButton = scene.querySelector<HTMLButtonElement>('[data-next]')
  if (!stack || !bar || !pauseButton || !prevButton || !nextButton) return
  const segments = Array.from(bar.children) as HTMLElement[]

  // #region setup
  const stories = Array.from(stack.querySelectorAll<HTMLElement>('.story'))

  const riffle = createRiffle(stack, {
    count: stories.length,
    cardWidth: 'auto',
    cardHeight: 'auto',
    maxVisible: 3,
    getLabel: (i) => stories[i]!.dataset.label!,
  })
  stories.forEach((story, i) => riffle.registerNode(i, story))
  prevButton.addEventListener('click', () => riffle.prev())
  nextButton.addEventListener('click', () => riffle.next())

  // Done segments are full, the active one fills over five seconds.
  riffle.on('change', ({ index }) => {
    segments.forEach((segment, i) => {
      segment.classList.toggle('is-done', i < index)
      segment.classList.toggle('is-active', i === index)
    })
  })

  if (prefersReducedMotion()) return // No auto-advance, ever.
  bar.addEventListener('animationend', () => riffle.next())

  // Any one reason to wait holds the bar, and with it the timer.
  const holds = new Set<string>()
  const hold = (reason: string, on: boolean) => {
    if (on) holds.add(reason)
    else holds.delete(reason)
    bar.classList.toggle('is-paused', holds.size > 0)
  }
  riffle.on('dragstart', () => hold('drag', true))
  riffle.on('dragend', () => hold('drag', false))
  stack.addEventListener('pointerenter', (e) => hold('hover', e.pointerType === 'mouse'))
  stack.addEventListener('pointerleave', () => hold('hover', false))
  stack.addEventListener('focusin', () => hold('focus', true))
  stack.addEventListener('focusout', () => hold('focus', false))
  pauseButton.addEventListener('click', () => {
    const paused = pauseButton.getAttribute('aria-pressed') !== 'true'
    pauseButton.setAttribute('aria-pressed', String(paused))
    hold('button', paused)
  })
  // #endregion setup

  pauseButton.hidden = false
  bar.classList.add('is-running')
  // Off screen, or in a background tab, the timer waits too.
  new IntersectionObserver(([entry]) => hold('offscreen', !entry?.isIntersecting)).observe(stack)
  document.addEventListener('visibilitychange', () => hold('hidden', document.hidden))
}
