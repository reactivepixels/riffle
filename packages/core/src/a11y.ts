import type { Axis } from './types'

export interface A11yConfig {
  axis: Axis
  /** A caller-supplied label per card index. */
  getLabel?: ((index: number) => string) | undefined
}

export interface A11y {
  registerNode(index: number, el: HTMLElement | null): void
  update(activeIndex: number, count: number): void
  announce(label: string): void
  destroy(): void
}

const OFFSCREEN =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'

// Every attribute this module writes, on the container or a card.
const ATTRS = ['role', 'aria-roledescription', 'aria-label', 'tabindex', 'inert']

/**
 * A card's label: `${getLabel(i)}, ${i + 1} of ${count}` when a getLabel is
 * configured, otherwise the bare `${i + 1} of ${count}`. Shared by the
 * card's aria-label and its live-region announcement so the two can never
 * drift apart.
 */
export function formatCardLabel(
  index: number,
  count: number,
  getLabel?: ((index: number) => string) | undefined,
): string {
  const position = `${index + 1} of ${count}`
  return getLabel ? `${getLabel(index)}, ${position}` : position
}

export function createA11y(container: HTMLElement, config: A11yConfig): A11y {
  const nodes = new Map<number, HTMLElement>()
  // Each element's own values for ATTRS (null when absent), recorded
  // before the first write to it, so destroy puts back exactly what the
  // author had, e.g. a container authored as role="region".
  const priors = new Map<HTMLElement, Array<string | null>>()
  function remember(el: HTMLElement): void {
    if (!priors.has(el))
      priors.set(
        el,
        ATTRS.map((attr) => el.getAttribute(attr)),
      )
  }

  remember(container)
  container.setAttribute('role', 'group')
  container.setAttribute('aria-roledescription', 'carousel')

  const live = document.createElement('div')
  live.setAttribute('aria-live', 'polite')
  live.setAttribute('aria-atomic', 'true')
  live.setAttribute('style', OFFSCREEN)
  container.appendChild(live)

  return {
    registerNode(index, el) {
      if (el === null) nodes.delete(index)
      else nodes.set(index, el)
    },

    update(activeIndex, count) {
      // Focus follows the active card, but only when focus was inside a
      // card that is becoming inactive: a control on the still-active card
      // keeps focus, and focus outside the stack is left alone entirely.
      // Found before the attribute writes below run (which set the outgoing
      // card inert, at which point the browser would already have dropped
      // focus to <body>).
      const focused = typeof document === 'undefined' ? null : document.activeElement
      let focusedIndex = -1
      if (focused) {
        for (const [index, el] of nodes) {
          // Node.contains() is self-inclusive (a node contains itself), so
          // this already covers el === focused; no separate check needed.
          if (el.contains(focused)) {
            focusedIndex = index
            break
          }
        }
      }

      for (const [index, el] of nodes) {
        const active = index === activeIndex
        remember(el)
        el.setAttribute('role', 'group')
        el.setAttribute('aria-roledescription', 'slide')
        el.setAttribute('aria-label', formatCardLabel(index, count, config.getLabel))
        el.setAttribute('tabindex', active ? '0' : '-1')
        if (active) el.removeAttribute('inert')
        else el.setAttribute('inert', '')
      }

      if (focusedIndex !== -1 && focusedIndex !== activeIndex) {
        nodes.get(activeIndex)?.focus({ preventScroll: true })
      }
    },

    announce(label) {
      live.textContent = label
    },

    destroy() {
      live.remove()
      priors.forEach((values, el) => {
        ATTRS.forEach((attr, i) => {
          const value = values[i]
          if (value == null) el.removeAttribute(attr)
          else el.setAttribute(attr, value)
        })
      })
      priors.clear()
      nodes.clear()
    },
  }
}
