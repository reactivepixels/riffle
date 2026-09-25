/**
 * Invented tracks for the vertical-axis recipe. Each gets a two-stop CSS
 * gradient instead of cover art: there is no licensed artwork to show, and
 * a gradient reads as album art without pretending to be a photo. A copy of
 * vertical-stack's own tracks.ts: that example keeps its own for its main
 * demo, so this app carries its own rather than reaching across examples
 * for data.
 */
export interface Track {
  title: string
  artist: string
  from: string
  to: string
}

export const tracks: readonly Track[] = [
  { title: 'Low Tide Radio', artist: 'Coastal Static', from: '#1c2b3a', to: '#4fb0ae' },
  { title: 'Eight Minute Mile', artist: 'The Cardinals', from: '#2a1636', to: '#d1497a' },
  { title: 'Amber Room', artist: 'Vela Sun', from: '#3a2a12', to: '#f2b545' },
  { title: 'Paper Weather', artist: 'Quiet North', from: '#10222f', to: '#9fd6e0' },
  { title: 'Second Hand Smoke', artist: 'Marlowe & Vine', from: '#2c1e12', to: '#c98a5a' },
  { title: 'Concrete Orchard', artist: 'Static Field', from: '#1a1a24', to: '#7c7ff2' },
]

/** A track's background: a single diagonal two-stop gradient. */
export function trackGradient(track: Track): string {
  return `linear-gradient(145deg, ${track.from}, ${track.to})`
}

/** The track at `index`. Riffle only ever reports an index within range. */
export function trackAt(index: number): Track {
  const track = tracks[index]
  if (!track) throw new Error(`no track at index ${index}`)
  return track
}
