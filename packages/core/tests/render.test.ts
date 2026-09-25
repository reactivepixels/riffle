import { beforeEach, describe, expect, it } from 'vitest'
import { applyPose, poseToTransform } from '../src/render/transform'
import { createPose } from '../src/layout/fan'

let el: HTMLElement

beforeEach(() => {
  el = document.createElement('div')
})

describe('poseToTransform', () => {
  it('maps main to x on the horizontal axis', () => {
    const p = { ...createPose(), main: 10, cross: 4 }
    expect(poseToTransform(p, 'x')).toBe(
      'translate3d(10.00px, 4.00px, 0) rotate(0.00deg) scale(1.000)',
    )
  })

  it('maps main to y on the vertical axis', () => {
    const p = { ...createPose(), main: 10, cross: 4 }
    expect(poseToTransform(p, 'y')).toBe(
      'translate3d(4.00px, 10.00px, 0) rotate(0.00deg) scale(1.000)',
    )
  })
})

describe('applyPose', () => {
  it('writes transform, opacity and z-index', () => {
    const p = { ...createPose(), main: 12, rotation: 3, scale: 0.9, opacity: 0.5, zIndex: 7 }
    applyPose(el, p, 'x', createPose())
    expect(el.style.transform).toContain('translate3d(12.00px, 0.00px, 0)')
    expect(el.style.opacity).toBe('0.5')
    expect(el.style.zIndex).toBe('7')
  })

  it('reports that it wrote when the pose changed', () => {
    const last = createPose()
    expect(applyPose(el, { ...createPose(), main: 5 }, 'x', last)).toBe(true)
  })

  it('skips the write entirely when nothing moved', () => {
    const last = createPose()
    const pose = { ...createPose(), main: 5 }
    applyPose(el, pose, 'x', last)
    el.style.transform = 'SENTINEL'
    expect(applyPose(el, pose, 'x', last)).toBe(false)
    expect(el.style.transform).toBe('SENTINEL')
  })

  it('ignores movement below the rounding floor', () => {
    const last = createPose()
    applyPose(el, { ...createPose(), main: 5 }, 'x', last)
    expect(applyPose(el, { ...createPose(), main: 5.0001 }, 'x', last)).toBe(false)
  })

  it('writes again once movement clears the rounding floor', () => {
    const last = createPose()
    applyPose(el, { ...createPose(), main: 5 }, 'x', last)
    expect(applyPose(el, { ...createPose(), main: 5.05 }, 'x', last)).toBe(true)
  })

  it('writes only the channel that changed', () => {
    const last = createPose()
    const pose = { ...createPose(), main: 5, opacity: 1, zIndex: 3 }
    applyPose(el, pose, 'x', last)
    el.style.transform = 'SENTINEL'
    expect(applyPose(el, { ...pose, opacity: 0.5 }, 'x', last)).toBe(true)
    expect(el.style.transform).toBe('SENTINEL')
    expect(el.style.opacity).toBe('0.5')
  })

  // A card the layout has faded fully out (the depth -1 exit slot, or any
  // depth past a layout's own visibility falloff) still carries a real
  // layout offset in its pose, often well outside the container (the exit
  // slot sits one stepTravel to the right). Nothing paints at opacity 0,
  // but a transformed box still counts toward the page's scrollable
  // overflow, so an invisible card must get the neutral transform instead
  // of its layout offset.
  /**
   * riffle.ts's own `writeNode` never hands `applyPose` a freshly defaulted
   * `createPose()` as `last`: the first `last` for any card is seeded with
   * NaN in every field (see riffle.ts's own comment on why), specifically
   * so the first write is never skipped as a false "nothing changed"
   * match. `createPose()`'s defaults (main 0, cross 0, rotation 0, scale 1)
   * happen to equal this fix's own neutral values, so a test using
   * `createPose()` as the starting `last` would see the first write
   * skipped for the wrong reason (it looks unchanged from the default) and
   * prove nothing; this mirrors the real seed instead.
   */
  function unwrittenLast() {
    return { ...createPose(), main: NaN, cross: NaN, rotation: NaN, scale: NaN, opacity: NaN }
  }

  // A card the layout has faded fully out (the depth -1 exit slot, or any
  // depth past a layout's own visibility falloff) still carries a real
  // layout offset in its pose, often well outside the container (the exit
  // slot sits one stepTravel to the right). Nothing paints at opacity 0,
  // but a transformed box still counts toward the page's scrollable
  // overflow, so an invisible card must get the neutral transform instead
  // of its layout offset.
  it('writes the neutral transform (no translate, no rotation, full scale) when opacity resolves to 0', () => {
    const pose = { ...createPose(), main: 240, cross: 12, rotation: 8, scale: 0.5, opacity: 0 }
    applyPose(el, pose, 'x', unwrittenLast())
    expect(el.style.transform).toBe('translate3d(0.00px, 0.00px, 0) rotate(0.00deg) scale(1.000)')
    expect(el.style.opacity).toBe('0')
  })

  it('gets its real pose on the same frame its opacity leaves 0, with no lag from the neutral state', () => {
    const last = unwrittenLast()
    // Settled at the exit slot: invisible, offset one stepTravel to the right.
    applyPose(el, { ...createPose(), main: 240, opacity: 0 }, 'x', last)
    expect(el.style.transform).toBe('translate3d(0.00px, 0.00px, 0) rotate(0.00deg) scale(1.000)')

    // The very next frame it becomes visible again (drag-back/prev): its
    // real, current pose must be written immediately, not interpolated
    // from the neutral transform just written above.
    const wrote = applyPose(el, { ...createPose(), main: 118, opacity: 1 }, 'x', last)
    expect(wrote).toBe(true)
    expect(el.style.transform).toBe('translate3d(118.00px, 0.00px, 0) rotate(0.00deg) scale(1.000)')
    expect(el.style.opacity).toBe('1')
  })

  it('does not write again while a card stays invisible with a moving layout offset (no visible difference at opacity 0)', () => {
    const last = unwrittenLast()
    applyPose(el, { ...createPose(), main: 240, opacity: 0 }, 'x', last)
    el.style.transform = 'SENTINEL'
    // Depth still moving (e.g. past a layout's own visibility falloff), but
    // opacity is still exactly 0: neutral write is already in place, so a
    // changing invisible offset does not cost another DOM write.
    expect(applyPose(el, { ...createPose(), main: 400, opacity: 0 }, 'x', last)).toBe(false)
    expect(el.style.transform).toBe('SENTINEL')
  })
})
