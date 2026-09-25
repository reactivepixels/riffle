/**
 * The React track overview page's own "hero" demo (`<Demo name="hero">` in
 * src/tracks/index.mdx; see src/lib/track-demos.ts). Same card data
 * (../lib/hero-cards.ts) and the same visible box size as VanillaRiffle.astro
 * (the landing page's own hero demo) and HeroStackVue.ts (hero-stack.css's
 * `.riffle-hero__stack`), so all three read as the same demo regardless of
 * which track (or the landing page) a visitor is on.
 *
 * `.riffle-hero__stack` is sized by CSS alone (`min(300px, 80vw)` /
 * `min(400px, 55vh)`), the same box VanillaRiffle.astro's plain script reads
 * via `clientWidth`/`clientHeight`. `<Riffle>` needs an actual pixel number
 * for `cardWidth`/`cardHeight`, not a CSS size, so this component measures
 * the same box once, on mount, before rendering the engine into it (the
 * same "measure a sized box, then mount" order Vanilla's script achieves for
 * free by running after the box already has layout).
 *
 * `role="group"` / `aria-roledescription="carousel"` on `<Riffle>` below:
 * see apps/docs/src/components/ReactStack.tsx's doc comment for why a
 * `client:visible` island supplies these itself rather than leaving them to
 * the core engine's own post-mount a11y setup.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/react'
import { heroCards, type HeroCard } from '../lib/hero-cards'
import './hero-stack.css'

export default function HeroStackReact() {
  const measureRef = useRef<HTMLDivElement | null>(null)
  const riffleRef = useRef<RiffleInstance | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useLayoutEffect(() => {
    const el = measureRef.current
    if (el) setSize({ width: el.clientWidth, height: el.clientHeight })
  }, [])

  return (
    <div className="riffle-hero not-content">
      <div ref={measureRef} className="riffle-hero__stack">
        {size && (
          <Riffle
            aria-label="Riffle live demo"
            role="group"
            aria-roledescription="carousel"
            cards={heroCards}
            getKey={(card) => card.title}
            cardWidth={size.width}
            cardHeight={size.height}
            riffleRef={riffleRef}
            cardClassName="riffle-hero__adapter-card"
          >
            {(card: HeroCard) => (
              <div
                className="riffle-hero__card-face"
                style={{ width: size.width, height: size.height, background: card.gradient }}
              >
                {card.title}
              </div>
            )}
          </Riffle>
        )}
      </div>
      <div className="riffle-hero__controls">
        <button type="button" aria-label="Previous card" onClick={() => riffleRef.current?.prev()}>
          &larr; Prev
        </button>
        <button type="button" aria-label="Next card" onClick={() => riffleRef.current?.next()}>
          Next &rarr;
        </button>
      </div>
      <p className="riffle-hero__hint">Drag a card, or use the buttons.</p>
    </div>
  )
}
