import { createPose, createRiffle, type LayoutGeometry } from '@rpxl/riffle'
import { cards, swatchGradient } from './cards'
import { spread } from './spread-layout'
import './app.css'

// At phone widths, the card shrinks so the arc measured below (which
// scales with CARD_WIDTH/CARD_HEIGHT) fits without horizontal scroll. Read
// once at load, matching this file's own existing "compute #stack's size
// once" shape (nothing else here reacts to a resize after load either).
const MOBILE_QUERY = '(max-width: 520px)'
const isMobile = window.matchMedia(MOBILE_QUERY).matches
const CARD_WIDTH = isMobile ? 130 : 200
const CARD_HEIGHT = isMobile ? 182 : 280
const MAX_VISIBLE = 5
// Breathing room beyond the computed arc reach, so a card's box-shadow blur
// (app.css's .card box-shadow spreads a few pixels past the border box)
// never touches the stage's edge.
const ARC_MARGIN = 16

const stackEl = document.getElementById('stack')
const prevButton = document.getElementById('prev')
const nextButton = document.getElementById('next')
const readoutEl = document.getElementById('readout')
if (!stackEl || !prevButton || !nextButton || !readoutEl) {
  throw new Error('missing a required element')
}
// Reassigned so a closure below (updateReadout) captures a binding TypeScript
// still tracks as non-null: control flow narrowing does not survive into a
// function body defined after the guard.
const stack = stackEl
const readout = readoutEl

// One layout instance, used both to drive the real engine below and to
// measure how far its own arc reaches, so the two can never drift apart:
// change angleStep or scaleStep in spread-layout.ts and the reserved space
// this computes moves with it instead of needing a hand-tuned constant here.
// #region wiring
const layout = spread()
// #endregion wiring

/**
 * How far past the front card's own CARD_WIDTH x CARD_HEIGHT box the arc
 * paints, to the right and down. Runs the same `pose()` the engine calls
 * every frame, for every depth the opacity fade (in spread-layout.ts)
 * still keeps above zero, and turns each resulting translate, rotation and
 * scale into that card's axis-aligned bounding box: a rotated rectangle's
 * bounding box is wider and taller than the rectangle itself, by
 * `halfWidth * |cos| + halfHeight * |sin|` and the same with sin and cos
 * swapped, which is why this cannot just read `pose.main` and `pose.cross`
 * on their own once `angleStep` makes the rotation non-trivial.
 */
function measureArcOverflow(geometry: LayoutGeometry): { right: number; bottom: number } {
  const pose = createPose()
  let right = 0
  let bottom = 0
  for (let depth = 1; depth < geometry.maxVisible; depth++) {
    layout.pose(depth, geometry, pose)
    const angle = (pose.rotation * Math.PI) / 180
    const halfWidth = (CARD_WIDTH * pose.scale) / 2
    const halfHeight = (CARD_HEIGHT * pose.scale) / 2
    const rotatedHalfWidth =
      Math.abs(halfWidth * Math.cos(angle)) + Math.abs(halfHeight * Math.sin(angle))
    const rotatedHalfHeight =
      Math.abs(halfWidth * Math.sin(angle)) + Math.abs(halfHeight * Math.cos(angle))
    right = Math.max(right, pose.main + rotatedHalfWidth - CARD_WIDTH / 2)
    bottom = Math.max(bottom, pose.cross + rotatedHalfHeight - CARD_HEIGHT / 2)
  }
  return { right: Math.ceil(right), bottom: Math.ceil(bottom) }
}

const geometry: LayoutGeometry = {
  cardExtent: CARD_WIDTH,
  crossExtent: CARD_HEIGHT,
  gap: 0,
  maxVisible: MAX_VISIBLE,
  count: cards.length,
}
const overflow = measureArcOverflow(geometry)

// #stack's own box must equal the arc's real bounding box: absolutely
// positioned children (every .card) never contribute to a position:relative
// ancestor's auto-computed size, so without this #stack measures 0x0 and
// .controls, laid out right after it, ends up painted through the middle of
// the visible cards instead of below them.
stack.style.width = `${CARD_WIDTH + overflow.right + ARC_MARGIN}px`
stack.style.height = `${CARD_HEIGHT + overflow.bottom + ARC_MARGIN}px`

// #region wiring
const riffle = createRiffle(stack, {
  count: cards.length,
  cardWidth: CARD_WIDTH,
  cardHeight: CARD_HEIGHT,
  maxVisible: MAX_VISIBLE,
  layout,
})
// #endregion wiring

// #region wiring
cards.forEach((card, index) => {
  const el = document.createElement('div')
  el.className = 'card'
  el.style.width = `${CARD_WIDTH}px`
  el.style.height = `${CARD_HEIGHT}px`
  el.style.background = swatchGradient(card)
  el.textContent = card.label
  stack.appendChild(el)
  riffle.registerNode(index, el)
})
// #endregion wiring

function updateReadout(index: number): void {
  readout.textContent = `${index + 1} / ${cards.length}`
}

prevButton.addEventListener('click', () => riffle.prev())
nextButton.addEventListener('click', () => riffle.next())
riffle.on('change', ({ index }) => updateReadout(index))
updateReadout(riffle.getSnapshot().activeIndex)
