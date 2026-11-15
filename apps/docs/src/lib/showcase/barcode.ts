/**
 * Build-time art for the showcase's boarding passes: a row of bars that
 * reads as a printed barcode, derived from the pass's own reference string
 * so every pass gets a different, stable pattern. Decorative only. It
 * encodes nothing and no scanner is meant to read it.
 */
export interface Bar {
  x: number
  width: number
}

/** Bars laid out across `width` units, with one unit of quiet zone each side. */
export function barcodeBars(seed: string, width = 120): Bar[] {
  let state = 2166136261
  for (const char of seed) {
    state ^= char.charCodeAt(0)
    state = Math.imul(state, 16777619) >>> 0
  }
  const random = () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 4294967296
  }

  const bars: Bar[] = []
  let x = 1
  while (x < width - 2) {
    const bar = 0.5 + Math.floor(random() * 4) * 0.5
    if (x + bar > width - 1) break
    bars.push({ x, width: bar })
    x += bar + 0.5 + Math.floor(random() * 3) * 0.5
  }
  return bars
}
