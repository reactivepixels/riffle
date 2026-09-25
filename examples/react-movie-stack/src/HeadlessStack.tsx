/**
 * The same poster stack without the <Riffle> drop-in: useRiffle's prop
 * getters on your own markup, and useRiffleState for the one slice of state
 * this component renders. Shown and rendered on the docs site's React page.
 */
import { useRiffle, useRiffleState } from '@rpxl/riffle/react'
import { filmAt, films, posterGradient } from './films'

const WIDTH = 160
const HEIGHT = 240

// Module scope, so the engine sees the same function on every render.
const getLabel = (index: number) => filmAt(index).title

export function HeadlessStack() {
  // #region essentials
  const riffle = useRiffle({ count: films.length, cardWidth: WIDTH, cardHeight: HEIGHT, getLabel })
  // Re-renders when the active card changes, never on a drag frame.
  const activeIndex = useRiffleState(riffle, (state) => state.activeIndex)
  // #endregion essentials

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {/* #region essentials */}
      <section {...riffle.getRootProps({ 'aria-label': 'Films', style: { width: WIDTH } })}>
        {films.map((film, index) => (
          <article
            key={film.title}
            {...riffle.getCardProps(index, {
              style: {
                width: WIDTH,
                height: HEIGHT,
                borderRadius: 16,
                background: posterGradient(film),
              },
            })}
          />
        ))}
      </section>
      {/* #endregion essentials */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" aria-label="Previous film" onClick={() => riffle.prev()}>
          <span aria-hidden="true">&#8249;</span>
        </button>
        <span>{filmAt(activeIndex).title}</span>
        <button type="button" aria-label="Next film" onClick={() => riffle.next()}>
          <span aria-hidden="true">&#8250;</span>
        </button>
      </div>
    </div>
  )
}
