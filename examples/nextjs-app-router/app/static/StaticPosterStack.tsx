'use client'

/**
 * The drop-in <Riffle> component, the one this whole example otherwise never
 * exercises server side (the home page uses the headless useRiffle
 * composition so useRiffleState can drive its readout). Here the readout is
 * ordinary React state instead, set from <Riffle>'s onChange, starting at 0
 * so this route's server render is "1 / 8" too.
 */
import { useEffect, useRef, useState } from 'react'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/react'
import { filmAt, films, posterGradient } from '../films'

const POSTER_WIDTH_DESKTOP = 220
const POSTER_HEIGHT_DESKTOP = 330
const POSTER_WIDTH_MOBILE = 150
const POSTER_HEIGHT_MOBILE = 225
// See PosterStack.tsx's own copy of this comment.
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

export function StaticPosterStack() {
  const riffleRef = useRef<RiffleInstance | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const active = filmAt(activeIndex)
  const { width: POSTER_WIDTH, height: POSTER_HEIGHT } = usePosterSize()

  return (
    <main className="page">
      <div className="stage">
        <Riffle
          aria-label="Films"
          cards={films}
          getKey={(film) => film.title}
          getLabel={getLabel}
          cardWidth={POSTER_WIDTH}
          cardHeight={POSTER_HEIGHT}
          riffleRef={riffleRef}
          onChange={(event) => setActiveIndex(event.index)}
          className="stack"
          cardClassName="poster"
        >
          {(film) => (
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
          )}
        </Riffle>
      </div>

      <div className="meta">
        {/* See PosterStack.tsx: same data-active-title scoping. */}
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
          onClick={() => riffleRef.current?.prev()}
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
          onClick={() => riffleRef.current?.next()}
        >
          <span aria-hidden="true">&#8250;</span>
        </button>
      </div>
    </main>
  )
}
