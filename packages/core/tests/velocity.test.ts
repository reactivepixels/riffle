import { describe, expect, it } from 'vitest'
import { createVelocityTracker } from '../src/gesture/velocity'

describe('velocity tracker', () => {
  it('returns zero before it has two samples', () => {
    const t = createVelocityTracker()
    expect(t.get(0)).toBe(0)
    t.add(10, 0)
    expect(t.get(0)).toBe(0)
  })

  it('measures a steady drag in pixels per millisecond', () => {
    const t = createVelocityTracker()
    t.add(0, 0)
    t.add(50, 50)
    expect(t.get(50)).toBeCloseTo(1, 10)
  })

  it('reports a negative velocity for a drag in the negative direction', () => {
    const t = createVelocityTracker()
    t.add(0, 0)
    t.add(-30, 60)
    expect(t.get(60)).toBeCloseTo(-0.5, 10)
  })

  it('reads the fast samples when released straight after them', () => {
    const t = createVelocityTracker()
    t.add(0, 0)
    t.add(40, 16)
    expect(t.get(20)).toBeCloseTo(2.5, 10)
  })

  it('reads zero when released after a hold with no further samples', () => {
    // A stationary pointer emits no pointermove, so the only thing that can
    // age these samples out is the release time passed to get().
    const t = createVelocityTracker()
    t.add(0, 0)
    t.add(40, 16)
    // Precondition: the same samples read as a fling when the release is prompt.
    expect(t.get(16)).toBeCloseTo(2.5, 10)
    expect(t.get(216)).toBe(0)
  })

  it('discards samples older than the window', () => {
    const t = createVelocityTracker(100)
    t.add(0, 0)
    t.add(1000, 10) // very fast, but ancient
    t.add(1000, 500)
    t.add(1010, 550)
    expect(t.get(550)).toBeCloseTo(0.2, 10)
  })

  it('returns zero when every retained sample shares a timestamp', () => {
    const t = createVelocityTracker()
    t.add(0, 100)
    t.add(40, 100)
    expect(t.get(100)).toBe(0)
  })

  it('clears on reset', () => {
    const t = createVelocityTracker()
    t.add(0, 0)
    t.add(100, 50)
    expect(t.get(50)).not.toBe(0)
    t.reset()
    expect(t.size()).toBe(0)
    expect(t.get(50)).toBe(0)
  })

  it('bounds its memory when many samples share a timestamp', () => {
    // The time window cannot prune these, so only the hard cap can.
    const t = createVelocityTracker(100)
    for (let i = 0; i < 5000; i += 1) t.add(i, 0)
    expect(t.size()).toBe(128)
  })

  // Mutant (EqualityOperator, prune()'s `size > 0` loosened to `size >= 0`):
  // every existing test adds at least one sample before pruning matters. With
  // zero samples, the ring's zero-initialized backing array still holds a
  // stale `times[head] === 0`, and a `now` far enough forward makes that
  // look prunable. The real guard stops before ever reading it; the mutant
  // does not, and corrupts `size` to -1 in the process.
  it('does not corrupt its size when a get() far in the future prunes an empty tracker', () => {
    const t = createVelocityTracker(100)
    expect(t.get(1000)).toBe(0)
    expect(t.size()).toBe(0)
    // Confirms the tracker still works normally afterward: a real
    // corruption leaves `size` negative and `head` advanced, so the next
    // add()/get() pair would misbehave.
    t.add(0, 1000)
    t.add(50, 1050)
    expect(t.get(1050)).toBeCloseTo(1, 10)
  })

  // Mutant (EqualityOperator, prune()'s `times[head] < cutoff` loosened to
  // `<= cutoff`): a sample sitting exactly on the window's lower edge
  // (`now - windowMs`) must be kept, not pruned, or the window is
  // effectively narrower than windowMs by one instant.
  it('keeps a sample exactly on the window boundary rather than pruning it', () => {
    const t = createVelocityTracker(100)
    t.add(0, 0)
    t.add(10, 50)
    expect(t.get(100)).toBeCloseTo(10 / 50, 10)
    expect(t.size()).toBe(2)
  })

  // Mutant (CallExpression, add()'s trailing `prune(time)` call removed):
  // get() always prunes before reading, so this is invisible through get()
  // alone. size() exposes the raw retained count, which only stays accurate
  // immediately after add() if add() prunes eagerly rather than leaving
  // stale samples for the next call to discover.
  it('prunes on every add(), not only lazily the next time get() runs', () => {
    const t = createVelocityTracker(100)
    t.add(0, 0)
    t.add(100, 1000) // 1000ms later, well past the 100ms window
    expect(t.size()).toBe(1)
  })

  it('keeps the newest samples once the ring is full', () => {
    // Overwriting must drop the oldest sample, not the newest: after 200
    // samples at 1px/ms the retained span still reads 1px/ms.
    const t = createVelocityTracker(1000)
    for (let i = 0; i < 200; i += 1) t.add(i, i)
    expect(t.size()).toBe(128)
    expect(t.get(199)).toBeCloseTo(1, 10)
    t.add(1199, 200) // a jump of 1000px in 1ms on the newest sample
    // Oldest retained is now t=73, position 73: (1199 - 73) / (200 - 73).
    expect(t.get(200)).toBeCloseTo((1199 - 73) / (200 - 73), 10)
  })
})
