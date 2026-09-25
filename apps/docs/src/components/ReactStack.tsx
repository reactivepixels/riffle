/**
 * The React half of the landing page's "One engine, three frameworks"
 * section (see index.mdx). A real @rpxl/riffle/react stack driving the
 * same film data the React movie-stack example ships, so the docs page and
 * the example stay one source of truth instead of two that can drift apart.
 *
 * `role="group"` and `aria-roledescription="carousel"` are supplied here
 * even though the core engine sets them itself once it mounts
 * (packages/core/src/a11y.ts): this island only hydrates with
 * `client:visible` (cheap, but not instant), and until it does, the SSR
 * markup is all a screen reader or an automated audit (Lighthouse
 * included) ever sees. Passing them as ordinary props matches exactly what
 * the engine would set, so there is no pre-hydration accessibility gap and
 * nothing changes once it does mount.
 */
import { useRef, useState } from 'react'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/react'
import { filmAt, films, posterGradient } from '../../../../examples/react-movie-stack/src/films'
import './demo-stack.css'

const POSTER_WIDTH = 160
const POSTER_HEIGHT = 240

// Module scope, so the engine sees the same function on every render.
const getLabel = (index: number) => filmAt(index).title

export default function ReactStack() {
  const riffleRef = useRef<RiffleInstance | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const active = filmAt(activeIndex)

  return (
    <div className="demo-stack">
      <p className="demo-stack__label">React</p>
      <Riffle
        aria-label="Films"
        role="group"
        aria-roledescription="carousel"
        cards={films}
        getKey={(film) => film.title}
        getLabel={getLabel}
        cardWidth={POSTER_WIDTH}
        cardHeight={POSTER_HEIGHT}
        riffleRef={riffleRef}
        onChange={(event) => setActiveIndex(event.index)}
        style={{ width: POSTER_WIDTH, height: POSTER_HEIGHT }}
      >
        {(film) => (
          <div className="demo-stack__poster" style={{ background: posterGradient(film) }} />
        )}
      </Riffle>
      <div className="demo-stack__controls">
        <button type="button" aria-label="Previous film" onClick={() => riffleRef.current?.prev()}>
          <span aria-hidden="true">&#8249;</span>
        </button>
        <span className="demo-stack__title">{active.title}</span>
        <button type="button" aria-label="Next film" onClick={() => riffleRef.current?.next()}>
          <span aria-hidden="true">&#8250;</span>
        </button>
      </div>
    </div>
  )
}
