<!--
  A stack that grows as the user nears the end: once the active card is
  within GROWTH_THRESHOLD of the last one, another PAGE_SIZE generated
  cards are appended through the `cards` prop after a simulated 300ms
  fetch, with a "Loading more" state shown while it is in flight. `bounds:
  'clamp'` makes the end meaningful, and every card carries a stable id
  passed to `get-key`, so growth never disturbs a card already on screen.
  The guard that stops the fetch from firing more than once per approach
  (`src/growth.ts`, ported from react-infinite-feed's own growth.ts) is
  unit tested in `src/growth.test.ts`.

  Self-contained, no dependency on this app's own stylesheet: this
  component is rendered directly on the docs site (which does not load
  this app's own stylesheet) as well as on this app's own page for it.
-->
<template>
  <div class="infinite-feed-recipe">
    <Riffle
      ref="riffleRef"
      aria-label="Feed"
      bounds="clamp"
      :cards="cards"
      :get-key="getKey"
      :card-width="cardWidth"
      :card-height="cardHeight"
      card-class-name="feed-card"
      @change="onChange"
    >
      <template #card="{ card }">
        <div
          class="feed-card-face"
          :style="{
            width: `${cardWidth}px`,
            height: `${cardHeight}px`,
            background: cardGradient(card),
          }"
        >
          <span class="feed-card-id" aria-hidden="true">#{{ card.id + 1 }}</span>
        </div>
      </template>
    </Riffle>

    <div class="controls">
      <button type="button" class="control" aria-label="Previous card" @click="riffleRef?.prev()">
        <span aria-hidden="true">&#8249;</span>
      </button>
      <p class="readout" data-testid="readout">Card {{ activeIndex + 1 }} of {{ cards.length }}</p>
      <button type="button" class="control" aria-label="Next card" @click="riffleRef?.next()">
        <span aria-hidden="true">&#8250;</span>
      </button>
    </div>

    <p class="loading" aria-live="polite" data-testid="loading">
      {{ isLoading ? 'Loading more' : '' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Riffle, type RiffleEventMap, type RiffleInstance } from '@rpxl/riffle/vue'
import { cardGradient, generateCards, type FeedCard } from './cards'
import { shouldGrow } from './growth'

const PAGE_SIZE = 8
const GROWTH_THRESHOLD = 2
const LATENCY_MS = 300
const CARD_WIDTH_DESKTOP = 240
const CARD_HEIGHT_DESKTOP = 320
const CARD_WIDTH_MOBILE = 150
const CARD_HEIGHT_MOBILE = 200
// Matches this file's own `@media (max-width: 520px)` rule below. The
// card's own box is set inline (the engine measures cardWidth/cardHeight
// as plain numbers, and an inline style is what sizes .feed-card-face), so
// shrinking it at narrow widths needs this same breakpoint read in JS, not
// CSS alone.
const MOBILE_QUERY = '(max-width: 520px)'
const mobile = ref(typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches)
let mql: MediaQueryList | undefined
function onMobileChange(): void {
  mobile.value = !!mql?.matches
}
onMounted(() => {
  mql = window.matchMedia(MOBILE_QUERY)
  onMobileChange()
  mql.addEventListener('change', onMobileChange)
})
onUnmounted(() => mql?.removeEventListener('change', onMobileChange))

const cardWidth = computed(() => (mobile.value ? CARD_WIDTH_MOBILE : CARD_WIDTH_DESKTOP))
const cardHeight = computed(() => (mobile.value ? CARD_HEIGHT_MOBILE : CARD_HEIGHT_DESKTOP))

// Module scope, so the engine sees the same function every time.
const getKey = (card: FeedCard) => card.id

const riffleRef = ref<RiffleInstance | null>(null)
const cards = ref<FeedCard[]>(generateCards(0, PAGE_SIZE))
const activeIndex = ref(0)
const isLoading = ref(false)
// The next id to hand out. A plain variable, not a ref: it is bookkeeping
// for the fetch, not something the template renders.
let nextId = PAGE_SIZE
let timer: ReturnType<typeof setTimeout> | null = null

function onChange(event: RiffleEventMap['change']): void {
  activeIndex.value = event.index
}

// Watches activeIndex and cards.length explicitly (rather than
// watchEffect's auto-tracking), the Vue equivalent of React's own
// `useEffect(..., [activeIndex, cards.length])`: isLoading is read inside
// the callback but deliberately left out of the watched sources below, so
// this callback's own `isLoading.value = true` does not retrigger itself.
// Without that exclusion, a fresh run would start between the timer being
// scheduled and it firing, and that second run's own irrelevant cleanup (if
// this were written as a cancel-and-reschedule effect instead) would cancel
// the first run's already-scheduled fetch, so growth would never land.
// `immediate: true` covers the initial mount, matching a React effect's own
// first run after the first render.
// #region growth-wiring
watch(
  [activeIndex, () => cards.value.length],
  () => {
    if (
      !shouldGrow(
        { activeIndex: activeIndex.value, count: cards.value.length, isLoading: isLoading.value },
        GROWTH_THRESHOLD,
      )
    ) {
      return
    }
    isLoading.value = true
    timer = setTimeout(() => {
      cards.value = [...cards.value, ...generateCards(nextId, PAGE_SIZE)]
      nextId += PAGE_SIZE
      timer = null
      isLoading.value = false
    }, LATENCY_MS)
  },
  { immediate: true },
)
// #endregion growth-wiring

// Unmount only: a fetch in flight when the page navigates away is
// cancelled instead of mutating state after this component is gone.
onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
/*
 * This component supplies no page-level padding of its own: the room the
 * fanned cards behind the front one need (the default fan layout's own
 * negative offset) is this app's own App.vue's job to reserve, the same
 * division of labour react-recipes' ClampStack.tsx and app.css give for
 * their own fan reservation.
 */
.infinite-feed-recipe {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.feed-card-face {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgb(255 255 255 / 8%);
  box-shadow:
    0 24px 48px -16px rgb(0 0 0 / 60%),
    0 2px 6px rgb(0 0 0 / 35%);
}

.feed-card-id {
  position: relative;
  z-index: 1;
  margin: 0.9rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 35%);
  color: #fff;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
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
  color: #f3efe8;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.control:hover {
  background: rgb(255 255 255 / 12%);
}

.control:focus-visible {
  outline: 2px solid #e8896a;
  outline-offset: 2px;
}

.readout {
  margin: 0;
  min-width: 8rem;
  text-align: center;
  color: #9c988e;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}

.loading {
  margin: 0;
  min-height: 1.2em;
  color: #e8896a;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
</style>
