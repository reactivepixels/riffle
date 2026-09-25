'use client'

/**
 * The headless composition: useRiffle's prop getters on our own markup, and
 * useRiffleState for the one slice of state this component renders. This is
 * the shape that server renders correctly, since useRiffle applies its root
 * and card styles (display: grid, grid-area: 1 / 1) unconditionally rather
 * than from an effect, and useRiffleState reads the same snapshot on the
 * server as on the client, so the "1 / 8" readout below is already correct
 * in the HTML this page's server renders, before any hydration runs.
 */
import { useEffect, useState } from 'react'
import { useRiffle, useRiffleState } from '@rpxl/riffle/react'
import { filmAt, films, posterGradient } from './films'

const POSTER_WIDTH_DESKTOP = 220
const POSTER_HEIGHT_DESKTOP = 330
const POSTER_WIDTH_MOBILE = 150
const POSTER_HEIGHT_MOBILE = 225
// Matches app.css's own `@media (max-width: 520px)` breakpoint. The
// card's own box is set inline (the engine measures cardWidth/cardHeight
// as plain numbers), so shrinking it at narrow widths needs this same
// breakpoint read in JS. `window` does not exist during SSR, so the
// server always sends the desktop size; a narrow-viewport client corrects
// it once in an effect, after hydration.
const MOBILE_QUERY = '(max-width: 520px)'

function usePosterSize(): { width: number; height: number } {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const update = () => setMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])
  return mobile
    ? { width: POSTER_WIDTH_MOBILE, height: POSTER_HEIGHT_MOBILE }
    : { width: POSTER_WIDTH_DESKTOP, height: POSTER_HEIGHT_DESKTOP }
}

// Module scope, so the engine sees the same function on every render.
const getLabel = (index: number) => filmAt(index).title

export function PosterStack() {
  const { width: POSTER_WIDTH, height: POSTER_HEIGHT } = usePosterSize()
  const riffle = useRiffle({
    count: films.length,
    cardWidth: POSTER_WIDTH,
    cardHeight: POSTER_HEIGHT,
    getLabel,
  })
  // Re-renders when the active card changes, never on a drag frame.
  const activeIndex = useRiffleState(riffle, (state) => state.activeIndex)
  const active = filmAt(activeIndex)

  return (
    <main className="page">
      <div className="stage">
        <div {...riffle.getRootProps({ className: 'stack', 'aria-label': 'Films' })}>
          {films.map((film, index) => (
            <div key={film.title} {...riffle.getCardProps(index, { className: 'poster' })}>
              <div
                className="poster-face"
                style={{
                  width: POSTER_WIDTH,
                  height: POSTER_HEIGHT,
                  background: posterGradient(film),
                }}
              >
                <div className="poster-scrim" />
                {/* Decorative: the card's aria-label (from getLabel above)
                    already names the film for assistive tech, and the title
                    reappears below the stack for sighted and AT users alike. */}
                <div className="poster-text" aria-hidden="true">
                  <span className="poster-title">{film.title}</span>
                  <span className="poster-year">{film.year}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="meta">
        {/* data-active-title lets check:ssr scope its title assertion to the
            element that actually names the active film, rather than to the
            whole page: every card's own title renders unconditionally
            further up, so a plain page-wide substring search cannot tell an
            active film rendered correctly from one hardcoded wrong. */}
        <h1 className="title" data-active-title>
          {active.title}
        </h1>
        <p className="year">{active.year}</p>
      </div>

      <div className="controls">
        <button
          type="button"
          className="control"
          aria-label="Previous film"
          onClick={() => riffle.prev()}
        >
          <span aria-hidden="true">&#8249;</span>
        </button>
        <span className="readout">
          {activeIndex + 1} / {films.length}
        </span>
        <button
          type="button"
          className="control"
          aria-label="Next film"
          onClick={() => riffle.next()}
        >
          <span aria-hidden="true">&#8250;</span>
        </button>
      </div>
    </main>
  )
}
