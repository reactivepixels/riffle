import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPRING,
  isSettled,
  resolveSpring,
  SPRING_PRESETS,
  springStep,
  type SpringState,
} from '../src/animation/spring'

const DT = 1 / 120

function settle(state: SpringState, target: number, maxSteps = 2000): number {
  let steps = 0
  while (!isSettled(state, target) && steps < maxSteps) {
    springStep(state, target, DEFAULT_SPRING, DT)
    steps += 1
  }
  return steps
}

describe('spring', () => {
  it('converges on the target', () => {
    const state: SpringState = { value: 0, velocity: 0 }
    settle(state, 1)
    expect(isSettled(state, 1)).toBe(true)
    expect(state.value).toBeCloseTo(1, 2)
  })

  it('settles within a reasonable time at the default tuning', () => {
    const state: SpringState = { value: 0, velocity: 0 }
    const steps = settle(state, 1)
    // 120 substeps per second, so under a second of animation.
    expect(steps).toBeLessThan(120)
  })

  it('is near critically damped: overshoot stays under two percent', () => {
    const state: SpringState = { value: 0, velocity: 0 }
    let peak = 0
    for (let i = 0; i < 400; i += 1) {
      springStep(state, 1, DEFAULT_SPRING, DT)
      if (state.value > peak) peak = state.value
    }
    expect(peak).toBeLessThan(1.02)
  })

  it('is deterministic: identical inputs give identical trajectories', () => {
    const a: SpringState = { value: 0, velocity: 0 }
    const b: SpringState = { value: 0, velocity: 0 }
    for (let i = 0; i < 50; i += 1) {
      springStep(a, 1, DEFAULT_SPRING, DT)
      springStep(b, 1, DEFAULT_SPRING, DT)
    }
    expect(a.value).toBe(b.value)
    expect(a.velocity).toBe(b.velocity)
  })

  it('carries an initial velocity into the motion', () => {
    const still: SpringState = { value: 0, velocity: 0 }
    const flung: SpringState = { value: 0, velocity: 5 }
    springStep(still, 1, DEFAULT_SPRING, DT)
    springStep(flung, 1, DEFAULT_SPRING, DT)
    expect(flung.value).toBeGreaterThan(still.value)
  })

  it('is not settled while still moving, even when sitting on the target', () => {
    expect(isSettled({ value: 1, velocity: 4 }, 1)).toBe(false)
  })

  it('is not settled while away from the target, even when stationary', () => {
    expect(isSettled({ value: 0.5, velocity: 0 }, 1)).toBe(false)
  })

  // Mutants 400/404 (EqualityOperator, both `<` tolerance comparisons loosened
  // to `<=`): the settle test is `< 0.001` and `< 0.01`,
  // strictly. A value sitting exactly on either tolerance boundary must still
  // read as unsettled, or these two comparisons are indistinguishable from a
  // test that only probes comfortably inside or outside the band.
  it('is not settled exactly at the position tolerance boundary (mutant 400)', () => {
    // target 0 keeps `value - target` bit-exact at 0.001, rather than
    // relying on a subtraction like `1.001 - 1`, which floating point
    // rounds down to just under 0.001 and would pass on either operator.
    expect(isSettled({ value: 0.001, velocity: 0 }, 0)).toBe(false)
  })

  it('is not settled exactly at the velocity tolerance boundary (mutant 404)', () => {
    expect(isSettled({ value: 0, velocity: 0.01 }, 0)).toBe(false)
  })

  it('mutates state in place', () => {
    const state: SpringState = { value: 0, velocity: 0 }
    expect(springStep(state, 1, DEFAULT_SPRING, DT)).toBeUndefined()
    expect(state.value).not.toBe(0)
  })

  it('resolves named presets', () => {
    expect(resolveSpring('snappy')).toEqual({ stiffness: 420, damping: 38 })
  })

  it('passes an explicit config through unchanged', () => {
    expect(resolveSpring({ stiffness: 100, damping: 10 })).toEqual({ stiffness: 100, damping: 10 })
  })
  it('freezes the exported spring constants', () => {
    expect(Object.isFrozen(SPRING_PRESETS)).toBe(true)
    for (const preset of Object.values(SPRING_PRESETS)) expect(Object.isFrozen(preset)).toBe(true)
    expect(Object.isFrozen(DEFAULT_SPRING)).toBe(true)
  })
})
