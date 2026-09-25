import { describe, expect, it } from 'vitest'
import { computeRotation, DEFAULT_ROTATION } from '../src/math/rotation'

const centred = {
  progress: 0.5,
  grabOffsetCross: 0,
  crossExtent: 400,
  deltaMain: 50,
  deltaCross: 0,
}

describe('computeRotation', () => {
  it('is flat at rest', () => {
    expect(computeRotation({ ...centred, progress: 0, deltaMain: 0 }, DEFAULT_ROTATION)).toBe(0)
  })

  it('tilts with drag distance even from a dead-centre grab', () => {
    expect(computeRotation(centred, DEFAULT_ROTATION)).toBeGreaterThan(0)
  })

  it('reverses with the drag direction', () => {
    const right = computeRotation(centred, DEFAULT_ROTATION)
    const left = computeRotation({ ...centred, progress: -0.5, deltaMain: -50 }, DEFAULT_ROTATION)
    expect(left).toBeCloseTo(-right, 10)
  })

  it('pivots the opposite way when grabbed near the far edge', () => {
    const top = computeRotation({ ...centred, grabOffsetCross: -180 }, DEFAULT_ROTATION)
    const bottom = computeRotation({ ...centred, grabOffsetCross: 180 }, DEFAULT_ROTATION)
    expect(top).toBeGreaterThan(bottom)
  })

  it('never exceeds maxRotation', () => {
    // All three terms aligned: base 5.6 + lever 10.4 + trajectory 2.4 = 18.4,
    // which the clamp must bring back to 16.
    const extreme = computeRotation(
      { progress: 40, grabOffsetCross: -1000, crossExtent: 400, deltaMain: 0, deltaCross: 900 },
      DEFAULT_ROTATION,
    )
    expect(extreme).toBe(DEFAULT_ROTATION.maxRotation)
  })

  it('adds tilt for a diagonal drag over a flat one', () => {
    const flat = computeRotation(centred, DEFAULT_ROTATION)
    const diagonal = computeRotation({ ...centred, deltaCross: 50 }, DEFAULT_ROTATION)
    expect(diagonal).toBeGreaterThan(flat)
  })

  it('collapses to the distance term when lever and trajectory are disabled', () => {
    const options = { ...DEFAULT_ROTATION, leverFactor: 0, trajFactor: 0 }
    const a = computeRotation({ ...centred, grabOffsetCross: 180, deltaCross: 90 }, options)
    const b = computeRotation(centred, options)
    expect(a).toBeCloseTo(b, 10)
  })
  it('freezes DEFAULT_ROTATION', () => {
    expect(Object.isFrozen(DEFAULT_ROTATION)).toBe(true)
  })
})
