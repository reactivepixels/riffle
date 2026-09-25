/**
 * Invented trail waypoints for the clamp demo. Each gets a two-stop CSS
 * gradient instead of a photo, since there is no licensed imagery to show.
 */
export interface Waypoint {
  name: string
  elevation: string
  from: string
  to: string
}

export const waypoints: readonly Waypoint[] = [
  { name: 'Cedar Gate', elevation: '410 m', from: '#1a2e1c', to: '#5fae5c' },
  { name: 'Long Ridge', elevation: '890 m', from: '#20242f', to: '#7b8fb8' },
  { name: 'Quarry Bend', elevation: '650 m', from: '#332415', to: '#c98a4a' },
  { name: 'Foxglove Meadow', elevation: '520 m', from: '#2a1730', to: '#b569c9' },
  { name: 'Windrow Pass', elevation: '1120 m', from: '#122530', to: '#59b3c9' },
]

/** A waypoint's background: a single diagonal two-stop gradient. */
export function waypointGradient(waypoint: Waypoint): string {
  return `linear-gradient(155deg, ${waypoint.from}, ${waypoint.to})`
}
