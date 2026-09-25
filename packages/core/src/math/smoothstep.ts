/** Hermite interpolation between two edges, clamped to 0..1. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  let t = (x - edge0) / (edge1 - edge0)
  if (t < 0) t = 0
  else if (t > 1) t = 1
  return t * t * (3 - 2 * t)
}
