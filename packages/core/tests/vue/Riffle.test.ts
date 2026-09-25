import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { RiffleEventMap } from '@rpxl/riffle'
import { Riffle, type RiffleInstance } from '../../src/vue/Riffle'

/** happy-dom does not implement pointer capture or layout; the engine only calls these. */
function stubRoot(el: HTMLElement): void {
  el.setPointerCapture = () => {}
  el.releasePointerCapture = () => {}
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400, x: 0, y: 0 }) as DOMRect
}

function fire(node: Element, type: string, init: Record<string, unknown> = {}): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(
    event,
    { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 0, clientY: 0 },
    init,
  )
  node.dispatchEvent(event)
}

/** happy-dom's requestAnimationFrame is timer-backed; the pose write happens on the next frame. */
function raf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** pointerdown plus three pointermoves, enough to clear slop and stay in a drag. No pointerup. */
async function drag(root: Element): Promise<void> {
  fire(root, 'pointerdown', { clientX: 100, clientY: 200 })
  fire(root, 'pointermove', { clientX: 120, clientY: 200 })
  fire(root, 'pointermove', { clientX: 140, clientY: 200 })
  fire(root, 'pointermove', { clientX: 160, clientY: 200 })
  await raf()
  await raf()
}

afterEach(() => {
  vi.restoreAllMocks()
})

interface Card {
  id: string
  title: string
}

describe('Riffle', () => {
  it('renders the legacy #card slot shape', () => {
    const cards: Card[] = [
      { id: 'a', title: 'Card A' },
      { id: 'b', title: 'Card B' },
    ]
    const wrapper = mount(Riffle, {
      attachTo: document.body,
      props: { cards, cardWidth: 300, cardHeight: 400 },
      slots: {
        card: (props: { card: unknown }) => h('span', (props.card as Card).title),
      },
    })
    stubRoot(wrapper.element as HTMLElement)

    const card0 = wrapper.get('[data-riffle-card="0"]')
    const card1 = wrapper.get('[data-riffle-card="1"]')
    expect(card0.text()).toBe('Card A')
    expect(card1.text()).toBe('Card B')
    wrapper.unmount()
  })
  // Break-it proof: in Riffle.ts's render, pass
  // `slots.card?.({ index })` (drop `card` from the scoped slot payload).
  // The slot destructures `{ card }` and reads `card.title`, so mounting
  // throws: "Cannot read properties of undefined (reading 'title')".

  it('dragging works when draggable is not passed', async () => {
    const wrapper = mount(Riffle, {
      attachTo: document.body,
      props: { cards: [1, 2, 3], cardWidth: 300, cardHeight: 400 },
      slots: { card: (props: { card: unknown }) => h('span', String(props.card)) },
    })
    stubRoot(wrapper.element as HTMLElement)
    const root = wrapper.element as HTMLElement
    const card0 = wrapper.get('[data-riffle-card="0"]').element as HTMLElement

    // Precondition: before the drag, the front card sits at its rest transform.
    const before = card0.style.transform
    expect(before).not.toBe('')

    await drag(root)

    expect(card0.style.transform).not.toBe(before)
    wrapper.unmount()
  })
  // Break-it proof: declare `draggable: { type:
  // Boolean }` in Riffle.ts's props, without `default: undefined`. Vue then
  // casts the absent prop to `false`, the engine's `enabled()` gate
  // (`!destroyed && draggable && count > 1`) never opens, `onDown` never
  // arms a gesture, and `card0.style.transform` after the pointer sequence
  // and two animation frames stays identical to `before`. This test exists
  // for exactly that trap.

  it('emits change with the event payload after next() through the exposed methods', async () => {
    const wrapper = mount(Riffle, {
      attachTo: document.body,
      props: { cards: [1, 2, 3], cardWidth: 300, cardHeight: 400 },
      slots: { card: (props: { card: unknown }) => h('span', String(props.card)) },
    })
    stubRoot(wrapper.element as HTMLElement)
    const vm = wrapper.vm as unknown as RiffleInstance

    // Precondition: nothing has been emitted yet.
    expect(wrapper.emitted('change')).toBeUndefined()
    vm.next()
    await nextTick()

    const changeEvents = wrapper.emitted('change') as Array<[RiffleEventMap['change']]> | undefined
    expect(changeEvents).toBeDefined()
    expect(changeEvents![0]![0]).toMatchObject({ index: 1, previousIndex: 0, direction: 1 })
    wrapper.unmount()
  })
  // Break-it proof: drop the `riffle.on('change',
  // (event) => emit('change', event))` subscription from Riffle.ts's setup.
  // The precondition (no `change` emitted yet) still passes, but after
  // `next()` and a tick `wrapper.emitted('change')` stays `undefined`.

  it('focuses a field in the new active card from @change, and it stays there', async () => {
    const inputs: Array<HTMLInputElement | null> = []
    const wrapper = mount(Riffle, {
      attachTo: document.body,
      props: {
        cards: ['a', 'b', 'c'],
        cardWidth: 300,
        cardHeight: 400,
        onChange: (event: RiffleEventMap['change']) => {
          // happy-dom does not enforce the platform rule that focus cannot
          // land inside an inert subtree, so this checks for it directly: a
          // real browser would refuse the .focus() call below on its own if
          // the new card were still inert at this point.
          const el = inputs[event.index]
          if (el && !el.closest('[inert]')) el.focus()
        },
      },
      slots: {
        card: (props: { card: unknown; index: number }) =>
          h('input', {
            ref: (el) => {
              inputs[props.index] = el as HTMLInputElement | null
            },
          }),
      },
    })
    stubRoot(wrapper.element as HTMLElement)
    const vm = wrapper.vm as unknown as RiffleInstance

    vm.next()
    await nextTick()

    expect(document.activeElement).toBe(inputs[1])
    wrapper.unmount()
  })

  it('individual props are reactive: bounds loop to clamp disables prev at index 0', async () => {
    const wrapper = mount(Riffle, {
      attachTo: document.body,
      props: { cards: [1, 2, 3], cardWidth: 300, cardHeight: 400, bounds: 'loop' as const },
      slots: { card: (props: { card: unknown }) => h('span', String(props.card)) },
    })
    stubRoot(wrapper.element as HTMLElement)
    const vm = wrapper.vm as unknown as RiffleInstance

    // Precondition: looping at index 0, prev() wraps to the last card.
    vm.prev()
    await nextTick()
    expect(vm.activeIndex).toBe(2)
    vm.goTo(0, { animate: false })
    await nextTick()

    await wrapper.setProps({ bounds: 'clamp' as const })
    await nextTick()

    // Clamped at index 0, prev() can no longer move.
    vm.prev()
    await nextTick()
    expect(vm.activeIndex).toBe(0)
    wrapper.unmount()
  })
  // Break-it proof: change the options getter in
  // Riffle.ts's setup from `() => ({ ...pickDefinedOptions(props), count:
  // props.cards.length })` to a value computed once at setup time, e.g.
  // `const initial = { ...pickDefinedOptions(props), count:
  // props.cards.length }; useRiffle(initial)` (drop the getter). The
  // precondition (looping wraps to index 2) still passes, since it happens
  // before `setProps`, but `wrapper.setProps({ bounds: 'clamp' })` no longer
  // reaches the engine (useRiffle's watcher only re-reads a reactive
  // source), so `bounds` stays `loop` and the final `prev()` wraps back to
  // index 2 instead of clamping at 0.

  it('card count follows cards, and a pushed card is labelled correctly', async () => {
    const cards = [{ id: 'a' }, { id: 'b' }]
    const wrapper = mount(Riffle, {
      attachTo: document.body,
      props: {
        cards,
        cardWidth: 300,
        cardHeight: 400,
        getKey: (c: unknown) => (c as { id: string }).id,
      },
      slots: { card: (props: { card: unknown }) => h('span', (props.card as { id: string }).id) },
    })
    stubRoot(wrapper.element as HTMLElement)
    const vm = wrapper.vm as unknown as RiffleInstance

    // Precondition: two cards render before the push.
    expect(wrapper.findAll('[data-riffle-card]').length).toBe(2)

    await wrapper.setProps({ cards: [...cards, { id: 'c' }] })
    await nextTick()
    vm.goTo(0, { animate: false })

    const all = wrapper.findAll('[data-riffle-card]')
    expect(all.length).toBe(3)
    const newCard = all.find((w) => w.text() === 'c')!
    expect((newCard.element as HTMLElement).getAttribute('aria-label')).toBe('3 of 3')
    wrapper.unmount()
  })
  // Break-it proof: in Riffle.ts's setup, capture
  // the count once, e.g. `const initialCount = props.cards.length;
  // useRiffle(() => ({ ...pickDefinedOptions(props), count: initialCount }))`.
  // Three `<div>`s still render (the render function itself always maps
  // over the live `props.cards`), and the new card still registers with the
  // engine, but the engine's own snapshot count stays frozen at 2, so every
  // label is computed against the stale total: the new card reads
  // "3 of 2" instead of "3 of 3".

  it('exposes next, prev, goTo, on, instance, activeIndex and state on the template ref', async () => {
    const wrapper = mount(Riffle, {
      attachTo: document.body,
      props: { cards: [1, 2, 3], cardWidth: 300, cardHeight: 400 },
      slots: { card: (props: { card: unknown }) => h('span', String(props.card)) },
    })
    stubRoot(wrapper.element as HTMLElement)
    const vm = wrapper.vm as unknown as RiffleInstance

    // Precondition: mounted, at index 0.
    expect(vm.instance).not.toBeNull()
    expect(vm.activeIndex).toBe(0)

    const onChange = vi.fn()
    const off = vm.on('change', onChange)
    vm.next()
    await nextTick()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(vm.activeIndex).toBe(1)
    expect(vm.state.activeIndex).toBe(1)
    expect(vm.state.count).toBe(3)
    off()

    wrapper.unmount()
    await Promise.resolve()
    expect(vm.instance).toBeNull()
  })

  it('types the template ref with the same member set as the React drop-in', () => {
    expectTypeOf<keyof RiffleInstance>().toEqualTypeOf<
      'next' | 'prev' | 'goTo' | 'on' | 'instance' | 'activeIndex' | 'state'
    >()
  })

  it('applies cardClassName to every card', () => {
    const wrapper = mount(Riffle, {
      attachTo: document.body,
      props: { cards: [1, 2], cardWidth: 300, cardHeight: 400, cardClassName: 'poster' },
      slots: { card: (props: { card: unknown }) => h('span', String(props.card)) },
    })
    const cards = wrapper.findAll('[data-riffle-card]')
    // Precondition: both cards rendered.
    expect(cards.length).toBe(2)
    for (const card of cards) expect(card.classes()).toEqual(['poster'])
    wrapper.unmount()
  })

  it('keeps position when cardWidth switches between a number and auto', async () => {
    const errorHandler = vi.fn()
    const wrapper = mount(Riffle, {
      attachTo: document.body,
      props: { cards: [1, 2, 3, 4], cardWidth: 300, cardHeight: 400 },
      slots: { card: (props: { card: unknown }) => h('span', String(props.card)) },
      global: { config: { errorHandler } },
    })
    stubRoot(wrapper.element as HTMLElement)
    const vm = wrapper.vm as unknown as RiffleInstance
    vm.goTo(2, { animate: false })
    await nextTick()
    // Precondition: the position moved.
    expect(vm.activeIndex).toBe(2)

    await wrapper.setProps({ cardWidth: 'auto' as const })
    await nextTick()
    expect(errorHandler).not.toHaveBeenCalled()
    expect(vm.activeIndex).toBe(2)

    await wrapper.setProps({ cardWidth: 280 })
    await nextTick()
    expect(errorHandler).not.toHaveBeenCalled()
    expect(vm.activeIndex).toBe(2)
    wrapper.unmount()
  })
})
