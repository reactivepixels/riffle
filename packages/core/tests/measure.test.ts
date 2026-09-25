import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeSize } from '../src/measure'

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  observed: Element[] = []
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  disconnect() {
    this.observed = []
  }
  fire() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

function sized(width: number, height: number): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width })
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
  return el
}

function resize(el: HTMLElement, width: number, height: number) {
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width })
  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
}

const original = globalThis.ResizeObserver

beforeEach(() => {
  FakeResizeObserver.instances = []
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver
})

afterEach(() => {
  globalThis.ResizeObserver = original
})

describe('observeSize', () => {
  it('reports the current size immediately', () => {
    const onSize = vi.fn()
    observeSize(sized(500, 700), onSize)
    expect(onSize).toHaveBeenCalledWith(500, 700)
  })

  it('reports again when the observed element resizes', () => {
    const onSize = vi.fn()
    const el = sized(500, 700)
    observeSize(el, onSize)
    resize(el, 640, 800)
    FakeResizeObserver.instances[0]?.fire()
    expect(onSize).toHaveBeenLastCalledWith(640, 800)
  })

  it('skips zero sizes, so a hidden or unlaid-out element never poisons geometry', () => {
    const onSize = vi.fn()
    observeSize(sized(0, 0), onSize)
    expect(onSize).not.toHaveBeenCalled()
  })

  it('disconnects on cleanup', () => {
    const el = sized(500, 700)
    const stop = observeSize(el, vi.fn())
    expect(FakeResizeObserver.instances[0]?.observed).toContain(el)
    stop()
    expect(FakeResizeObserver.instances[0]?.observed).toEqual([])
  })

  it('still measures once where ResizeObserver does not exist', () => {
    // @ts-expect-error simulating an environment without ResizeObserver
    delete globalThis.ResizeObserver
    const onSize = vi.fn()
    expect(() => observeSize(sized(500, 700), onSize)).not.toThrow()
    expect(onSize).toHaveBeenCalledWith(500, 700)
  })
})
