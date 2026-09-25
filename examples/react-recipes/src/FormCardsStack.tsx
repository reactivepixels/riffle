/**
 * Forms inside cards: every card holds a real text input, not a decorative
 * one. This demonstrates three things:
 *
 * - An editable target keeps its own keys. Typing in the focused input,
 *   including arrow keys and Home/End, moves the caret instead of the
 *   stack. The engine already does this, no configuration needed.
 * - A background card's input is genuinely unreachable: every card but the
 *   active one is inert, so Tab, a screen reader's virtual cursor, and a
 *   direct `.focus()` call can none of them reach a note field that is not
 *   currently on top. The engine already does this too.
 * - Where focus lands when the active card changes while a field inside it
 *   is focused: on the new card's own root, not inside a field, the same
 *   place focus would land for any other card content. The `onChange`
 *   handler below is what a form author writes if they want focus inside
 *   the new card's first field instead, checking that focus is still
 *   somewhere in the stack (not off on an unrelated part of the page)
 *   before redirecting it deeper.
 *
 * Shown on the "Forms inside cards" recipe, and rendered live there.
 * Styled inline, like HeadlessStack.tsx, rather than through app.css: this
 * component is rendered directly on the docs site (which does not load this
 * app's own stylesheet) as well as on this app's own page for it. The card
 * shrinks at phone widths (matched by this app's own left-fan reservation,
 * see app.css) so the fanned cards behind the front one stay fully on
 * screen at 375px, the same reasoning react-movie-stack's own App.tsx gives
 * for its usePosterSize hook.
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/react'
import { filmAt, films } from './films'

const CARD_WIDTH_DESKTOP = 240
const CARD_HEIGHT_DESKTOP = 320
const CARD_WIDTH_MOBILE = 150
const CARD_HEIGHT_MOBILE = 200
// Matches this app's own app.css `@media (max-width: 520px)` breakpoint. The
// card's own box is set inline (the engine measures cardWidth/cardHeight as
// plain numbers, and an inline style is what sizes the card face), so
// shrinking it at narrow widths needs this same breakpoint read in JS, not
// CSS alone: cardWidth/cardHeight switching between two numbers updates
// live without losing position (see the React adapter reference, "Options
// between renders").
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
const getLabel = (index: number) => filmAt(index).title

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

export default function FormCardsStack() {
  const { width: CARD_WIDTH, height: CARD_HEIGHT } = useCardSize()
  const riffleRef = useRef<RiffleInstance | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const idBase = useId()
  // One entry per card's own note field, keyed the same way `cards` is
  // indexed: read from `onChange` below to move focus into the field
  // itself, one step further than where the engine's own focus-following
  // already lands (the new active card's root element).
  const noteFieldRefs = useRef<Record<number, HTMLInputElement | null>>({})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <Riffle
        aria-label="Films"
        cards={films}
        getKey={(film) => film.title}
        getLabel={getLabel}
        cardWidth={CARD_WIDTH}
        cardHeight={CARD_HEIGHT}
        riffleRef={riffleRef}
        // #region focus-redirect
        onChange={(event) => {
          setActiveIndex(event.index)
          // Only redirect focus into the new field when focus was already
          // somewhere inside the stack: that is exactly the condition the
          // engine's own focus-following uses to decide whether to move
          // focus onto the new active card's root at all. Skipping this
          // check would steal focus into a card field even when nothing on
          // the page had focus in the stack, for example while a visitor
          // was reading unrelated page text and something else called
          // goTo().
          const wasFocusInStack =
            document.activeElement?.closest('[aria-roledescription="carousel"]') != null
          if (!wasFocusInStack) return
          // The engine updates the new active card's accessibility state,
          // including its own focus-follow onto that card's root, before it
          // fires this handler, so this call is the last one to move focus,
          // not the first, and it is the one that sticks.
          noteFieldRefs.current[event.index]?.focus()
        }}
        // #endregion focus-redirect
      >
        {(film, index) => {
          // #region card-fields
          const inputId = `${idBase}-note-${index}`
          return (
            <div
              style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                borderRadius: 16,
                boxSizing: 'border-box',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                background: '#1c1c26',
                color: '#f3efe8',
                border: '1px solid rgb(255 255 255 / 8%)',
                boxShadow: '0 24px 48px -16px rgb(0 0 0 / 60%), 0 2px 6px rgb(0 0 0 / 35%)',
              }}
            >
              <strong>{film.title}</strong>
              <label htmlFor={inputId} style={{ fontSize: '0.8rem' }}>
                Your note
              </label>
              <input
                id={inputId}
                ref={(el) => {
                  noteFieldRefs.current[index] = el
                }}
                type="text"
                placeholder={`What did you think of ${film.title}?`}
                style={{ padding: 8, borderRadius: 8, border: '1px solid rgb(255 255 255 / 24%)' }}
              />
            </div>
          )
          // #endregion card-fields
        }}
      </Riffle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          style={controlButtonStyle}
          aria-label="Previous film"
          onClick={() => riffleRef.current?.prev()}
        >
          <span aria-hidden="true">&#8249;</span>
        </button>
        <span
          data-testid="readout"
          style={{ minWidth: '4.5rem', textAlign: 'center', color: '#9c988e' }}
        >
          {activeIndex + 1} / {films.length}
        </span>
        <button
          type="button"
          style={controlButtonStyle}
          aria-label="Next film"
          data-testid="next-button"
          onClick={() => riffleRef.current?.next()}
        >
          <span aria-hidden="true">&#8250;</span>
        </button>
      </div>
    </div>
  )
}
