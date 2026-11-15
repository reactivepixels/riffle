/**
 * Mounts a showcase scene's stack the first time the scene comes within one
 * viewport of the screen, so the page parses and paints before any engine
 * starts, and a reader who never scrolls that far never pays for it.
 * Falls back to mounting straight away where IntersectionObserver does not
 * exist.
 */
export function mountWhenNear(el: Element, mount: () => void): void {
  if (typeof IntersectionObserver === 'undefined') {
    mount()
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      mount()
    },
    { rootMargin: '100% 0px' },
  )
  observer.observe(el)
}

/** Whether the reader has asked the system for reduced motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
