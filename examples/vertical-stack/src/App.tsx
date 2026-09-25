import { useEffect, useRef, useState } from 'react'
import { fan } from '@rpxl/riffle'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/react'
import { trackAt, trackGradient, tracks } from './tracks'

const ROW_WIDTH_DESKTOP = 300
const ROW_WIDTH_MOBILE = 220
// The row's own height is a list-row height, not a poster aspect ratio: the
// stack here fans vertically (axis="y" below), so a narrow viewport only
// ever needs the row's WIDTH to shrink, matching app.css's own
// `@media (max-width: 520px)` breakpoint.
const ROW_HEIGHT = 92
const MOBILE_QUERY = '(max-width: 520px)'

function useRowWidth(): number {
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
  return mobile ? ROW_WIDTH_MOBILE : ROW_WIDTH_DESKTOP
}

// Module scope, so the engine sees the same function on every render.
const getLabel = (index: number) => trackAt(index).title

// Module scope: an option object identity, like a function, must stay
// stable across renders or the adapter treats it as a changed option.
// #region vertical
const layout = fan({ offset: -32 })
// #endregion vertical

export function App() {
  const ROW_WIDTH = useRowWidth()
  const riffleRef = useRef<RiffleInstance | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const active = trackAt(activeIndex)

  return (
    <main className="page">
      <div className="stage">
        {/* #region vertical */}
        <Riffle
          aria-label="Tracks"
          axis="y"
          bounds="clamp"
          layout={layout}
          cards={tracks}
          getKey={(track) => track.title}
          getLabel={getLabel}
          cardWidth={ROW_WIDTH}
          cardHeight={ROW_HEIGHT}
          riffleRef={riffleRef}
          onChange={(event) => setActiveIndex(event.index)}
          className="stack"
          cardClassName="row"
        >
          {(track) => (
            <div
              className="row-face"
              style={{
                width: ROW_WIDTH,
                height: ROW_HEIGHT,
                background: trackGradient(track),
              }}
            >
              {/* Decorative: the card's aria-label (from getLabel above) already
                  names the track for assistive tech, and the title reappears
                  below the stack for sighted and AT users alike. */}
              <div className="row-text" aria-hidden="true">
                <span className="row-title">{track.title}</span>
                <span className="row-artist">{track.artist}</span>
              </div>
            </div>
          )}
        </Riffle>
        {/* #endregion vertical */}
      </div>

      <div className="meta">
        <h1 className="title">{active.title}</h1>
        <p className="artist">{active.artist}</p>
      </div>

      <p className="hint">
        Focus the stack, then press <kbd>&#8593;</kbd> or <kbd>&#8595;</kbd> to browse
      </p>

      <div className="controls">
        <button
          type="button"
          className="control"
          aria-label="Previous track"
          onClick={() => riffleRef.current?.prev()}
        >
          <span aria-hidden="true">&#8593;</span>
        </button>
        <span className="readout">
          {activeIndex + 1} / {tracks.length}
        </span>
        <button
          type="button"
          className="control"
          aria-label="Next track"
          onClick={() => riffleRef.current?.next()}
        >
          <span aria-hidden="true">&#8595;</span>
        </button>
      </div>
    </main>
  )
}
