const DEFAULT_WINDOW_MS = 100
const MAX_SAMPLES = 128

export interface VelocityTracker {
  add(position: number, time: number): void
  /**
   * Pixels per millisecond, signed, over the samples still inside the window
   * at `now`. Zero when fewer than two remain.
   */
  get(now: number): number
  reset(): void
  /** Retained sample count. Exposed for tests. */
  size(): number
}

/**
 * Velocity over a sliding time window.
 *
 * Deliberately not an exponential moving average. An EMA is frame-rate
 * dependent, and it retains velocity from earlier in a gesture, so a drag that
 * stops dead before release still reads as a fling. A window reports zero,
 * which is what stopping means.
 *
 * The window is measured against the time passed to get(), not only against
 * the newest sample: a stationary pointer emits no pointermove, so samples
 * from before a hold would otherwise survive all the way to release.
 *
 * Storage is a fixed ring of MAX_SAMPLES, preallocated, so neither add() nor
 * get() allocates.
 */
export function createVelocityTracker(windowMs = DEFAULT_WINDOW_MS): VelocityTracker {
  const positions = new Float64Array(MAX_SAMPLES)
  const times = new Float64Array(MAX_SAMPLES)
  // Index of the oldest retained sample, and how many are retained.
  let head = 0
  let size = 0

  function prune(now: number): void {
    const cutoff = now - windowMs
    while (size > 0 && (times[head] ?? 0) < cutoff) {
      head = (head + 1) % MAX_SAMPLES
      size -= 1
    }
  }

  return {
    add(position, time) {
      const slot = (head + size) % MAX_SAMPLES
      positions[slot] = position
      times[slot] = time
      // Full: the write above landed on the oldest sample, so drop it.
      if (size === MAX_SAMPLES) head = (head + 1) % MAX_SAMPLES
      else size += 1
      prune(time)
    },

    get(now) {
      prune(now)
      if (size < 2) return 0
      const newest = (head + size - 1) % MAX_SAMPLES
      const dt = (times[newest] ?? 0) - (times[head] ?? 0)
      if (dt <= 0) return 0
      return ((positions[newest] ?? 0) - (positions[head] ?? 0)) / dt
    },

    reset() {
      head = 0
      size = 0
    },

    size() {
      return size
    },
  }
}
