import { describe, expect, it } from 'vitest'
import { createPose, fan } from '../src/layout/fan'
import type { LayoutGeometry } from '../src/types'

const geometry: LayoutGeometry = {
  cardExtent: 300,
  crossExtent: 400,
  gap: 20,
  maxVisible: 4,
  count: 10,
}

describe('fan layout', () => {
  it('puts the front card at the origin, full size', () => {
    const p = fan().pose(0, geometry, createPose())
    expect(p.main).toBe(0)
    expect(p.scale).toBe(1)
    expect(p.opacity).toBe(1)
  })

  it('is linear across the exit slot so drag can track the finger 1:1', () => {
    const layout = fan()
    const half = layout.pose(-0.5, geometry, createPose()).main
    const full = layout.pose(-1, geometry, createPose()).main
    expect(half).toBeCloseTo(full / 2, 10)
  })

  it('exits by one full step of travel', () => {
    const layout = fan()
    expect(layout.pose(-1, geometry, createPose()).main).toBe(layout.stepTravel(geometry))
    expect(layout.stepTravel(geometry)).toBe(320)
  })

  it('fades the exiting card late rather than linearly', () => {
    const p = fan().pose(-0.5, geometry, createPose())
    expect(p.opacity).toBeCloseTo(0.75, 10)
  })

  it('fans cards behind the front to the negative side at decreasing scale', () => {
    const layout = fan()
    const first = layout.pose(1, geometry, createPose())
    const second = layout.pose(2, geometry, createPose())
    expect(first.main).toBeLessThan(0)
    expect(second.main).toBeLessThan(first.main)
    expect(second.scale).toBeLessThan(first.scale)
  })

  it('is fully opaque up to maxVisible - 1 and fully transparent at maxVisible', () => {
    const layout = fan()
    expect(layout.pose(geometry.maxVisible - 1, geometry, createPose()).opacity).toBe(1)
    expect(layout.pose(geometry.maxVisible, geometry, createPose()).opacity).toBe(0)
  })

  it('stacks z-index so the front card is on top', () => {
    const layout = fan()
    const front = layout.pose(0, geometry, createPose()).zIndex
    const behind = layout.pose(1, geometry, createPose()).zIndex
    expect(front).toBeGreaterThan(behind)
  })

  it('writes into the pose it is given', () => {
    const out = createPose()
    expect(fan().pose(1, geometry, out)).toBe(out)
  })

  it('clamps scale at zero for very deep cards', () => {
    expect(fan({ scaleStep: 0.5 }).pose(10, geometry, createPose()).scale).toBe(0)
  })
})
