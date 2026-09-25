<!--
  A custom `LayoutStrategy`: `spread()`, imported straight from
  `examples/custom-layout/src/spread-layout.ts`, driving a real
  `createRiffle` instance built with the core API rather than `<Riffle>` or
  `useRiffle`: a `LayoutStrategy` is core, framework-agnostic API, so this
  recipe wires it up directly in `onMounted`.

  Sized to the available width: the arc's reach grows with the card, so at
  a narrow viewport the card (and so the arc) is scaled down just enough
  that card-plus-arc fits, rather than overflowing or needing a separate
  mobile breakpoint of its own.

  Styled with plain DOM styles set directly on the elements this effect
  creates, rather than through a CSS file: self-contained, no dependency on
  this app's own stylesheet, the same reasoning InfiniteFeed.vue and the
  two `<Riffle>`-based recipes give for their own scoped or inline styles.
-->
<template>
  <div ref="rootRef" class="custom-layout-stack">
    <div ref="stackRef" />
    <div class="controls">
      <button type="button" class="control" aria-label="Previous card" @click="riffle?.prev()">
        <span aria-hidden="true">&#8249;</span>
      </button>
      <span data-testid="readout" ref="readoutRef" class="readout">{{
        `1 / ${cards.length}`
      }}</span>
      <button
        type="button"
        class="control"
        aria-label="Next card"
        data-testid="next-button"
        @click="riffle?.next()"
      >
        <span aria-hidden="true">&#8250;</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import {
  createPose,
  createRiffle,
  type LayoutGeometry,
  type LayoutStrategy,
  type Riffle,
} from '@rpxl/riffle'
import { cards, swatchGradient } from '../../custom-layout/src/cards'
import { spread } from '../../custom-layout/src/spread-layout'

const CARD_WIDTH = 200
const CARD_HEIGHT = 280
const MAX_VISIBLE = 5
// Breathing room beyond the computed arc reach, so a card's box-shadow blur
// never touches the stage's edge.
const ARC_MARGIN = 16

const rootRef = ref<HTMLDivElement | null>(null)
const stackRef = ref<HTMLDivElement | null>(null)
const readoutRef = ref<HTMLSpanElement | null>(null)
const riffle = ref<Riffle | null>(null)

/**
 * How far past the front card's own CARD_WIDTH x CARD_HEIGHT box the arc
 * paints, to the right and down. Runs the same `pose()` the engine calls
 * every frame, for every depth the opacity fade (in spread-layout.ts) still
 * keeps above zero, and turns each resulting translate, rotation and scale
 * into that card's axis-aligned bounding box.
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

let els: HTMLElement[] = []
let unsubscribe: (() => void) | null = null

onMounted(() => {
  const root = rootRef.value
  const stack = stackRef.value
  if (!root || !stack) return

  stack.style.position = 'relative'
  // Contains every card's z-index inside this box's own stacking context,
  // the same reason examples/custom-layout/src/app.css's .stage does, so
  // nothing here can paint above the controls below it.
  stack.style.isolation = 'isolate'

  // #region wiring
  const layout = spread()
  // #endregion wiring
  const geometryFor = (width: number, height: number): LayoutGeometry => ({
    cardExtent: width,
    crossExtent: height,
    gap: 0,
    maxVisible: MAX_VISIBLE,
    count: cards.length,
  })
  // The arc's reach grows in proportion to the card, so scale the card
  // down just enough for card plus arc to fit the available width.
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

  // #region wiring
  const instance = createRiffle(stack, {
    count: cards.length,
    cardWidth,
    cardHeight,
    maxVisible: MAX_VISIBLE,
    layout,
    getLabel: (index) => cards[index]?.label ?? `Card ${index + 1}`,
  })
  // #endregion wiring
  riffle.value = instance

  cards.forEach((card, index) => {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      display: 'grid',
      placeItems: 'center',
      width: `${cardWidth}px`,
      height: `${cardHeight}px`,
      borderRadius: '16px',
      border: '1px solid rgb(255 255 255 / 8%)',
      boxShadow: '0 20px 44px -18px rgb(0 0 0 / 60%), 0 2px 6px rgb(0 0 0 / 35%)',
      background: swatchGradient(card),
      color: '#fff',
      fontSize: '1.1rem',
      fontWeight: '600',
      cursor: 'grab',
      userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>)
    el.textContent = card.label
    stack.appendChild(el)
    instance.registerNode(index, el)
    els.push(el)
  })

  function updateReadout(index: number): void {
    if (readoutRef.value) readoutRef.value.textContent = `${index + 1} / ${cards.length}`
  }
  unsubscribe = instance.on('change', ({ index }) => updateReadout(index))
  updateReadout(instance.getSnapshot().activeIndex)
})

onUnmounted(() => {
  unsubscribe?.()
  riffle.value?.destroy()
  for (const el of els) el.remove()
  els = []
  riffle.value = null
})
</script>

<style scoped>
.custom-layout-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.controls {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.control {
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 16%);
  background: rgb(255 255 255 / 6%);
  color: inherit;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.readout {
  min-width: 4.5rem;
  text-align: center;
}
</style>
