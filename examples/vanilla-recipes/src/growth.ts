/** The state {@link shouldGrow} decides from. */
export interface GrowthState {
  activeIndex: number
  count: number
  isLoading: boolean
}

/**
 * True when the feed should fetch and append another page of cards.
 *
 * The rule is: the active card is within `threshold` cards of the end
 * (`count - 1`), and nothing is already loading. `isLoading` is the guard
 * against firing repeatedly while a page is in flight. A real fetch takes
 * time (this example simulates 300ms of latency), and `activeIndex` stays
 * inside the threshold window for that whole window: every check that
 * happens during it, including ones triggered by state changes unrelated to
 * navigation, re-evaluates this function. Without the `isLoading` check, a
 * single approach to the end would request a new page on every one of those
 * checks instead of exactly once. The caller is expected to hold
 * `isLoading` true from the moment it starts a fetch until that fetch's
 * cards are appended.
 *
 * Pure and framework free: it decides from plain numbers and never touches
 * the DOM or the engine, which is what makes it testable on its own
 * (growth.test.ts).
 */
export function shouldGrow(state: GrowthState, threshold: number): boolean {
  if (state.isLoading) return false
  if (state.count <= 0) return false
  return state.activeIndex >= state.count - 1 - threshold
}
