/**
 * Invented films for the poster stack. Each gets a two-stop CSS gradient
 * instead of artwork: there is no licensed poster art to show, and a
 * gradient reads as a poster silhouette without pretending to be a photo.
 *
 * Ported verbatim from examples/react-movie-stack/src/films.ts, so the
 * vanilla poster stack matches the React one card for card.
 */
export interface Film {
  title: string
  year: number
  from: string
  to: string
}

export const films: readonly Film[] = [
  { title: 'Neon Harbor', year: 1998, from: '#052b3a', to: '#ff3d7f' },
  { title: 'The Quiet Orbit', year: 2016, from: '#10102a', to: '#7c8fd6' },
  { title: 'Salt and Static', year: 2005, from: '#35424f', to: '#e8e2d6' },
  { title: 'Paper Moons', year: 1989, from: '#caa07a', to: '#f3e6d3' },
  { title: 'Last Train to Vela', year: 2011, from: '#1c1830', to: '#e8813f' },
  { title: 'Glasshouse', year: 2023, from: '#dff4ec', to: '#79b7c9' },
  { title: 'Northbound', year: 1977, from: '#101823', to: '#9fb9c9' },
  { title: 'Kite Season', year: 2019, from: '#63b3e0', to: '#f6c453' },
]

/** A poster's background: a single diagonal two-stop gradient. */
export function posterGradient(film: Film): string {
  return `linear-gradient(160deg, ${film.from}, ${film.to})`
}

/** The film at `index`. Riffle only ever reports an index within range. */
export function filmAt(index: number): Film {
  const film = films[index]
  if (!film) throw new Error(`no film at index ${index}`)
  return film
}
