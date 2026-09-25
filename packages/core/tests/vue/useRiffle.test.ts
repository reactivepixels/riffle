import { mount } from '@vue/test-utils'
import {
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  toValue,
  withDirectives,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RiffleOptions } from '@rpxl/riffle'
import { useRiffle } from '../../src/vue/useRiffle'

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

/** pointerdown plus three pointermoves, enough to clear slop and stay in a drag. No pointerup. */
function drag(root: Element): void {
  fire(root, 'pointerdown', { clientX: 100, clientY: 200 })
  fire(root, 'pointermove', { clientX: 120, clientY: 200 })
  fire(root, 'pointermove', { clientX: 140, clientY: 200 })
  fire(root, 'pointermove', { clientX: 160, clientY: 200 })
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** Basic harness: a fixed count of index-keyed cards, rendered through the directives. */
function makeBasic(options: MaybeRefOrGetter<RiffleOptions>) {
  return defineComponent({
    setup() {
      const riffle = useRiffle(options)
      return { riffle }
    },
    render() {
      const count = toValue(options).count
      return withDirectives(
        h('div', null, [
          ...Array.from({ length: count }, (_, i) =>
            withDirectives(h('div', { 'data-testid': `card-${i}` }), [
              [this.riffle.vRiffleCard, i],
            ]),
          ),
        ]),
        [[this.riffle.vRiffleRoot]],
      )
    },
  })
}

describe('useRiffle', () => {
  it('mounts through the directives', () => {
    const wrapper = mount(makeBasic({ count: 3, cardWidth: 300, cardHeight: 400 }), {
      attachTo: document.body,
    })
    stubRoot(wrapper.element as HTMLElement)
    // Force the a11y module to (re)apply attributes against the real geometry.
    ;(wrapper.vm as unknown as { riffle: ReturnType<typeof useRiffle> }).riffle.goTo(0, {
      animate: false,
    })

    const root = wrapper.element as HTMLElement
    expect(root.getAttribute('role')).toBe('group')
    expect(root.style.display).toBe('grid')
    expect(root.hasAttribute('data-riffle-root')).toBe(true)

    const card0 = wrapper.get('[data-testid="card-0"]').element as HTMLElement
    expect(card0.style.transform).not.toBe('')
    expect(card0.getAttribute('aria-label')).toBe('1 of 3')
    wrapper.unmount()
  })
  // Break-it proof: drop `handle.rootRef(el)` from
  // createRootDirective's `mounted` hook. The engine never attaches, so the
  // container never gets `role="group"` and the card never gets a transform
  // or aria-label; the assertions fail.

  it('activeIndex is reactive', async () => {
    const Comp = defineComponent({
      setup() {
        const riffle = useRiffle({ count: 3, cardWidth: 300, cardHeight: 400 })
        return { riffle }
      },
      render() {
        return withDirectives(
          h('div', null, [
            h('span', { 'data-testid': 'active' }, String(this.riffle.activeIndex.value)),
            ...[0, 1, 2].map((i) => withDirectives(h('div'), [[this.riffle.vRiffleCard, i]])),
          ]),
          [[this.riffle.vRiffleRoot]],
        )
      },
    })
    const wrapper = mount(Comp, { attachTo: document.body })
    stubRoot(wrapper.element as HTMLElement)

    expect(wrapper.get('[data-testid="active"]').text()).toBe('0')
    ;(wrapper.vm as unknown as { riffle: ReturnType<typeof useRiffle> }).riffle.next()
    await nextTick()
    expect(wrapper.get('[data-testid="active"]').text()).toBe('1')
    wrapper.unmount()
  })
  // Break-it proof: replace `computed(() =>
  // state.value.activeIndex)` with a plain, non-reactive `state.value.activeIndex`
  // read once at setup time. The precondition ("0") still passes, but after
  // next() and a tick the text stays "0" instead of becoming "1".

  describe('keyed reorder with removal', () => {
    interface Card {
      id: string
    }

    function makeKeyed(cards: Ref<Card[]>) {
      return defineComponent({
        setup() {
          const riffle = useRiffle(() => ({
            count: cards.value.length,
            cardWidth: 300,
            cardHeight: 400,
          }))
          return { riffle }
        },
        render() {
          return withDirectives(
            h(
              'div',
              null,
              cards.value.map((card, index) =>
                withDirectives(h('div', { key: card.id, 'data-id': card.id }), [
                  [this.riffle.vRiffleCard, index],
                ]),
              ),
            ),
            [[this.riffle.vRiffleRoot]],
          )
        },
      })
    }

    function labelOf(wrapper: ReturnType<typeof mount>, id: string): string | null {
      return (wrapper.get(`[data-id="${id}"]`).element as HTMLElement).getAttribute('aria-label')
    }

    it('lands correct labels through real Vue patching, [A, B, C] -> [C, A] (correctness check, not the guard proof; see the pure-swap test below)', async () => {
      const cards = ref<Card[]>([{ id: 'A' }, { id: 'B' }, { id: 'C' }])
      const wrapper = mount(makeKeyed(cards), { attachTo: document.body })
      stubRoot(wrapper.element as HTMLElement)
      await nextTick()

      // Precondition: before the reorder, A sits at position 1 of 3.
      expect(labelOf(wrapper, 'A')).toBe('1 of 3')

      cards.value = [{ id: 'C' }, { id: 'A' }]
      await nextTick()

      expect(labelOf(wrapper, 'C')).toBe('1 of 2')
      expect(labelOf(wrapper, 'A')).toBe('2 of 2')
      wrapper.unmount()
    })
    // This is a correctness regression check for
    // reorder-with-removal under Vue's real hook order, not a proof of the
    // element-aware guard, and the comment previously here claimed
    // otherwise. Verified directly: with packages/core's createAdapterHandle
    // changed so unregisterCard ignores its `el` argument and deletes by
    // index unconditionally, this test still passes. In Vue's real order,
    // B's beforeUnmount (index 1) runs synchronously during patch while
    // index 1 still holds B, so the naive by-index delete is correct on
    // this specific replay regardless of the guard; A has not moved into
    // slot 1 yet when B is removed. The pure-swap test immediately below is
    // the guard's actual proof: it fails outright under the identical break
    // (see its own break-it comment).

    it('a pure swap [A, B] -> [B, A] lands correct labels through real Vue patching', async () => {
      const cards = ref<Card[]>([{ id: 'A' }, { id: 'B' }])
      const wrapper = mount(makeKeyed(cards), { attachTo: document.body })
      stubRoot(wrapper.element as HTMLElement)
      await nextTick()

      // Precondition: before the swap, A is at 0 and B is at 1.
      expect(labelOf(wrapper, 'A')).toBe('1 of 2')
      expect(labelOf(wrapper, 'B')).toBe('2 of 2')

      cards.value = [{ id: 'B' }, { id: 'A' }]
      await nextTick()

      expect(labelOf(wrapper, 'B')).toBe('1 of 2')
      expect(labelOf(wrapper, 'A')).toBe('2 of 2')

      // The label/transform check above passes even under a naive,
      // index-only unregisterCard: A's last real write already left it at
      // its correct final label, and once A drops out of the engine's
      // tracked nodes nothing touches it again to reveal that. Force the
      // engine to recompute: move the active card. If A were silently
      // dropped, this write would skip it and its pose would stay frozen at
      // its pre-move value; B's would not.
      //
      // Asserted on opacity, not transform: with count 2 and this exact
      // goTo, each card crosses between depth -1 (the invisible exit slot)
      // and depth 0 (the front card). Core's applyPose
      // (packages/core/src/render/transform.ts; see
      // packages/core/tests/adapter.test.ts's own copy of this same swap
      // for the full explanation) writes an invisible card's transform as
      // the neutral translate(0,0)/rotate(0)/scale(1), identical to the
      // front card's own real pose at depth 0, so the transform string
      // alone does not reliably differ across this one transition. Opacity
      // (0 at depth -1, 1 at depth 0) still does.
      const aEl = wrapper.get('[data-id="A"]').element as HTMLElement
      const bEl = wrapper.get('[data-id="B"]').element as HTMLElement
      const aOpacityBeforeMove = aEl.style.opacity
      const bOpacityBeforeMove = bEl.style.opacity
      ;(wrapper.vm as unknown as { riffle: ReturnType<typeof useRiffle> }).riffle.goTo(1, {
        animate: false,
      })
      expect(aEl.style.opacity).not.toBe(aOpacityBeforeMove)
      expect(bEl.style.opacity).not.toBe(bOpacityBeforeMove)
      wrapper.unmount()
    })
    // Break-it proof: make `unregisterCard` in
    // createAdapterHandle ignore its `el` argument and delete by index
    // unconditionally. Vue runs both cards' `updated` hooks after the patch
    // (no removal to force a synchronous beforeUnmount), one at a time: A's
    // hook does unregisterCard(0, A) then registerCard(1, A), then B's hook
    // does unregisterCard(1, B) then registerCard(0, B). With the guard
    // removed, B's unregisterCard(1, B) deletes index 1 unconditionally in
    // the core engine's own node map too (registerNode(1, null)), which had
    // just been overwritten with A one call earlier; A is silently dropped
    // from the engine entirely. The label assertions right after the swap
    // still pass, because A's last real write already happened to be
    // correct; only the forced goTo recompute exposes it, since A no longer
    // receives pose updates and its transform freezes.
  })

  it('a getter option is reactive', async () => {
    const n = ref(3)
    const Comp = defineComponent({
      setup() {
        const riffle = useRiffle(() => ({ count: n.value, cardWidth: 300, cardHeight: 400 }))
        return { riffle }
      },
      render() {
        return withDirectives(h('div'), [[this.riffle.vRiffleRoot]])
      },
    })
    const wrapper = mount(Comp, { attachTo: document.body })
    stubRoot(wrapper.element as HTMLElement)
    const vm = wrapper.vm as unknown as { riffle: ReturnType<typeof useRiffle> }

    expect(vm.riffle.state.value.count).toBe(3)
    n.value = 5
    await nextTick()
    expect(vm.riffle.state.value.count).toBe(5)
    wrapper.unmount()
  })
  // Break-it proof: change the watch source from
  // `() => ({ ...toValue(options) })` to `() => toValue(options)` (drop the
  // spread). A getter function's return value is itself a plain object
  // created fresh every call, so removing the spread does not, by itself,
  // break getters; this is genuinely the break-it for "a reactive() options
  // object is tracked" below, not for this test. This test's own break-it
  // is: stop calling `toValue` inside the getter passed to
  // useRiffle's `watch`, i.e. read `options` directly. Since `options` here
  // is a plain function (a getter), `toValue(options)` is required to
  // invoke it; without it, `watch`'s source never changes and `state.value.count`
  // stays 3 after `n.value = 5`.

  it('a reactive() options object is tracked', async () => {
    const opts = reactive({ count: 3, cardWidth: 300, cardHeight: 400 })
    const Comp = defineComponent({
      setup() {
        const riffle = useRiffle(opts)
        return { riffle }
      },
      render() {
        return withDirectives(h('div'), [[this.riffle.vRiffleRoot]])
      },
    })
    const wrapper = mount(Comp, { attachTo: document.body })
    stubRoot(wrapper.element as HTMLElement)
    const vm = wrapper.vm as unknown as { riffle: ReturnType<typeof useRiffle> }

    expect(vm.riffle.state.value.count).toBe(3)
    opts.count = 5
    await nextTick()
    expect(vm.riffle.state.value.count).toBe(5)
    wrapper.unmount()
  })
  // Break-it proof: change the watch source in
  // useRiffle.ts from `() => ({ ...toValue(options) })` to `() =>
  // toValue(options)` (drop the spread). `toValue` on a reactive object
  // returns the same object reference: Vue's `watch` compares that reference
  // for change detection and never dereferences into it, so mutating
  // `opts.count` does not trigger the watcher, `setOptions` is never called,
  // and `state.value.count` stays 3.

  it('unmount destroys the instance', async () => {
    // The core handle defers rootRef(null)'s
    // teardown by one microtask, so `instance` is not null the instant
    // `unmount()` returns; await one microtask first.
    const wrapper = mount(makeBasic({ count: 3, cardWidth: 300, cardHeight: 400 }), {
      attachTo: document.body,
    })
    stubRoot(wrapper.element as HTMLElement)
    const vm = wrapper.vm as unknown as { riffle: ReturnType<typeof useRiffle> }
    expect(vm.riffle.instance).not.toBeNull()
    wrapper.unmount()
    await Promise.resolve()
    expect(vm.riffle.instance).toBeNull()
  })
  // Break-it proof: removing only one of the two
  // teardown paths does not discriminate here, since either one alone still
  // nulls the instance: `createRootDirective`'s own `beforeUnmount` hook
  // fires because the root element carrying `v-riffle-root` is itself
  // removed on unmount, and useRiffle's `onBeforeUnmount(() =>
  // handle.rootRef(null))` is a redundant second path for consumers who use
  // the composable without binding the directive to the element that
  // actually unmounts. Removing `handle.rootRef(null)` from *both* places at
  // once is what discriminates: the precondition (instance not null while
  // mounted) still passes, but after `wrapper.unmount()` the instance stays
  // the live engine instead of becoming null.

  it('zero re-renders during a drag', async () => {
    let updates = 0
    const Comp = defineComponent({
      setup() {
        const riffle = useRiffle({ count: 3, cardWidth: 300, cardHeight: 400 })
        return { riffle }
      },
      updated() {
        updates++
      },
      render() {
        return withDirectives(h('div', null, String(this.riffle.activeIndex.value)), [
          [this.riffle.vRiffleRoot],
        ])
      },
    })
    const wrapper = mount(Comp, { attachTo: document.body })
    stubRoot(wrapper.element as HTMLElement)

    const before = updates
    drag(wrapper.element as HTMLElement)
    await nextTick()
    expect(updates).toBe(before)
    wrapper.unmount()
  })
  // Break-it proof: change the render function to
  // read `this.riffle.state.value.isDragging` (e.g. interpolate it into the
  // rendered text) instead of only `activeIndex`. `state` is a shallowRef
  // that changes identity on every drag frame (isDragging flips true), so the
  // component re-renders and `updates` grows past `before`.
})
