/**
 * Showcase scene 4, flashcards: a clamped study deck that works without a
 * pointer. The engine already moves between cards on the arrow keys, Home
 * and End; this module adds the flip (a tap, or Enter or Space on the
 * focused front card), keeps each face's `aria-hidden` honest, and moves
 * the progress dots. The markup is server rendered by
 * src/components/showcase/Flashcards.astro. The `setup` region is what that
 * scene's "View the code" panel shows.
 */
// #region setup
import { createRiffle } from '@rpxl/riffle'
// #endregion setup

export function mountFlashcards(scene: HTMLElement): void {
  const stack = scene.querySelector<HTMLElement>('[data-stack]')
  const live = scene.querySelector<HTMLElement>('[data-live]')
  const dots = Array.from(scene.querySelectorAll<HTMLElement>('[data-dot]'))
  if (!stack || !live) return

  // #region setup
  const cards = Array.from(stack.querySelectorAll<HTMLElement>('.flashcard'))

  const riffle = createRiffle(stack, {
    count: cards.length,
    bounds: 'clamp',
    cardWidth: 'auto',
    cardHeight: 'auto',
    maxVisible: 3,
    getLabel: (i) => cards[i]!.dataset.label!,
  })
  cards.forEach((card, i) => riffle.registerNode(i, card))

  // Only the face you can see is in the accessibility tree.
  const setFlipped = (card: HTMLElement, flipped: boolean) => {
    card.classList.toggle('is-flipped', flipped)
    card.querySelector('.front')!.setAttribute('aria-hidden', String(flipped))
    card.querySelector('.back')!.setAttribute('aria-hidden', String(!flipped))
    live.textContent = flipped ? card.dataset.answer! : ''
  }

  // A tap flips, but a drag that started on the card does not.
  let dragged = false
  stack.addEventListener('pointerdown', () => (dragged = false))
  riffle.on('dragstart', () => (dragged = true))
  for (const card of cards) {
    const flip = () => setFlipped(card, !card.classList.contains('is-flipped'))
    card.addEventListener('click', () => dragged || flip())
    card.addEventListener('keydown', (event) => {
      if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      flip()
    })
  }

  // Arrow keys, Home and End are built in. Moving on turns the last card back.
  riffle.on('change', ({ index, previousIndex }) => {
    setFlipped(cards[previousIndex]!, false)
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index))
  })
  // #endregion setup
}
