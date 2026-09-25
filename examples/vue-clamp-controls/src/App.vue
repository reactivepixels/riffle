<template>
  <main class="page">
    <div class="stage">
      <div class="stack" v-riffle-root aria-label="Waypoints">
        <div
          v-for="(waypoint, index) in waypoints"
          :key="waypoint.name"
          class="card"
          v-riffle-card="index"
        >
          <div
            class="card-face"
            :style="{
              width: `${CARD_WIDTH}px`,
              height: `${CARD_HEIGHT}px`,
              background: waypointGradient(waypoint),
            }"
          >
            <div class="card-scrim" />
            <!-- Decorative: the card's aria-label (from getLabel below) already
                 names the waypoint for assistive tech, and the name reappears
                 below the stack for sighted and AT users alike. -->
            <div class="card-text" aria-hidden="true">
              <span class="card-name">{{ waypoint.name }}</span>
              <span class="card-elevation">{{ waypoint.elevation }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- #region disabled-controls -->
    <div class="controls">
      <button
        type="button"
        class="control"
        aria-label="Previous waypoint"
        :disabled="!canPrev"
        @click="prev"
      >
        <span aria-hidden="true">&#8249;</span>
      </button>
      <span class="readout">Card {{ activeIndex + 1 }} of {{ waypoints.length }}</span>
      <button
        type="button"
        class="control"
        aria-label="Next waypoint"
        :disabled="!canNext"
        @click="next"
      >
        <span aria-hidden="true">&#8250;</span>
      </button>
    </div>
    <!-- #endregion disabled-controls -->
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRiffle } from '@rpxl/riffle/vue'
import { waypointGradient, waypoints } from './waypoints'

const CARD_WIDTH_DESKTOP = 220
const CARD_HEIGHT_DESKTOP = 300
const CARD_WIDTH_MOBILE = 150
const CARD_HEIGHT_MOBILE = 204
// Matches this file's own `@media (max-width: 520px)` rule below. The
// card's own box is set inline (the engine measures cardWidth/cardHeight
// as plain numbers, and an inline style is what sizes .card-face), so
// shrinking it at narrow widths needs this same breakpoint read in JS, not
// CSS alone: cardWidth/cardHeight switching between two numbers updates
// live without losing position (see the Vue adapter reference, "Options
// between renders").
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

const CARD_WIDTH = computed(() => (mobile.value ? CARD_WIDTH_MOBILE : CARD_WIDTH_DESKTOP))
const CARD_HEIGHT = computed(() => (mobile.value ? CARD_HEIGHT_MOBILE : CARD_HEIGHT_DESKTOP))

// Module scope, so the engine sees the same function every time.
const getLabel = (index: number) => waypoints[index]?.name ?? ''

// #region disabled-controls
const { vRiffleRoot, vRiffleCard, activeIndex, state, next, prev } = useRiffle(() => ({
  count: waypoints.length,
  bounds: 'clamp',
  cardWidth: CARD_WIDTH.value,
  cardHeight: CARD_HEIGHT.value,
  getLabel,
}))

// Buttons are truly `disabled` at the ends, not just styled: a click, a tap
// or an Enter key on a disabled button does nothing, and it drops out of
// the tab order's activation, which a CSS-only affordance never gives you.
const canPrev = computed(() => state.value.canPrev)
const canNext = computed(() => state.value.canNext)
// #endregion disabled-controls
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  padding: 3rem 1.5rem;
}

.stage {
  padding: 1.5rem 1.5rem 1.5rem 6.5rem;
}

/*
 * At phone widths, shrink the page's own decorative padding and the
 * stage's fan reservation (the left padding, which contains the fanned
 * cards' -32px-per-depth offset without clipping them) so the settled
 * stack fits without horizontal scroll. The card's own size shrinks too,
 * driven from this file's own <script setup> at the same 520px
 * breakpoint: a media query alone cannot resize it, since it is set
 * inline for the engine to measure. Desktop (the rules above) is
 * unchanged; this query only ever narrows them.
 */
@media (max-width: 520px) {
  .page {
    padding: 2rem 1rem;
  }

  .stage {
    padding: 1rem 1rem 1rem 5.5rem;
  }
}

.card {
  cursor: grab;
  border-radius: 18px;
}

.card:active {
  cursor: grabbing;
}

.card:focus-visible {
  outline: 2px solid var(--accent, #5fae5c);
  outline-offset: 4px;
  border-radius: 18px;
}

.card-face {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgb(255 255 255 / 8%);
  box-shadow:
    0 24px 48px -16px rgb(0 0 0 / 60%),
    0 2px 6px rgb(0 0 0 / 35%);
}

.card-face::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  background: radial-gradient(circle at 28% 18%, rgb(255 255 255 / 30%), transparent 60%);
  mix-blend-mode: overlay;
}

.card-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    to top,
    rgb(0 0 0 / 88%) 0%,
    rgb(0 0 0 / 88%) 34%,
    rgb(0 0 0 / 55%) 55%,
    transparent 82%
  );
}

.card-text {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 1rem 0.9rem 0.9rem;
  color: #fff;
  text-shadow: 0 1px 3px rgb(0 0 0 / 45%);
}

.card-name {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.2;
}

.card-elevation {
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  opacity: 0.8;
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
  border: 1px solid var(--control-border, rgb(255 255 255 / 16%));
  background: var(--control-bg, rgb(255 255 255 / 6%));
  color: var(--ink, #f3efe8);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.control:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: no-preference) {
  .control:not(:disabled) {
    transition:
      background-color 0.15s ease,
      transform 0.1s ease;
  }

  .control:not(:disabled):active {
    transform: scale(0.96);
  }
}

.control:not(:disabled):hover {
  background: rgb(255 255 255 / 12%);
}

.control:focus-visible {
  outline: 2px solid var(--accent, #5fae5c);
  outline-offset: 2px;
}

.readout {
  min-width: 8rem;
  text-align: center;
  color: var(--muted, #9c988e);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}
</style>
