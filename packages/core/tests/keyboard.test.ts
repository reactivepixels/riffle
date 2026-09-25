import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attachKeyboard } from '../src/keyboard'

let el: HTMLElement
const handlers = () => ({ next: vi.fn(), prev: vi.fn(), first: vi.fn(), last: vi.fn() })

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(event)
  return event
}

function pressFrom(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

beforeEach(() => {
  el = document.createElement('div')
  document.body.appendChild(el)
})

describe('attachKeyboard', () => {
  it('maps ArrowRight to next and ArrowLeft to prev on the x axis', () => {
    const h = handlers()
    attachKeyboard(el, 'x', () => true, h)
    expect(h.next).not.toHaveBeenCalled()
    press('ArrowRight')
    press('ArrowLeft')
    expect(h.next).toHaveBeenCalledTimes(1)
    expect(h.prev).toHaveBeenCalledTimes(1)
  })

  it('maps ArrowDown and ArrowUp on the y axis, and ignores horizontal arrows there', () => {
    const h = handlers()
    attachKeyboard(el, 'y', () => true, h)
    press('ArrowRight')
    press('ArrowLeft')
    expect(h.next).not.toHaveBeenCalled()
    expect(h.prev).not.toHaveBeenCalled()
    press('ArrowDown')
    press('ArrowUp')
    expect(h.next).toHaveBeenCalledTimes(1)
    expect(h.prev).toHaveBeenCalledTimes(1)
  })

  it('maps Home to first and End to last', () => {
    const h = handlers()
    attachKeyboard(el, 'x', () => true, h)
    press('Home')
    press('End')
    expect(h.first).toHaveBeenCalledTimes(1)
    expect(h.last).toHaveBeenCalledTimes(1)
  })

  it('prevents default on handled keys so the page does not also scroll', () => {
    attachKeyboard(el, 'x', () => true, handlers())
    expect(press('ArrowRight').defaultPrevented).toBe(true)
  })

  it('leaves unhandled keys alone', () => {
    attachKeyboard(el, 'x', () => true, handlers())
    expect(press('a').defaultPrevented).toBe(false)
  })

  it('ignores modified keys so browser and OS shortcuts keep working', () => {
    const h = handlers()
    attachKeyboard(el, 'x', () => true, h)
    for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const) {
      expect(press('ArrowRight', { [mod]: true }).defaultPrevented).toBe(false)
    }
    expect(h.next).not.toHaveBeenCalled()
  })

  it('does nothing when disabled', () => {
    const h = handlers()
    attachKeyboard(el, 'x', () => false, h)
    press('ArrowRight')
    expect(h.next).not.toHaveBeenCalled()
  })

  it('respects an event another handler already prevented', () => {
    const h = handlers()
    el.addEventListener('keydown', (e) => e.preventDefault(), { capture: true })
    attachKeyboard(el, 'x', () => true, h)
    press('ArrowRight')
    expect(h.next).not.toHaveBeenCalled()
  })

  it('stops listening after detach', () => {
    const h = handlers()
    const detach = attachKeyboard(el, 'x', () => true, h)
    press('ArrowRight')
    expect(h.next).toHaveBeenCalledTimes(1)
    detach()
    press('ArrowRight')
    expect(h.next).toHaveBeenCalledTimes(1)
  })

  // --- Editable-target guard ---

  it('ignores keydown from an input, textarea, select or contenteditable element so the caret still moves', () => {
    const h = handlers()
    attachKeyboard(el, 'x', () => true, h)

    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    // happy-dom's isContentEditable getter is a stub that always reports
    // false, unlike a real browser, which the guard under test relies on.
    // This mirrors riffle.test.ts's own pointer-capture workaround for the
    // same class of environment gap.
    Object.defineProperty(editable, 'isContentEditable', { configurable: true, value: true })
    el.append(input, textarea, select, editable)

    for (const target of [input, textarea, select, editable]) {
      const event = pressFrom(target, 'ArrowRight')
      expect(event.defaultPrevented).toBe(false)
    }
    expect(h.next).not.toHaveBeenCalled()
  })

  // --- Enter and Space from a control inside a card ---

  it('leaves Enter and Space from a button inside the card alone, so card controls keep working', () => {
    // Neither key is mapped to any handler (only the axis arrows, Home and
    // End are), so a <button> (not covered by the editable-target guard,
    // which only exempts inputs, textareas, selects and contenteditable
    // regions) must be able to activate on Enter/Space exactly as it would
    // outside a card: unacted on and not defaultPrevented.
    const h = handlers()
    attachKeyboard(el, 'x', () => true, h)
    const button = document.createElement('button')
    el.appendChild(button)

    expect(pressFrom(button, 'Enter').defaultPrevented).toBe(false)
    expect(pressFrom(button, ' ').defaultPrevented).toBe(false)
    expect(h.next).not.toHaveBeenCalled()
    expect(h.prev).not.toHaveBeenCalled()
    expect(h.first).not.toHaveBeenCalled()
    expect(h.last).not.toHaveBeenCalled()
  })
})
