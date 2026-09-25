import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attachPointer } from '../src/gesture/pointer'

let el: HTMLElement

/** happy-dom does not implement pointer capture; the engine only calls it. */
function makeElement(): HTMLElement {
  const node = document.createElement('div')
  node.setPointerCapture = vi.fn()
  node.releasePointerCapture = vi.fn()
  node.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400, x: 0, y: 0 }) as DOMRect
  return node
}

function fire(node: HTMLElement, type: string, init: Record<string, unknown> = {}): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(
    event,
    { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 0, clientY: 0 },
    init,
  )
  node.dispatchEvent(event)
}

function handlers() {
  return { onStart: vi.fn(), onMove: vi.fn(), onEnd: vi.fn() }
}

const config = { axis: 'x' as const, slop: 6, enabled: () => true, getTime: () => 0 }

beforeEach(() => {
  el = makeElement()
})

describe('attachPointer', () => {
  it('does not start a drag before movement clears the slop threshold', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 103, clientY: 200 })
    expect(h.onStart).not.toHaveBeenCalled()
  })

  it('starts the drag and captures once slop is cleared along the axis', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 120, clientY: 200 })
    expect(h.onStart).toHaveBeenCalledTimes(1)
    expect(el.setPointerCapture).toHaveBeenCalledWith(1)
    expect(h.onMove).toHaveBeenCalledTimes(1)
  })

  it('abandons the gesture when the movement is across the axis, so the page can scroll', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 100, clientY: 240 })
    fire(el, 'pointermove', { clientX: 180, clientY: 240 })
    expect(h.onStart).not.toHaveBeenCalled()
    expect(el.setPointerCapture).not.toHaveBeenCalled()
  })

  it('stays locked to the axis once it has decided', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 120, clientY: 200 })
    fire(el, 'pointermove', { clientX: 130, clientY: 400 })
    expect(h.onMove).toHaveBeenCalledTimes(2)
  })

  it('reports deltas relative to the press, on both axes', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 140, clientY: 210 })
    expect(h.onMove).toHaveBeenLastCalledWith(
      expect.objectContaining({ deltaMain: 40, deltaCross: 10 }),
    )
  })

  it('reports where the card was grabbed relative to its centre', () => {
    const h = handlers()
    attachPointer(el, config, h)
    // Card is 400 tall with its centre at y=200. Grab at y=320 is 120 below.
    fire(el, 'pointerdown', { clientX: 100, clientY: 320 })
    fire(el, 'pointermove', { clientX: 120, clientY: 320 })
    expect(h.onStart).toHaveBeenCalledWith(expect.objectContaining({ grabOffsetCross: 120 }))
  })

  it('ends cleanly on pointerup', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 120, clientY: 200 })
    fire(el, 'pointerup', { clientX: 120, clientY: 200 })
    expect(h.onEnd).toHaveBeenCalledWith(expect.objectContaining({ cancelled: false }))
  })

  it('marks a stolen gesture as cancelled so it settles back instead of committing', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 120, clientY: 200 })
    fire(el, 'pointercancel', {})
    expect(h.onEnd).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true }))
  })

  it('ignores non-primary buttons', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200, button: 2 })
    fire(el, 'pointermove', { clientX: 200, clientY: 200 })
    expect(h.onStart).not.toHaveBeenCalled()
  })

  // Mutant (ConditionalExpression, `e.isPrimary === false` forced to
  // `false`): button 0 with isPrimary explicitly false (a second simultaneous
  // touch reporting itself as non-primary) must still be ignored, separately
  // from the button check above.
  it('ignores a non-primary pointer even when button is 0', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200, button: 0, isPrimary: false })
    fire(el, 'pointermove', { clientX: 130, clientY: 200 })
    expect(h.onStart).not.toHaveBeenCalled()
  })

  // Mutants (ConditionalExpression x2 and ArithmeticOperator x2, all on line
  // 95-96's axis-swapped centre/at computation): every other test in this
  // file fixes `config.axis` to 'x', so the 'y'-axis branch of both ternaries
  // is exercised only by the touch-action test below, which never drags and
  // so never reads grabOffsetCross.
  it('computes the grab offset from the correct edge on a vertical stack (axis y)', () => {
    const h = handlers()
    attachPointer(el, { ...config, axis: 'y' }, h)
    // Card is 300 wide (see makeElement), centred at x=150. Grabbing at
    // x=220 is 70px right of centre.
    fire(el, 'pointerdown', { clientX: 220, clientY: 200 })
    fire(el, 'pointermove', { clientX: 220, clientY: 230 })
    expect(h.onStart).toHaveBeenCalledWith(expect.objectContaining({ grabOffsetCross: 70 }))
  })

  // Mutant (EqualityOperator, slop's `< config.slop` loosened to `<=`):
  // movement landing exactly on the slop distance must count as cleared.
  it('treats reaching the slop distance exactly as having cleared it', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 106, clientY: 200 }) // hypot(6, 0) === 6, the slop
    expect(h.onStart).toHaveBeenCalledTimes(1)
  })

  // Mutant (EqualityOperator, the axis-lock tie-break's `<=` tightened to
  // `<`): an exactly diagonal drag must resolve to "across the axis" and be
  // abandoned, not locked.
  it('abandons the gesture at exactly 45 degrees, treating a tie as across the axis', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 110, clientY: 210 }) // deltaMain === deltaCross === 10
    expect(h.onStart).not.toHaveBeenCalled()
  })

  // NoCoverage: `fire()`'s default always sets pointerType, so the `|| 'mouse'`
  // fallback for a browser that reports none is never exercised.
  it('falls back to mouse when the browser reports no pointerType', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200, pointerType: '' })
    fire(el, 'pointermove', { clientX: 120, clientY: 200 })
    expect(h.onStart).toHaveBeenCalledWith(expect.objectContaining({ pointerType: 'mouse' }))
  })

  // Mutant (ConditionalExpression, finish()'s `if (!t.locked) return` forced
  // to `false`): a release that never cleared slop (the gesture never
  // locked, onStart never fired) must not fire onEnd either.
  it('does not fire onEnd for a release that never cleared slop', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointerup', { clientX: 102, clientY: 200 }) // 2px, under the 6px slop
    expect(h.onEnd).not.toHaveBeenCalled()
  })

  // Mutant (CallExpression, finish()'s `releaseCapture(t.id)` removed): the
  // existing "ends cleanly on pointerup" test only asserts onEnd fired, never
  // that capture was actually released.
  it('releases pointer capture on a normal pointerup, not only on detach', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 120, clientY: 200 })
    fire(el, 'pointerup', { clientX: 120, clientY: 200 })
    expect(el.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('ignores a second finger while a drag is in flight', () => {
    const h = handlers()
    attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200, pointerId: 1 })
    fire(el, 'pointermove', { clientX: 120, clientY: 200, pointerId: 1 })
    fire(el, 'pointermove', { clientX: 400, clientY: 200, pointerId: 2 })
    expect(h.onMove).toHaveBeenCalledTimes(1)
  })

  it('does nothing when disabled', () => {
    const h = handlers()
    attachPointer(el, { ...config, enabled: () => false }, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 200, clientY: 200 })
    expect(h.onStart).not.toHaveBeenCalled()
  })

  it('sets touch-action so the cross axis keeps scrolling', () => {
    attachPointer(el, config, handlers())
    expect(el.style.touchAction).toBe('pan-y')
  })

  it('sets touch-action to pan-x on a vertical stack', () => {
    attachPointer(el, { ...config, axis: 'y' }, handlers())
    expect(el.style.touchAction).toBe('pan-x')
  })

  it('removes every listener on detach', () => {
    const h = handlers()
    const detach = attachPointer(el, config, h)
    detach()
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 200, clientY: 200 })
    expect(h.onStart).not.toHaveBeenCalled()
  })

  it('releases capture and restores touch-action when detached mid-gesture', () => {
    const h = handlers()
    const detach = attachPointer(el, config, h)
    fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
    fire(el, 'pointermove', { clientX: 120, clientY: 200 })
    expect(el.style.touchAction).toBe('pan-y')
    detach()
    expect(el.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(el.style.touchAction).toBe('')
    expect(h.onEnd).not.toHaveBeenCalled()
  })
  describe('native drag and text selection', () => {
    function dragstartOnImage(): Event {
      const img = document.createElement('img')
      el.appendChild(img)
      const event = new Event('dragstart', { bubbles: true, cancelable: true })
      img.dispatchEvent(event)
      return event
    }

    it('prevents native drag and drop from an image inside the stack, until detach', () => {
      const detach = attachPointer(el, config, handlers())
      expect(dragstartOnImage().defaultPrevented).toBe(true)
      detach()
      expect(dragstartOnImage().defaultPrevented).toBe(false)
    })

    function userSelect(): string {
      return el.style.getPropertyValue('user-select')
    }
    function webkitUserSelect(): string {
      return el.style.getPropertyValue('-webkit-user-select')
    }

    function lock(): void {
      fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
      fire(el, 'pointermove', { clientX: 120, clientY: 200 })
    }

    it('disables text selection while locked and restores the prior value after pointerup', () => {
      el.style.setProperty('user-select', 'text')
      const h = handlers()
      attachPointer(el, config, h)
      fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
      // Still inside slop: not locked, nothing changed yet.
      expect(userSelect()).toBe('text')
      fire(el, 'pointermove', { clientX: 120, clientY: 200 })
      expect(h.onStart).toHaveBeenCalledTimes(1)
      expect(userSelect()).toBe('none')
      expect(webkitUserSelect()).toBe('none')
      fire(el, 'pointerup', { clientX: 120, clientY: 200 })
      expect(userSelect()).toBe('text')
      expect(webkitUserSelect()).toBe('')
    })

    it('restores user-select after pointercancel', () => {
      attachPointer(el, config, handlers())
      lock()
      expect(userSelect()).toBe('none')
      fire(el, 'pointercancel', {})
      expect(userSelect()).toBe('')
    })

    // Mutant (StringLiteral, `getPropertyValue('-webkit-user-select')`
    // replaced with `getPropertyValue('')`): the plain user-select assertions
    // above never fail this, since they only read `user-select`, whose own
    // getPropertyValue call is untouched by this mutant.
    it('captures and restores the prior -webkit-user-select value, not a blank one', () => {
      el.style.setProperty('-webkit-user-select', 'text')
      const h = handlers()
      attachPointer(el, config, h)
      lock()
      fire(el, 'pointerup', { clientX: 120, clientY: 200 })
      expect(webkitUserSelect()).toBe('text')
    })

    it('restores user-select when detached mid-gesture', () => {
      el.style.setProperty('user-select', 'text')
      const detach = attachPointer(el, config, handlers())
      lock()
      expect(userSelect()).toBe('none')
      detach()
      expect(userSelect()).toBe('text')
    })
  })
  describe('robustness', () => {
    it('replaces an abandoned gesture that never saw pointerup', () => {
      const h = handlers()
      attachPointer(el, config, h)
      fire(el, 'pointerdown', { clientX: 100, clientY: 200, pointerId: 1 })
      fire(el, 'pointermove', { clientX: 100, clientY: 260, pointerId: 1 }) // across: abandoned
      // No pointerup for pointer 1 ever arrives.
      fire(el, 'pointerdown', { clientX: 100, clientY: 200, pointerId: 2 })
      fire(el, 'pointermove', { clientX: 130, clientY: 200, pointerId: 2 })
      expect(h.onStart).toHaveBeenCalledTimes(1)
      expect(el.setPointerCapture).toHaveBeenCalledWith(2)
    })

    it('replaces a press still inside slop', () => {
      const h = handlers()
      attachPointer(el, config, h)
      fire(el, 'pointerdown', { clientX: 100, clientY: 200, pointerId: 1 })
      fire(el, 'pointerdown', { clientX: 300, clientY: 200, pointerId: 2 })
      fire(el, 'pointermove', { clientX: 330, clientY: 200, pointerId: 2 })
      expect(h.onStart).toHaveBeenCalledTimes(1)
      // Deltas are measured from the new press, not the stale one.
      expect(h.onMove).toHaveBeenLastCalledWith(expect.objectContaining({ deltaMain: 30 }))
    })

    it('still ignores a new press while a gesture is locked', () => {
      const h = handlers()
      attachPointer(el, config, h)
      fire(el, 'pointerdown', { clientX: 100, clientY: 200, pointerId: 1 })
      fire(el, 'pointermove', { clientX: 130, clientY: 200, pointerId: 1 })
      fire(el, 'pointerdown', { clientX: 300, clientY: 200, pointerId: 2 })
      fire(el, 'pointermove', { clientX: 140, clientY: 200, pointerId: 1 })
      expect(h.onStart).toHaveBeenCalledTimes(1)
      expect(h.onMove).toHaveBeenLastCalledWith(expect.objectContaining({ deltaMain: 40 }))
    })

    it('treats lostpointercapture on the tracked pointer as a cancel', () => {
      const h = handlers()
      attachPointer(el, config, h)
      fire(el, 'pointerdown', { clientX: 100, clientY: 200 })
      fire(el, 'pointermove', { clientX: 130, clientY: 200 })
      fire(el, 'lostpointercapture', { pointerId: 99 }) // some other pointer
      expect(h.onEnd).not.toHaveBeenCalled()
      fire(el, 'lostpointercapture', {})
      expect(h.onEnd).toHaveBeenCalledTimes(1)
      expect(h.onEnd).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true }))
    })

    it('ignores the lostpointercapture a card fires when its implicit touch capture moves to the container', () => {
      // Pointer Events 3, 9.4: a touch is implicitly captured to the element
      // it landed on (a card). Claiming it on the container fires
      // lostpointercapture at the card, which bubbles here. That is the
      // capture arriving, not being lost; only one fired at `el` is a loss.
      const card = document.createElement('div')
      el.appendChild(card)
      const h = handlers()
      attachPointer(el, config, h)
      fire(card, 'pointerdown', { clientX: 100, clientY: 200 })
      fire(card, 'pointermove', { clientX: 130, clientY: 200 })
      fire(card, 'lostpointercapture', {})
      expect(h.onEnd).not.toHaveBeenCalled()
      fire(el, 'pointermove', { clientX: 150, clientY: 200 })
      expect(h.onMove).toHaveBeenLastCalledWith(expect.objectContaining({ deltaMain: 50 }))
      fire(el, 'pointerup', { clientX: 150, clientY: 200 })
      expect(h.onEnd).toHaveBeenCalledTimes(1)
      expect(h.onEnd).toHaveBeenCalledWith(expect.objectContaining({ cancelled: false }))
    })
  })
})
