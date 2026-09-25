/**
 * Report an element's layout size now and whenever it changes.
 *
 * Zero sizes are skipped: an element that is hidden or not yet laid out would
 * otherwise drive a zero step travel into the engine. Where ResizeObserver does
 * not exist the size is still read once.
 */
export function observeSize(
  el: HTMLElement,
  onSize: (width: number, height: number) => void,
): () => void {
  const report = () => {
    const width = el.offsetWidth
    const height = el.offsetHeight
    if (width > 0 && height > 0) onSize(width, height)
  }
  report()
  if (typeof ResizeObserver === 'undefined') return () => {}
  const observer = new ResizeObserver(report)
  observer.observe(el)
  return () => observer.disconnect()
}
