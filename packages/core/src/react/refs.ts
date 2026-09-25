import type { MutableRefObject, Ref, RefCallback } from 'react'

export function setRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) (ref as MutableRefObject<T | null>).current = value
}

const composed = new WeakMap<object, WeakMap<object, RefCallback<HTMLElement>>>()

/**
 * Compose our ref with a consumer's. The same pair always yields the same
 * function, so React does not detach and reattach the ref on every render.
 */
export function mergeRef(
  ours: (el: HTMLElement | null) => void,
  theirs: Ref<HTMLElement> | undefined,
): RefCallback<HTMLElement> {
  if (!theirs) return ours
  let byOurs = composed.get(ours)
  if (!byOurs) {
    byOurs = new WeakMap()
    composed.set(ours, byOurs)
  }
  let ref = byOurs.get(theirs)
  if (!ref) {
    ref = (el) => {
      ours(el)
      setRef(theirs, el)
    }
    byOurs.set(theirs, ref)
  }
  return ref
}
