import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FormCardsStack from './FormCardsStack.vue'

/** happy-dom does not implement pointer capture or layout; the engine only calls these. */
function stubRoot(el: HTMLElement): void {
  el.setPointerCapture = () => {}
  el.releasePointerCapture = () => {}
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 240, height: 320, right: 240, bottom: 320, x: 0, y: 0 }) as DOMRect
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FormCardsStack', () => {
  // The realistic path into this handler is keyboard navigation, not a
  // Next-button click with an input focused: a real browser moves focus
  // onto the button itself on click (before its own onClick fires), and
  // that button sits outside the carousel entirely, so `wasFocusInStack`
  // would already be false by the time the handler runs. What actually
  // lands a note field's own input in focus is a keyboard user who has
  // tabbed onto a card's own root (the roving `tabindex="0"` the engine
  // gives the active card) and pressed the arrow key: the engine's own
  // focus-following moves focus onto the new active card's root first
  // (still inside the carousel), and this component's `@change` handler
  // then moves it one step further, into that card's own field.
  it("moves focus into the new active card's note field after ArrowRight, when the active card's own root had focus", async () => {
    const wrapper = mount(FormCardsStack, { attachTo: document.body })
    const root = wrapper.get('[data-riffle-root]').element as HTMLElement
    stubRoot(root)

    const firstCard = wrapper.get('[data-riffle-card="0"]').element as HTMLElement
    const secondInput = wrapper.get('[data-riffle-card="1"] input').element as HTMLInputElement
    firstCard.focus()

    // Precondition: focus starts on the first card's own root (what a
    // keyboard user actually lands on), not already inside its note field,
    // so the assertion below proves ArrowRight's own focus-follow plus this
    // component's redirect moved it all the way into the second card's
    // field, not that it simply stayed wherever it already was.
    expect(document.activeElement).toBe(firstCard)

    await wrapper.get('[data-riffle-card="0"]').trigger('keydown', { key: 'ArrowRight' })
    await nextTick()

    expect(document.activeElement).toBe(secondInput)
    wrapper.unmount()
  })
  // Break-it proof: comment out the
  // `noteFieldRefs[event.index]?.focus()` call at the end of
  // FormCardsStack.vue's onChange handler. The precondition (focus starts
  // on the first card's root) still passes, but after ArrowRight the
  // engine's own focus-following still lands focus on the new active card's
  // root element only, not inside its note field, so
  // `document.activeElement` is that root div, not `secondInput`, and the
  // final assertion fails.

  it('does not steal focus into the new card when focus was outside the stack entirely', async () => {
    const wrapper = mount(FormCardsStack, { attachTo: document.body })
    const root = wrapper.get('[data-riffle-root]').element as HTMLElement
    stubRoot(root)

    // An unrelated focusable element elsewhere on the page: the handler
    // must not reach into the stack when this is what has focus, matching
    // the same guard the engine's own focus-following honours.
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    // Precondition: focus is genuinely outside the stack before Next.
    expect(document.activeElement).toBe(outside)

    await wrapper.get('[data-testid="next-button"]').trigger('click')
    await nextTick()

    expect(document.activeElement).toBe(outside)
    outside.remove()
    wrapper.unmount()
  })
  // Break-it proof: drop the `wasFocusInStack`
  // check from FormCardsStack.vue's onChange handler (call
  // `noteFieldRefs[event.index]?.focus()` unconditionally). The precondition
  // (focus starts on the outside button) still passes, but after Next the
  // handler steals focus into the second card's note field regardless, so
  // `document.activeElement` becomes that input instead of staying on
  // `outside`.
})
