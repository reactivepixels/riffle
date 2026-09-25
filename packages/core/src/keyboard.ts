import type { Axis } from './types'

export interface KeyboardHandlers {
  next(): void
  prev(): void
  first(): void
  last(): void
}

/**
 * True when `target` is a form control or contenteditable region: an
 * `<input>`, `<textarea>`, `<select>`, or anything with `isContentEditable`.
 *
 * Without this guard, arrow keys,
 * Home and End typed into a form nested inside a card would navigate the
 * stack instead of moving the caret.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  switch (target.tagName) {
    case 'INPUT':
    case 'TEXTAREA':
    case 'SELECT':
      return true
    default:
      return target.isContentEditable
  }
}

/**
 * Arrow keys mapped to the configured axis, plus Home and End.
 *
 * Listens on the container, so it receives keydown bubbling up from whichever
 * card holds focus. Modified keys are ignored so browser and OS shortcuts keep
 * working, an event another handler already prevented is left alone, and a
 * keydown from an editable target (an input, textarea, select or
 * contenteditable element) is left alone so the caret moves instead of the
 * stack.
 */
export function attachKeyboard(
  el: HTMLElement,
  axis: Axis,
  enabled: () => boolean,
  handlers: KeyboardHandlers,
): () => void {
  const nextKey = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
  const prevKey = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'

  function onKeyDown(e: KeyboardEvent): void {
    if (!enabled() || e.defaultPrevented) return
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (isEditableTarget(e.target)) return
    switch (e.key) {
      case nextKey:
        handlers.next()
        break
      case prevKey:
        handlers.prev()
        break
      case 'Home':
        handlers.first()
        break
      case 'End':
        handlers.last()
        break
      default:
        return
    }
    e.preventDefault()
  }

  el.addEventListener('keydown', onKeyDown)
  return () => el.removeEventListener('keydown', onKeyDown)
}
