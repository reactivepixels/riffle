/**
 * The vanilla custom-layout demo on the Layouts guide: `spread()` and its
 * card data imported straight from `examples/custom-layout/src/` (the files
 * that example's own main.ts imports), driving a real `createRiffle`
 * instance built into whatever element it is given. main.ts itself cannot
 * be mounted here, because it looks its elements up by fixed ids in its own
 * page, so this reproduces its sizing glue while the layout it drives stays
 * the one real import. Returns a teardown that destroys the engine and
 * empties the element.
 */
import { createPose, createRiffle, type LayoutGeometry, type LayoutStrategy } from '@rpxl/riffle'
import { cards, swatchGradient } from '../../../../../../examples/custom-layout/src/cards'
import { spread } from '../../../../../../examples/custom-layout/src/spread-layout'
import '../../custom-layout-demo.css'

// The same card size as examples/custom-layout/src/main.ts, scaled down
// below only when the column is too narrow for card plus arc.
const CARD_WIDTH = 200
const CARD_HEIGHT = 280
const MAX_VISIBLE = 5
const ARC_MARGIN = 16

/**
 * How far past the front card's own box the arc paints, to the right and
 * down: the same measurement examples/custom-layout/src/main.ts makes.
 */
function measureArcOverflow(
  layout: LayoutStrategy,
  geometry: LayoutGeometry,
  cardWidth: number,
  cardHeight: number,
): { right: number; bottom: number } {
  const pose = createPose()
  let right = 0
  let bottom = 0
  for (let depth = 1; depth < geometry.maxVisible; depth++) {
    layout.pose(depth, geometry, pose)
    const angle = (pose.rotation * Math.PI) / 180
    const halfWidth = (cardWidth * pose.scale) / 2
    const halfHeight = (cardHeight * pose.scale) / 2
    const rotatedHalfWidth =
      Math.abs(halfWidth * Math.cos(angle)) + Math.abs(halfHeight * Math.sin(angle))
    const rotatedHalfHeight =
      Math.abs(halfWidth * Math.sin(angle)) + Math.abs(halfHeight * Math.cos(angle))
    right = Math.max(right, pose.main + rotatedHalfWidth - cardWidth / 2)
    bottom = Math.max(bottom, pose.cross + rotatedHalfHeight - cardHeight / 2)
  }
  return { right: Math.ceil(right), bottom: Math.ceil(bottom) }
}

function button(label: string, glyph: string): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.setAttribute('aria-label', label)
  const span = document.createElement('span')
  span.setAttribute('aria-hidden', 'true')
  span.textContent = glyph
  el.append(span)
  return el
}

export function mount(host: HTMLElement): () => void {
  const root = document.createElement('div')
  root.className = 'custom-layout-demo not-content'
  const stack = document.createElement('div')
  stack.className = 'custom-layout-demo__stack'
  const controls = document.createElement('div')
  controls.className = 'custom-layout-demo__controls'
  const prev = button('Previous card', '‹')
  const next = button('Next card', '›')
  const readout = document.createElement('span')
  readout.className = 'custom-layout-demo__readout'
  controls.append(prev, readout, next)
  root.append(stack, controls)
  host.replaceChildren(root)

  const layout = spread()
  const geometryFor = (width: number, height: number): LayoutGeometry => ({
    cardExtent: width,
    crossExtent: height,
    gap: 0,
    maxVisible: MAX_VISIBLE,
    count: cards.length,
  })
  // The arc's reach grows in proportion to the card, so scale the card down
  // just enough for card plus arc to fit the column on narrow screens.
  const reach = measureArcOverflow(
    layout,
    geometryFor(CARD_WIDTH, CARD_HEIGHT),
    CARD_WIDTH,
    CARD_HEIGHT,
  )
  const available = root.clientWidth || CARD_WIDTH + reach.right + ARC_MARGIN
  const scale = Math.min(1, (available - ARC_MARGIN) / (CARD_WIDTH + reach.right))
  const cardWidth = Math.floor(CARD_WIDTH * scale)
  const cardHeight = Math.floor(CARD_HEIGHT * scale)
  const overflow = measureArcOverflow(
    layout,
    geometryFor(cardWidth, cardHeight),
    cardWidth,
    cardHeight,
  )
  stack.style.width = `${cardWidth + overflow.right + ARC_MARGIN}px`
  stack.style.height = `${cardHeight + overflow.bottom + ARC_MARGIN}px`

  const riffle = createRiffle(stack, {
    count: cards.length,
    cardWidth,
    cardHeight,
    maxVisible: MAX_VISIBLE,
    layout,
    getLabel: (index) => cards[index]?.label ?? `Card ${index + 1}`,
  })

  cards.forEach((card, index) => {
    const el = document.createElement('div')
    el.className = 'custom-layout-demo__card'
    el.style.width = `${cardWidth}px`
    el.style.height = `${cardHeight}px`
    el.style.background = swatchGradient(card)
    stack.appendChild(el)
    riffle.registerNode(index, el)
  })

  const updateReadout = (index: number): void => {
    readout.textContent = `${index + 1} / ${cards.length}`
  }
  const unsubscribe = riffle.on('change', ({ index }) => updateReadout(index))
  updateReadout(riffle.getSnapshot().activeIndex)
  prev.addEventListener('click', () => riffle.prev())
  next.addEventListener('click', () => riffle.next())

  return () => {
    unsubscribe()
    riffle.destroy()
    host.replaceChildren()
  }
}
