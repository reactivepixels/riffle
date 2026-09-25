import type { Axis } from '../types'

export interface DragStart {
  pointerType: 'mouse' | 'touch' | 'pen'
  /** Pointer position across the axis, relative to the card centre, in pixels. */
  grabOffsetCross: number
  time: number
}

export interface DragMove {
  deltaMain: number
  deltaCross: number
  time: number
}

export interface DragEnd {
  /** True when the browser took the gesture. Settle back; do not commit. */
  cancelled: boolean
  time: number
}

export interface PointerConfig {
  axis: Axis
  /** Pixels of movement before a gesture is claimed. */
  slop: number
  enabled(): boolean
  getTime(): number
}

export interface PointerHandlers {
  onStart(info: DragStart): void
  /**
   * `info` is one object reused for every move of every gesture, so the
   * highest-frequency path allocates nothing. Read it synchronously; never
   * retain it.
   */
  onMove(info: DragMove): void
  onEnd(info: DragEnd): void
}

interface Tracking {
  id: number
  startX: number
  startY: number
  grabOffsetCross: number
  pointerType: 'mouse' | 'touch' | 'pen'
  locked: boolean
  abandoned: boolean
}

export function attachPointer(
  el: HTMLElement,
  config: PointerConfig,
  handlers: PointerHandlers,
): () => void {
  // The browser keeps the cross axis, so we never need a non-passive
  // touchmove listener or a preventDefault, and scrolling never janks.
  const previousTouchAction = el.style.touchAction
  el.style.touchAction = config.axis === 'x' ? 'pan-y' : 'pan-x'

  let tracking: Tracking | null = null
  // Text selection is switched off only while a gesture is locked, and
  // the inline values found at lock time are put back exactly.
  const style = el.style
  let previousSelect = ''
  let previousWebkitSelect = ''
  function lockSelection(): void {
    previousSelect = style.getPropertyValue('user-select')
    previousWebkitSelect = style.getPropertyValue('-webkit-user-select')
    style.setProperty('user-select', 'none')
    style.setProperty('-webkit-user-select', 'none')
  }
  function restoreSelection(): void {
    style.setProperty('user-select', previousSelect)
    style.setProperty('-webkit-user-select', previousWebkitSelect)
  }

  // Reused for every onMove call; see PointerHandlers.onMove.
  const move: DragMove = { deltaMain: 0, deltaCross: 0, time: 0 }

  const mainOf = (e: PointerEvent, t: Tracking) =>
    config.axis === 'x' ? e.clientX - t.startX : e.clientY - t.startY
  const crossOf = (e: PointerEvent, t: Tracking) =>
    config.axis === 'x' ? e.clientY - t.startY : e.clientX - t.startX

  function onDown(e: PointerEvent): void {
    // Only a locked gesture owns the pointer. One that was abandoned, or
    // never cleared slop, may never see its pointerup (the page took it, or
    // the release happened outside the window), so a fresh press replaces it
    // rather than being ignored forever.
    if (tracking?.locked || !config.enabled()) return
    if (e.button !== 0 || e.isPrimary === false) return

    const rect = el.getBoundingClientRect()
    const centre = config.axis === 'x' ? rect.top + rect.height / 2 : rect.left + rect.width / 2
    const at = config.axis === 'x' ? e.clientY : e.clientX

    tracking = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabOffsetCross: at - centre,
      pointerType: (e.pointerType as Tracking['pointerType']) || 'mouse',
      locked: false,
      abandoned: false,
    }
  }

  function onMove(e: PointerEvent): void {
    const t = tracking
    if (!t || t.abandoned || e.pointerId !== t.id) return

    const main = mainOf(e, t)
    const cross = crossOf(e, t)

    if (!t.locked) {
      if (Math.hypot(main, cross) < config.slop) return
      if (Math.abs(main) <= Math.abs(cross)) {
        // Across the axis: the page owns this gesture.
        t.abandoned = true
        return
      }
      t.locked = true
      lockSelection()
      el.setPointerCapture(t.id)
      handlers.onStart({
        pointerType: t.pointerType,
        grabOffsetCross: t.grabOffsetCross,
        time: config.getTime(),
      })
    }

    move.deltaMain = main
    move.deltaCross = cross
    move.time = config.getTime()
    handlers.onMove(move)
  }

  // Shared by finish() and detach(): releasing a capture that is already
  // gone (e.g. the browser released it first) throws, and there is nothing
  // useful to do about that, so both call sites swallow it the same way.
  function releaseCapture(id: number): void {
    try {
      el.releasePointerCapture(id)
    } catch {
      // Capture may already be gone. Nothing to do.
    }
  }

  function finish(e: PointerEvent, cancelled: boolean): void {
    const t = tracking
    if (!t || e.pointerId !== t.id) return
    tracking = null
    if (!t.locked) return
    restoreSelection()
    releaseCapture(t.id)
    handlers.onEnd({ cancelled, time: config.getTime() })
  }

  const onUp = (e: PointerEvent) => finish(e, false)
  const onCancel = (e: PointerEvent) => finish(e, true)
  // Touch is implicitly captured to the card it landed on (Pointer Events 3,
  // 9.4). Taking it on `el` fires lostpointercapture at that card, and it
  // bubbles here: that is our capture arriving, not ending. Only a loss fired
  // at `el` itself means this gesture lost its capture.
  const onLostCapture = (e: PointerEvent) => {
    if (e.target === el) finish(e, true)
  }
  // An <img> or <a> inside a card would otherwise start native drag and
  // drop, which the browser follows with pointercancel, killing the gesture.
  const onNativeDrag = (e: Event) => e.preventDefault()

  // One list of [type, handler] pairs driving both attach and detach, so the
  // event types are named once each rather than twice.
  const wired: Array<[string, EventListener]> = [
    ['pointerdown', onDown as EventListener],
    ['pointermove', onMove as EventListener],
    ['pointerup', onUp as EventListener],
    ['pointercancel', onCancel as EventListener],
    // Losing capture (element removed, capture stolen, the tab switched)
    // means no pointerup is coming for this gesture, so it ends as a cancel.
    ['lostpointercapture', onLostCapture as EventListener],
    ['dragstart', onNativeDrag],
  ]
  for (const [type, fn] of wired) el.addEventListener(type, fn)

  return () => {
    for (const [type, fn] of wired) el.removeEventListener(type, fn)
    // Detach is called from destroy(), so we deliberately do not fire onEnd:
    // the consumer is being torn down and cannot service a settle.
    if (tracking?.locked) {
      restoreSelection()
      releaseCapture(tracking.id)
    }
    el.style.touchAction = previousTouchAction
    tracking = null
  }
}
