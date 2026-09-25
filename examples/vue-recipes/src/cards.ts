/**
 * Generated feed cards for the infinite-feed recipe. Each carries a stable
 * numeric `id` assigned once at creation, independent of its position in
 * the array, so `getKey` can key Vue's reconciliation by identity rather
 * than by an index that shifts as the feed grows. A copy of
 * react-infinite-feed's own cards.ts, carried locally rather than reached
 * across examples for data, the same reasoning films.ts and tracks.ts give
 * in this same app.
 */
export interface FeedCard {
  id: number
  hue: number
}

/**
 * A page of `count` cards, with ids starting at `startId`. The hue is a
 * simple function of the id, not random, so the gradient a card shows never
 * changes once it exists.
 */
export function generateCards(startId: number, count: number): FeedCard[] {
  return Array.from({ length: count }, (_, i) => {
    const id = startId + i
    return { id, hue: (id * 47) % 360 }
  })
}

/** A card's background: a two-stop hue-rotated gradient. */
export function cardGradient(card: FeedCard): string {
  const second = (card.hue + 42) % 360
  return `linear-gradient(155deg, hsl(${card.hue} 65% 30%), hsl(${second} 65% 52%))`
}
