import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createA11y } from '../src/a11y'

let container: HTMLElement
let cards: HTMLElement[]

beforeEach(() => {
  container = document.createElement('div')
  cards = [0, 1, 2].map(() => {
    const el = document.createElement('div')
    container.appendChild(el)
    return el
  })
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

describe('a11y', () => {
  it('marks the container as a carousel', () => {
    createA11y(container, { axis: 'x' })
    expect(container.getAttribute('role')).toBe('group')
    expect(container.getAttribute('aria-roledescription')).toBe('carousel')
  })

  it('labels each card with its position in the stack', () => {
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    expect(cards[1]?.getAttribute('aria-label')).toBe('2 of 3')
    expect(cards[1]?.getAttribute('aria-roledescription')).toBe('slide')
  })

  it('makes only the active card focusable', () => {
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(1, 3)
    expect(cards[1]?.getAttribute('tabindex')).toBe('0')
    expect(cards[0]?.getAttribute('tabindex')).toBe('-1')
  })

  it('makes background cards inert so their controls are unreachable', () => {
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(1, 3)
    expect(cards[1]?.hasAttribute('inert')).toBe(false)
    expect(cards[2]?.hasAttribute('inert')).toBe(true)
  })

  it('creates one polite live region', () => {
    createA11y(container, { axis: 'x' })
    const region = container.querySelector('[aria-live]')
    expect(region?.getAttribute('aria-live')).toBe('polite')
  })

  // Mutants (StringLiteral on the OFFSCREEN constant, and on the 'style'
  // attribute name passed to setAttribute): either one, left unkilled, lets
  // the live region render on screen instead of staying visually hidden.
  it('renders the live region visually offscreen', () => {
    createA11y(container, { axis: 'x' })
    const style = container.querySelector('[aria-live]')?.getAttribute('style')
    expect(style).toContain('position:absolute')
    expect(style).toContain('clip:rect(0,0,0,0)')
  })

  // Mutant (StringLiteral x2 on 'aria-atomic' / 'true'): nothing else in this
  // file reads aria-atomic.
  it('marks the live region as atomic', () => {
    createA11y(container, { axis: 'x' })
    const region = container.querySelector('[aria-live]')
    expect(region?.getAttribute('aria-atomic')).toBe('true')
  })

  // Mutant (StringLiteral x2 on 'role' / 'group' passed to each card's own
  // setAttribute): the existing label test checks aria-label and
  // aria-roledescription on a card, never role itself.
  it('marks each card as a group', () => {
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    expect(cards[0]?.getAttribute('role')).toBe('group')
  })

  // Mutant (StringLiteral, `el.removeAttribute('inert')` targeted with '' on
  // becoming active): a fresh card never had inert set, so removing it is a
  // no-op either way. Only a card that WAS inert and regains active status
  // observes the removal.
  it('removes inert from a card that regains active status', () => {
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    a11y.update(1, 3)
    expect(cards[0]?.hasAttribute('inert')).toBe(true) // precondition
    a11y.update(0, 3)
    expect(cards[0]?.hasAttribute('inert')).toBe(false)
  })

  // Mutant (UnaryOperator, focusedIndex's sentinel `-1` flipped to `+1`):
  // the existing "leaves focus alone" test moves to activeIndex 1, which
  // coincides with the mutant's bogus sentinel value and masks it.
  it('leaves focus alone when outside the stack, at any active index (not only 1)', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    outside.focus()
    a11y.update(2, 3)
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  // Mutant (LogicalOperator, the focus-search's `el === focused ||
  // el.contains(focused)` tightened to `&&`): the existing nested-control
  // test only ever checks a card that STAYS active, where the AND mutant's
  // narrower match happens to reach the same "leave focus alone" outcome by
  // a different path. Only a card BECOMING inactive, with focus on a nested
  // control rather than the card element itself, tells them apart.
  it('moves focus to the new active card when focus was on a nested control of a card becoming inactive', () => {
    const a11y = createA11y(container, { axis: 'x' })
    const button = document.createElement('button')
    cards[0]?.appendChild(button)
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    button.focus()
    expect(document.activeElement).toBe(button) // precondition
    a11y.update(1, 3)
    expect(document.activeElement).toBe(cards[1])
  })

  // Mutants (ObjectLiteral and BooleanLiteral on `{ preventScroll: true }`):
  // every activeElement-based assertion only observes THAT focus moved, not
  // the options it moved with.
  it('passes preventScroll when moving focus to the new active card', () => {
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    cards[0]?.focus()
    const focusSpy = vi.spyOn(cards[1] as HTMLElement, 'focus')
    a11y.update(1, 3)
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
  })

  // Mutant (CallExpression, destroy()'s `nodes.clear()` removed): without
  // it, the stale registration map lets a stray update() call after destroy
  // repopulate attributes on cards destroy() just cleaned up.
  it('clears its node registrations on destroy, so a later update() cannot repopulate them', () => {
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    a11y.destroy()
    a11y.update(1, 3)
    expect(cards[1]?.hasAttribute('role')).toBe(false)
  })

  // Mutant (CallExpression, destroy()'s `priors.clear()` removed): without
  // it, a card re-registered after destroy remembers its ORIGINAL prior
  // value from before the first destroy, instead of a fresh one, so a
  // second destroy() restores the wrong value.
  it('captures a fresh prior value after destroy, not a stale one from before it', () => {
    cards[0]?.setAttribute('role', 'original-author-role')
    const a11y = createA11y(container, { axis: 'x' })
    a11y.registerNode(0, cards[0]!)
    a11y.update(0, 3)
    a11y.destroy()
    expect(cards[0]?.getAttribute('role')).toBe('original-author-role') // precondition

    cards[0]?.setAttribute('role', 'reassigned-role')
    a11y.registerNode(0, cards[0]!)
    a11y.update(0, 3)
    a11y.destroy()
    expect(cards[0]?.getAttribute('role')).toBe('reassigned-role')
  })

  it('announces through the live region', () => {
    const a11y = createA11y(container, { axis: 'x' })
    a11y.announce('Blade Runner 2049, 3 of 12')
    expect(container.querySelector('[aria-live]')?.textContent).toBe('Blade Runner 2049, 3 of 12')
  })

  it('removes everything it added on destroy, including from cards', () => {
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(1, 3)
    expect(cards[2]?.hasAttribute('inert')).toBe(true)

    a11y.destroy()

    expect(container.querySelector('[aria-live]')).toBeNull()
    expect(container.hasAttribute('role')).toBe(false)
    expect(container.hasAttribute('aria-roledescription')).toBe(false)
    for (const el of cards) {
      expect(el.hasAttribute('inert')).toBe(false)
      expect(el.hasAttribute('aria-label')).toBe(false)
      expect(el.hasAttribute('tabindex')).toBe(false)
      expect(el.hasAttribute('aria-roledescription')).toBe(false)
      expect(el.getAttribute('role')).toBeNull()
    }
  })
  // Mutant (ConditionalExpression, remember()'s `!priors.has(el)` guard
  // forced to `true`): "restores attributes the author set before it, on
  // destroy" below calls update() only once before
  // destroy. Calling it a second time is what exposes an unguarded remember()
  // re-capturing the engine's OWN already-written value as if it were the
  // author's original.
  it('remembers an authored attribute only once, even across repeated updates, before destroy', () => {
    cards[1]?.setAttribute('role', 'listitem')
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    a11y.update(1, 3)
    a11y.destroy()
    expect(cards[1]?.getAttribute('role')).toBe('listitem')
  })

  it('restores attributes the author set before it, on destroy', () => {
    container.setAttribute('role', 'region')
    container.setAttribute('aria-label', 'Films')
    cards[1]?.setAttribute('aria-label', 'Poster')
    cards[1]?.setAttribute('tabindex', '3')
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    // Precondition: the engine really did overwrite them.
    expect(container.getAttribute('role')).toBe('group')
    expect(cards[1]?.getAttribute('aria-label')).toBe('2 of 3')
    expect(cards[1]?.getAttribute('tabindex')).toBe('-1')

    a11y.destroy()

    expect(container.getAttribute('role')).toBe('region')
    expect(container.getAttribute('aria-label')).toBe('Films')
    expect(container.hasAttribute('aria-roledescription')).toBe(false)
    expect(cards[1]?.getAttribute('aria-label')).toBe('Poster')
    expect(cards[1]?.getAttribute('tabindex')).toBe('3')
    expect(cards[1]?.hasAttribute('inert')).toBe(false)
    expect(cards[0]?.hasAttribute('tabindex')).toBe(false)
  })

  // --- getLabel: a caller-supplied label per card index ---

  it('appends the position to a caller-supplied label when getLabel is configured', () => {
    const getLabel = (i: number) => `Poster ${i}`
    const a11y = createA11y(container, { axis: 'x', getLabel })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    expect(cards[1]?.getAttribute('aria-label')).toBe('Poster 1, 2 of 3')
  })

  it('falls back to the bare position when getLabel is not configured', () => {
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    expect(cards[1]?.getAttribute('aria-label')).toBe('2 of 3')
  })

  it('restores the aria-label an author set, on destroy, even when getLabel is configured', () => {
    // Break-it proof: this fails the same way "restores attributes the
    // author set before it, on destroy" above does if
    // the restore path (ATTRS/priors) were bypassed, which would happen if
    // getLabel support wrote aria-label through some path other than the
    // one remember()/destroy() already track.
    cards[1]?.setAttribute('aria-label', 'Author label')
    const a11y = createA11y(container, { axis: 'x', getLabel: (i) => `Poster ${i}` })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    expect(cards[1]?.getAttribute('aria-label')).toBe('Poster 1, 2 of 3') // precondition
    a11y.destroy()
    expect(cards[1]?.getAttribute('aria-label')).toBe('Author label')
  })

  // --- Focus follows the active card ---

  it('moves focus to the new active card when focus was inside a card becoming inactive', () => {
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    cards[0]?.focus()
    expect(document.activeElement).toBe(cards[0])
    a11y.update(1, 3)
    expect(document.activeElement).toBe(cards[1])
  })

  it('does not steal focus from a control inside the card that stays active', () => {
    const a11y = createA11y(container, { axis: 'x' })
    const button = document.createElement('button')
    cards[0]?.appendChild(button)
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    button.focus()
    expect(document.activeElement).toBe(button)
    a11y.update(0, 3)
    expect(document.activeElement).toBe(button)
  })

  it('leaves focus alone when it was outside the stack', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const a11y = createA11y(container, { axis: 'x' })
    cards.forEach((el, i) => a11y.registerNode(i, el))
    a11y.update(0, 3)
    outside.focus()
    a11y.update(1, 3)
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })
})
