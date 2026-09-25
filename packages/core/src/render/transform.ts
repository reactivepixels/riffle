import type { Axis, Pose } from '../types'

/**
 * Fixed property order, and nothing that triggers layout. `main` maps to x on
 * the horizontal axis and to y on the vertical one.
 */
export function poseToTransform(pose: Pose, axis: Axis): string {
  const x = axis === 'x' ? pose.main : pose.cross
  const y = axis === 'x' ? pose.cross : pose.main
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${pose.rotation.toFixed(2)}deg) scale(${pose.scale.toFixed(3)})`
}

/**
 * Write a pose to an element, skipping the write when nothing visible changed.
 *
 * `last` is mutated to record what was written, so a card at rest costs no DOM
 * work at all. Returns whether anything was written.
 */
export function applyPose(el: HTMLElement, pose: Pose, axis: Axis, last: Pose): boolean {
  const opacity = Math.round(pose.opacity * 1000) / 1000
  // A card the layout has faded fully out (the depth -1 exit slot, or any
  // depth past a layout's own visibility falloff) still carries its real
  // layout offset in `pose.main`/`pose.cross`,
  // often well outside the container's own box (the exit slot sits one
  // stepTravel to the right, for example). Nothing paints at opacity 0, so
  // that offset is never seen, but the transformed box still counts
  // toward the page's scrollable overflow: a consumer embedding Riffle in
  // a narrow page got sideways scroll from cards nobody can see. Writing
  // the neutral transform instead (no translate, no rotation, full scale)
  // keeps an invisible card's box exactly where the untransformed layout
  // already sits, inside the container, with zero visual difference
  // (nothing paints at opacity 0 either way): plain numbers substituted in
  // this branch, no new object, so the zero-allocation hot path is
  // unaffected. The moment a card's rounded opacity leaves 0, this reads
  // its real pose fields again on that very frame: nothing here
  // interpolates from the neutral state, so there is no lag on becoming
  // visible again (drag-back/prev out of the exit slot, for example).
  const neutral = opacity === 0
  const main = neutral ? 0 : Math.round(pose.main * 100) / 100
  const cross = neutral ? 0 : Math.round(pose.cross * 100) / 100
  const rotation = neutral ? 0 : Math.round(pose.rotation * 100) / 100
  const scale = neutral ? 1 : Math.round(pose.scale * 1000) / 1000
  const zIndex = pose.zIndex

  if (
    main === last.main &&
    cross === last.cross &&
    rotation === last.rotation &&
    scale === last.scale &&
    opacity === last.opacity &&
    zIndex === last.zIndex
  ) {
    return false
  }

  if (
    main !== last.main ||
    cross !== last.cross ||
    rotation !== last.rotation ||
    scale !== last.scale
  ) {
    last.main = main
    last.cross = cross
    last.rotation = rotation
    last.scale = scale
    el.style.transform = poseToTransform(last, axis)
  }
  if (opacity !== last.opacity) {
    last.opacity = opacity
    el.style.opacity = String(opacity)
  }
  if (zIndex !== last.zIndex) {
    last.zIndex = zIndex
    el.style.zIndex = String(zIndex)
  }
  return true
}
