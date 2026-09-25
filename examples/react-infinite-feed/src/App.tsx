import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/react'
import { cardGradient, generateCards, type FeedCard } from './cards'
import { shouldGrow } from './growth'

const PAGE_SIZE = 8
const GROWTH_THRESHOLD = 2
const LATENCY_MS = 300
const CARD_WIDTH_DESKTOP = 240
const CARD_HEIGHT_DESKTOP = 320
const CARD_WIDTH_MOBILE = 150
const CARD_HEIGHT_MOBILE = 200
// Matches app.css's own `@media (max-width: 520px)` breakpoint. The card's
// own box is set inline (the engine measures cardWidth/cardHeight as plain
// numbers, and an inline style is what sizes .feed-card-face), so
// shrinking it at narrow widths needs this same breakpoint read in JS, not
// CSS alone.
const MOBILE_QUERY = '(max-width: 520px)'

function useCardSize(): { width: number; height: number; mobile: boolean } {
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
    ? { width: CARD_WIDTH_MOBILE, height: CARD_HEIGHT_MOBILE, mobile: true }
    : { width: CARD_WIDTH_DESKTOP, height: CARD_HEIGHT_DESKTOP, mobile: false }
}

// Module scope, so the engine sees the same function on every render.
const getKey = (card: FeedCard) => card.id

// Styled inline, like react-recipes' ClampStack.tsx and FormCardsStack.tsx:
// self-contained, no dependency on this app's own stylesheet (this
// component is rendered directly on the docs site too, which does not load
// it). app.css keeps only the page-level `html`/`body` reset used by this
// app's own index.html.
function stageStyle(mobile: boolean): CSSProperties {
  return { padding: mobile ? '1rem 1rem 1rem 5.5rem' : '1.5rem 1.5rem 1.5rem 6.5rem' }
}

const feedCardFaceStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'flex-end',
  overflow: 'hidden',
  borderRadius: 18,
  border: '1px solid rgb(255 255 255 / 8%)',
  boxShadow: '0 24px 48px -16px rgb(0 0 0 / 60%), 0 2px 6px rgb(0 0 0 / 35%)',
}

const feedCardIdStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  margin: '0.9rem',
  padding: '0.2rem 0.55rem',
  borderRadius: 999,
  background: 'rgb(0 0 0 / 35%)',
  color: '#fff',
  fontSize: '0.72rem',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '0.04em',
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

export function App() {
  const { width: CARD_WIDTH, height: CARD_HEIGHT, mobile } = useCardSize()
  const riffleRef = useRef<RiffleInstance | null>(null)
  const [cards, setCards] = useState<readonly FeedCard[]>(() => generateCards(0, PAGE_SIZE))
  const [activeIndex, setActiveIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  // The next id to hand out. A ref, not state: it is bookkeeping for the
  // fetch, not something the feed renders.
  const nextId = useRef(PAGE_SIZE)
  // Mirrors `isLoading`, read by shouldGrow. A ref rather than the state
  // value itself, and deliberately left out of the effect's dependency
  // array below: putting `isLoading` in that array would make the effect's
  // own setIsLoading(true) re-run the effect (a fresh render happens
  // between the setTimeout call and the next paint), whose cleanup would
  // then cancel the timer this same effect just scheduled, so growth would
  // never actually land.
  const isLoadingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // #region growth-wiring
  useEffect(() => {
    if (
      !shouldGrow(
        { activeIndex, count: cards.length, isLoading: isLoadingRef.current },
        GROWTH_THRESHOLD,
      )
    ) {
      return
    }
    isLoadingRef.current = true
    setIsLoading(true)
    timerRef.current = setTimeout(() => {
      setCards((prev) => [...prev, ...generateCards(nextId.current, PAGE_SIZE)])
      nextId.current += PAGE_SIZE
      isLoadingRef.current = false
      timerRef.current = null
      setIsLoading(false)
    }, LATENCY_MS)
    // No cleanup here: this effect reruns on every activeIndex or
    // cards.length change, including ones that happen while a page is
    // already loading, and isLoadingRef guards those reruns into no-ops.
    // Cancelling the pending timer on every rerun would cancel a fetch the
    // user is still approaching the end during, not just a stale one.
  }, [activeIndex, cards.length])
  // #endregion growth-wiring

  // Unmount only: a fetch in flight when the page navigates away is
  // cancelled instead of calling setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        padding: '3rem 1.5rem',
      }}
    >
      <div style={stageStyle(mobile)}>
        <Riffle
          aria-label="Feed"
          bounds="clamp"
          cards={cards}
          getKey={getKey}
          cardWidth={CARD_WIDTH}
          cardHeight={CARD_HEIGHT}
          riffleRef={riffleRef}
          onChange={(event) => setActiveIndex(event.index)}
        >
          {(card) => (
            <div
              style={{
                ...feedCardFaceStyle,
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                background: cardGradient(card),
              }}
            >
              <span style={feedCardIdStyle} aria-hidden="true">
                #{card.id + 1}
              </span>
            </div>
          )}
        </Riffle>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <button
          type="button"
          style={controlButtonStyle}
          aria-label="Previous card"
          onClick={() => riffleRef.current?.prev()}
        >
          <span aria-hidden="true">&#8249;</span>
        </button>
        <p
          style={{ margin: 0, minWidth: '8rem', textAlign: 'center', color: '#9c988e' }}
          data-testid="readout"
        >
          Card {activeIndex + 1} of {cards.length}
        </p>
        <button
          type="button"
          style={controlButtonStyle}
          aria-label="Next card"
          onClick={() => riffleRef.current?.next()}
        >
          <span aria-hidden="true">&#8250;</span>
        </button>
      </div>

      <p
        style={{
          margin: 0,
          minHeight: '1.2em',
          color: '#e8896a',
          fontSize: '0.78rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
        aria-live="polite"
        data-testid="loading"
      >
        {isLoading ? 'Loading more' : ''}
      </p>
    </main>
  )
}
