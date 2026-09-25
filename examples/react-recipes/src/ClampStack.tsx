/**
 * `bounds: 'clamp'` with genuinely disabled ends: mirrors
 * examples/vue-clamp-controls' App.vue, built on the headless `useRiffle`
 * hook (prop getters over your own markup, like HeadlessStack.tsx) rather
 * than the `<Riffle>` drop-in, because `useRiffleState` needs the handle
 * `useRiffle` returns (it carries `subscribe`/`getSnapshot`; the drop-in's
 * `riffleRef` handle does not).
 *
 * Prev and Next bind their `disabled` attribute to `state.canPrev` and
 * `state.canNext`, read through `useRiffleState`, not by tracking index
 * against `waypoints.length - 1` by hand: a click, a tap or an Enter key on
 * a disabled button does nothing, and it drops out of the tab order's
 * activation, which a CSS-only affordance never gives you.
 *
 * The same invented trail waypoints as vue-clamp-controls' App.vue and
 * vanilla-recipes' clamp.ts (./waypoints.ts, ported verbatim), not this
 * app's own `films.ts`: the three frameworks' versions of this recipe show
 * the same data, not just the same mechanics.
 *
 * Styled inline, like HeadlessStack.tsx: self-contained, no dependency on
 * this app's own stylesheet.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import { useRiffle, useRiffleState } from '@rpxl/riffle/react'
import { waypointGradient, waypoints } from './waypoints'

const CARD_WIDTH_DESKTOP = 220
const CARD_HEIGHT_DESKTOP = 300
const CARD_WIDTH_MOBILE = 150
const CARD_HEIGHT_MOBILE = 204
// Matches this app's own app.css `@media (max-width: 520px)` breakpoint. The
// card's own box is set inline (the engine measures cardWidth/cardHeight as
// plain numbers), so shrinking it at narrow widths needs this same
// breakpoint read in JS, not CSS alone.
const MOBILE_QUERY = '(max-width: 520px)'

function useCardSize(): { width: number; height: number } {
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
    ? { width: CARD_WIDTH_MOBILE, height: CARD_HEIGHT_MOBILE }
    : { width: CARD_WIDTH_DESKTOP, height: CARD_HEIGHT_DESKTOP }
}

// Module scope, so the engine sees the same function on every render.
const getLabel = (index: number) => waypoints[index]?.name ?? ''

const cardFaceStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  borderRadius: 18,
  border: '1px solid rgb(255 255 255 / 8%)',
  boxShadow: '0 24px 48px -16px rgb(0 0 0 / 60%), 0 2px 6px rgb(0 0 0 / 35%)',
}

// The same subtle sheen vue-clamp-controls' App.vue paints with its
// `.card-face::after`: React has no pseudo-element to style inline, so this
// is its own layered div instead.
const cardSheenStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  background: 'radial-gradient(circle at 28% 18%, rgb(255 255 255 / 30%), transparent 60%)',
  mixBlendMode: 'overlay',
}

const cardScrimStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  background:
    'linear-gradient(to top, rgb(0 0 0 / 88%) 0%, rgb(0 0 0 / 88%) 34%, rgb(0 0 0 / 55%) 55%, transparent 82%)',
}

const cardTextStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 2,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  padding: '1rem 0.9rem 0.9rem',
  color: '#fff',
  textShadow: '0 1px 3px rgb(0 0 0 / 45%)',
}

const cardNameStyle: CSSProperties = { fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.2 }

const cardElevationStyle: CSSProperties = {
  fontSize: '0.68rem',
  letterSpacing: '0.12em',
  opacity: 0.8,
}

const controlButtonStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  minWidth: 44,
  minHeight: 44,
  borderRadius: 999,
  border: '1px solid rgb(255 255 255 / 16%)',
  background: 'rgb(255 255 255 / 6%)',
  color: '#f3efe8',
  fontSize: '1.25rem',
  lineHeight: '1',
  cursor: 'pointer',
}

const controlButtonDisabledStyle: CSSProperties = {
  ...controlButtonStyle,
  opacity: 0.35,
  cursor: 'not-allowed',
}

export default function ClampStack() {
  const { width: CARD_WIDTH, height: CARD_HEIGHT } = useCardSize()
  // #region disabled-controls
  const handle = useRiffle({
    count: waypoints.length,
    bounds: 'clamp',
    cardWidth: CARD_WIDTH,
    cardHeight: CARD_HEIGHT,
    getLabel,
  })
  const activeIndex = useRiffleState(handle, (s) => s.activeIndex)
  const canPrev = useRiffleState(handle, (s) => s.canPrev)
  const canNext = useRiffleState(handle, (s) => s.canNext)
  // #endregion disabled-controls

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <section
        {...handle.getRootProps({ 'aria-label': 'Waypoints', style: { width: CARD_WIDTH } })}
      >
        {waypoints.map((waypoint, index) => (
          <article
            key={waypoint.name}
            {...handle.getCardProps(index, { style: { borderRadius: 18 } })}
          >
            <div
              style={{
                ...cardFaceStyle,
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                background: waypointGradient(waypoint),
              }}
            >
              <div style={cardSheenStyle} />
              <div style={cardScrimStyle} />
              {/* Decorative: the card's aria-label (from getLabel above) already
                  names the waypoint for assistive tech, and the name reappears
                  below the stack for sighted and AT users alike. */}
              <div style={cardTextStyle} aria-hidden="true">
                <span style={cardNameStyle}>{waypoint.name}</span>
                <span style={cardElevationStyle}>{waypoint.elevation}</span>
              </div>
            </div>
          </article>
        ))}
      </section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* #region disabled-controls */}
        <button
          type="button"
          style={canPrev ? controlButtonStyle : controlButtonDisabledStyle}
          aria-label="Previous waypoint"
          disabled={!canPrev}
          onClick={handle.prev}
        >
          <span aria-hidden="true">&#8249;</span>
        </button>
        <span
          data-testid="readout"
          style={{ minWidth: '8rem', textAlign: 'center', color: '#9c988e' }}
        >
          Card {activeIndex + 1} of {waypoints.length}
        </span>
        <button
          type="button"
          style={canNext ? controlButtonStyle : controlButtonDisabledStyle}
          aria-label="Next waypoint"
          data-testid="next-button"
          disabled={!canNext}
          onClick={handle.next}
        >
          <span aria-hidden="true">&#8250;</span>
        </button>
        {/* #endregion disabled-controls */}
      </div>
    </div>
  )
}
