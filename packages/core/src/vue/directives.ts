import type { AdapterHandle } from '@rpxl/riffle'
import { normalizeStyle, type Directive, type VNode } from 'vue'

/**
 * Whether the vnode's own style binding already sets this property. A
 * compiled template's server render passes no vnode (only render functions
 * do), so there the answer is always no.
 */
function setsStyle(vnode: VNode | null, property: string, cssName: string): boolean {
  const style = normalizeStyle(vnode?.props?.style)
  if (typeof style === 'string') return new RegExp(`(^|;)\\s*${cssName}\\s*:`).test(style)
  return !!style && property in style
}

/**
 * Attach the engine to the container. Sets `display: grid` unless you set an
 * inline display, and marks the element with `data-riffle-root`. Server
 * rendering does the same, so the root is already a grid before hydration.
 * In a render function the server keeps an inline display of your own; a
 * compiled template's server render does not show the directive your
 * binding, so there it always emits `display: grid`.
 * If you also bind a `style` to the root, include `display: grid` in it:
 * Vue's development hydration check compares the element's style only with
 * your binding, so a grid added by the directive alone is reported as a
 * mismatch. The `Riffle` component does this for you.
 *
 * @example
 * ```ts
 * import { createRootDirective } from '@rpxl/riffle/vue'
 *
 * const vRiffleRoot = createRootDirective(handle)
 * // in a render function: withDirectives(h('div'), [[vRiffleRoot]])
 * ```
 */
export function createRootDirective(handle: AdapterHandle): Directive<HTMLElement> {
  return {
    getSSRProps: (_binding, vnode) => ({
      ...(setsStyle(vnode, 'display', 'display') ? {} : { style: { display: 'grid' } }),
      'data-riffle-root': '',
    }),
    mounted(el) {
      if (!el.style.display) el.style.display = 'grid'
      el.dataset.riffleRoot = ''
      handle.rootRef(el)
    },
    beforeUnmount() {
      handle.rootRef(null)
    },
  }
}

/**
 * Register a card at the bound index. Every hook receives the element, which
 * makes registration element-aware: Vue unmounts a removed card synchronously
 * during patch but runs `updated` hooks after it, and a per-index ref callback
 * would unregister whichever card had just moved into the slot. Server
 * rendering emits the grid cell and `data-riffle-card` too, unless your own
 * style binding sets `grid-area`. As with the root, if you bind a `style` to a
 * card, include `grid-area: 1 / 1` in it to keep Vue's development hydration
 * check quiet.
 *
 * @example
 * ```ts
 * import { createCardDirective } from '@rpxl/riffle/vue'
 *
 * const vRiffleCard = createCardDirective(handle)
 * // in a render function: withDirectives(h('div'), [[vRiffleCard, index]])
 * ```
 */
export function createCardDirective(handle: AdapterHandle): Directive<HTMLElement, number> {
  return {
    getSSRProps: ({ value }, vnode) => ({
      ...(setsStyle(vnode, 'gridArea', 'grid-area') ? {} : { style: { gridArea: '1 / 1' } }),
      'data-riffle-card': String(value),
    }),
    mounted(el, { value }) {
      if (!el.style.gridArea) el.style.gridArea = '1 / 1'
      el.dataset.riffleCard = String(value)
      handle.registerCard(value, el)
    },
    updated(el, { value, oldValue }) {
      if (value === oldValue) return
      if (oldValue !== null) handle.unregisterCard(oldValue, el)
      el.dataset.riffleCard = String(value)
      handle.registerCard(value, el)
    },
    beforeUnmount(el, { value }) {
      handle.unregisterCard(value, el)
    },
  }
}
