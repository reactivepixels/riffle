import { createRiffle, type Riffle } from '@rpxl/riffle'
import { filmAt, films } from './films'
import './app.css'

const CARD_WIDTH = 240
const CARD_HEIGHT = 320

// Module scope, so the engine sees the same function for the life of the
// instance.
const getLabel = (index: number) => filmAt(index).title

/**
 * Builds a stack of films, each holding a real text input, inside `el`.
 * Mirrors examples/react-movie-stack/src/FormCardsStack.tsx and demonstrates
 * three things:
 *
 * - An editable target keeps its own keys: typing in the focused input,
 *   including arrow keys and Home/End, moves the caret instead of the
 *   stack. The engine already does this (packages/core/src/keyboard.ts's
 *   `isEditableTarget` guard), no configuration needed.
 * - A background card's input is genuinely unreachable: every card but the
 *   active one is `inert` (packages/core/src/a11y.ts), so Tab, a screen
 *   reader's virtual cursor, and a direct `.focus()` call can none of them
 *   reach a note field that is not currently on top.
 * - Where focus lands when the active card changes while a field inside it
 *   is focused: the `change` listener below moves focus into the new
 *   card's own note field directly, with no microtask, because the core
 *   updates accessibility state (including its own focus-follow onto the
 *   new active card's root) before it emits `change`, so this handler's
 *   call is the last write to focus for this tick, not a race with it.
 */
export function mount(el: HTMLElement): () => void {
  el.innerHTML = ''

  const page = document.createElement('main')
  page.className = 'recipe-forms'

  const stage = document.createElement('div')
  stage.className = 'stage'
  const stack = document.createElement('div')
  stack.className = 'stack'
  stack.setAttribute('aria-label', 'Films')
  stack.style.display = 'grid'
  stage.appendChild(stack)
  page.appendChild(stage)

  const controls = document.createElement('div')
  controls.className = 'controls'
  const prevButton = document.createElement('button')
  prevButton.type = 'button'
  prevButton.className = 'control'
  prevButton.setAttribute('aria-label', 'Previous film')
  prevButton.innerHTML = '<span aria-hidden="true">&#8249;</span>'
  const readout = document.createElement('span')
  readout.className = 'readout'
  readout.setAttribute('data-testid', 'readout')
  const nextButton = document.createElement('button')
  nextButton.type = 'button'
  nextButton.className = 'control'
  nextButton.setAttribute('aria-label', 'Next film')
  nextButton.setAttribute('data-testid', 'next-button')
  nextButton.innerHTML = '<span aria-hidden="true">&#8250;</span>'
  controls.appendChild(prevButton)
  controls.appendChild(readout)
  controls.appendChild(nextButton)
  page.appendChild(controls)

  el.appendChild(page)

  const cards: HTMLElement[] = []
  // One entry per card's own note field, read from the `change` listener
  // below to move focus into the field itself, one step further than where
  // the engine's own focus-following already lands (the new active card's
  // root element).
  const noteFields: HTMLInputElement[] = []

  // #region card-fields
  films.forEach((film, index) => {
    const card = document.createElement('div')
    card.className = 'card'
    card.style.gridArea = '1 / 1'
    card.style.width = `${CARD_WIDTH}px`
    card.style.height = `${CARD_HEIGHT}px`

    const heading = document.createElement('strong')
    heading.className = 'card-title'
    heading.textContent = film.title

    const inputId = `forms-in-cards-note-${index}`
    const label = document.createElement('label')
    label.className = 'card-label'
    label.setAttribute('for', inputId)
    label.textContent = 'Your note'

    const input = document.createElement('input')
    input.type = 'text'
    input.id = inputId
    input.className = 'card-input'
    input.placeholder = `What did you think of ${film.title}?`

    card.appendChild(heading)
    card.appendChild(label)
    card.appendChild(input)
    stack.appendChild(card)
    cards.push(card)
    noteFields.push(input)
  })
  // #endregion card-fields

  const riffle: Riffle = createRiffle(stack, {
    count: films.length,
    cardWidth: CARD_WIDTH,
    cardHeight: CARD_HEIGHT,
    getLabel,
  })

  cards.forEach((card, index) => riffle.registerNode(index, card))

  function updateReadout(index: number): void {
    readout.textContent = `${index + 1} / ${films.length}`
  }

  function onPrev(): void {
    riffle.prev()
  }
  function onNext(): void {
    riffle.next()
  }
  prevButton.addEventListener('click', onPrev)
  nextButton.addEventListener('click', onNext)

  // #region focus-redirect
  const unsubscribe = riffle.on('change', ({ index }) => {
    updateReadout(index)
    // Only redirect focus into the new field when focus was already
    // somewhere inside the stack: that is exactly the condition the
    // engine's own focus-following uses to decide whether to move focus
    // onto the new active card's root at all. Skipping this check would
    // steal focus into a card field even when nothing on the page had
    // focus in the stack, for example while a visitor was reading
    // unrelated page text and something else called goTo().
    const wasFocusInStack =
      document.activeElement?.closest('[aria-roledescription="carousel"]') != null
    if (!wasFocusInStack) return
    noteFields[index]?.focus()
  })
  // #endregion focus-redirect
  updateReadout(riffle.getSnapshot().activeIndex)

  return function unmount(): void {
    prevButton.removeEventListener('click', onPrev)
    nextButton.removeEventListener('click', onNext)
    unsubscribe()
    riffle.destroy()
    el.innerHTML = ''
  }
}

const root = document.getElementById('forms-in-cards-recipe-root')
if (root) mount(root)
