/**
 * Programmatic control from outside the stack: `ThumbnailRail` is a sibling
 * component, not a child of `<Riffle>`, and never touches the engine
 * directly. It drives the stack purely through the imperative handle
 * (`riffleRef.current.goTo(index)`), the same handle a completely separate
 * part of an app (a URL sync, a "now playing" panel, a test harness) would
 * use. Shown on the "Programmatic control" recipe, and rendered live there.
 *
 * Styled inline, like HeadlessStack.tsx, rather than through app.css: this
 * component is rendered directly on the docs site (which does not load this
 * app's own stylesheet) as well as on this app's own page for it.
 */
import { useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/react'
import { filmAt, films, posterGradient } from './films'

const POSTER_WIDTH = 160
const POSTER_HEIGHT = 240

// Module scope, so the engine sees the same function on every render.
const getLabel = (index: number) => filmAt(index).title

const railButtonStyle: CSSProperties = {
  minWidth: 32,
  minHeight: 32,
  borderRadius: 999,
  border: '1px solid rgb(255 255 255 / 16%)',
  background: 'rgb(255 255 255 / 6%)',
  color: '#f3efe8',
  cursor: 'pointer',
}

/**
 * A row of numbered buttons that jumps the stack straight to a card,
 * wherever it currently sits. Reads `activeIndex` only to mark the current
 * card with `aria-current`; every actual move goes through `handle.goTo`.
 *
 * Each button also carries `data-rail-index`: a stable selector this app's
 * own e2e target uses as its `advance` selector (see e2e/utils/examples.ts),
 * since this recipe has no Next button of its own to click, on purpose (see
 * this file's own top comment).
 */
// #region goto-wiring
function ThumbnailRail({
  handle,
  activeIndex,
}: {
  handle: RefObject<RiffleInstance | null>
  activeIndex: number
}) {
  return (
    <div
      role="group"
      aria-label="Jump to film"
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}
    >
      {films.map((film, index) => (
        <button
          key={film.title}
          type="button"
          data-rail-index={index}
          style={{
            ...railButtonStyle,
            fontWeight: index === activeIndex ? 700 : 400,
            outline: index === activeIndex ? '2px solid currentColor' : undefined,
          }}
          aria-current={index === activeIndex ? 'true' : undefined}
          aria-label={`Jump to ${film.title}`}
          onClick={() => handle.current?.goTo(index)}
        >
          {index + 1}
        </button>
      ))}
    </div>
  )
}
// #endregion goto-wiring

export default function ExternalControlStack() {
  const riffleRef = useRef<RiffleInstance | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <Riffle
        aria-label="Films"
        cards={films}
        getKey={(film) => film.title}
        getLabel={getLabel}
        cardWidth={POSTER_WIDTH}
        cardHeight={POSTER_HEIGHT}
        riffleRef={riffleRef}
        onChange={(event) => setActiveIndex(event.index)}
      >
        {(film) => (
          <div
            style={{
              width: POSTER_WIDTH,
              height: POSTER_HEIGHT,
              borderRadius: 16,
              background: posterGradient(film),
            }}
          />
        )}
      </Riffle>
      <ThumbnailRail handle={riffleRef} activeIndex={activeIndex} />
    </div>
  )
}
