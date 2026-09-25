/**
 * The landing page's hero stack: the exact same five cards under every
 * framework tab (Vanilla, React, Vue), so switching tabs proves the engine
 * is identical underneath rather than showing three different demos. CSS
 * gradients with invented titles, no real photography, the same shape as
 * every other example's card data (see examples/react-movie-stack/src/films.ts).
 */
export interface HeroCard {
  title: string
  gradient: string
}

export const heroCards: readonly HeroCard[] = [
  { title: 'Midnight Drift', gradient: 'linear-gradient(160deg, #1c1b3a 0%, #4d3bb0 100%)' },
  { title: 'Paper Lantern', gradient: 'linear-gradient(160deg, #b3401f 0%, #f2994a 100%)' },
  { title: 'Glass Orchard', gradient: 'linear-gradient(160deg, #0f5e4c 0%, #4cd9a0 100%)' },
  { title: 'Low Tide', gradient: 'linear-gradient(160deg, #073b5c 0%, #2bb7c9 100%)' },
  { title: 'Ember Field', gradient: 'linear-gradient(160deg, #661a3c 0%, #e64980 100%)' },
]
