import { describe, expect, it, vi } from 'vitest'
import { createStore, shallowEqual } from '../src/store'
import type { RiffleSnapshot } from '../src/types'

function makeSnapshot(overrides: Partial<RiffleSnapshot> = {}): RiffleSnapshot {
  return {
    activeIndex: 0,
    count: 5,
    isDragging: false,
    isSettling: false,
    canPrev: true,
    canNext: true,
    ...overrides,
  }
}

describe('store', () => {
  it('returns the same object reference when nothing changed', () => {
    // React's useSyncExternalStore loops forever without this.
    const store = createStore(() => makeSnapshot())
    const first = store.getSnapshot()
    store.notify()
    expect(store.getSnapshot()).toBe(first)
  })

  it('returns a new reference when a field changed', () => {
    let index = 0
    const store = createStore(() => makeSnapshot({ activeIndex: index }))
    const first = store.getSnapshot()
    index = 1
    store.notify()
    expect(store.getSnapshot()).not.toBe(first)
    expect(store.getSnapshot().activeIndex).toBe(1)
  })

  it('does not call listeners when nothing changed', () => {
    const store = createStore(() => makeSnapshot())
    const listener = vi.fn()
    store.subscribe(listener)
    store.notify()
    store.notify()
    expect(listener).not.toHaveBeenCalled()
  })

  it('calls every listener once per real change', () => {
    let index = 0
    const store = createStore(() => makeSnapshot({ activeIndex: index }))
    const a = vi.fn()
    const b = vi.fn()
    store.subscribe(a)
    store.subscribe(b)
    index = 1
    store.notify()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('stops calling a listener after it unsubscribes', () => {
    let index = 0
    const store = createStore(() => makeSnapshot({ activeIndex: index }))
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    index = 1
    store.notify()
    expect(listener).not.toHaveBeenCalled()
  })

  it('snapshots the listener list, so an unsubscribe mid-notify applies next time', () => {
    let index = 0
    const store = createStore(() => makeSnapshot({ activeIndex: index }))
    const second = vi.fn()
    let unsubscribeSecond = () => {}
    const first = vi.fn(() => unsubscribeSecond())
    store.subscribe(first)
    unsubscribeSecond = store.subscribe(second)

    index = 1
    store.notify()
    expect(second).toHaveBeenCalledTimes(1)

    index = 2
    store.notify()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('shallowEqual', () => {
  it('is false when the second object has extra keys the first does not have', () => {
    // Precondition: every key the two objects share is equal, so a
    // one-directional comparison (iterating only the first argument's keys)
    // would wrongly call this a match.
    const a = { x: 1 }
    const b = { x: 1, y: 2 }
    expect(a.x === (b as { x: number }).x).toBe(true)

    expect(shallowEqual(a, b)).toBe(false)
    expect(shallowEqual(b, a)).toBe(false)
  })

  it('is true for two objects with the same keys and values', () => {
    expect(shallowEqual({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true)
  })
})
