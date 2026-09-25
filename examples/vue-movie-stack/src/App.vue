<template>
  <main class="page">
    <div class="stage">
      <div class="stack" v-riffle-root aria-label="Films">
        <div v-for="(film, index) in films" :key="film.title" class="poster" v-riffle-card="index">
          <div
            class="poster-face"
            :style="{
              width: `${POSTER_WIDTH}px`,
              height: `${POSTER_HEIGHT}px`,
              background: posterGradient(film),
            }"
          >
            <div class="poster-scrim" />
            <!-- Decorative: the card's aria-label (from getLabel below) already
                 names the film for assistive tech, and the title reappears
                 below the stack for sighted and AT users alike. -->
            <div class="poster-text" aria-hidden="true">
              <span class="poster-title">{{ film.title }}</span>
              <span class="poster-year">{{ film.year }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="meta">
      <h1 class="title">{{ active.title }}</h1>
      <p class="year">{{ active.year }}</p>
    </div>

    <div class="controls">
      <button type="button" class="control" aria-label="Previous film" @click="prev">
        <span aria-hidden="true">&#8249;</span>
      </button>
      <span class="readout" data-testid="readout">{{ activeIndex + 1 }} / {{ films.length }}</span>
      <button
        type="button"
        class="control"
        aria-label="Next film"
        data-testid="next-button"
        @click="next"
      >
        <span aria-hidden="true">&#8250;</span>
      </button>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRiffle } from '@rpxl/riffle/vue'
import { filmAt, films, posterGradient } from './films'

const POSTER_WIDTH_DESKTOP = 220
const POSTER_HEIGHT_DESKTOP = 330
const POSTER_WIDTH_MOBILE = 150
const POSTER_HEIGHT_MOBILE = 225
// Matches this file's own `@media (max-width: 520px)` rule below. The
// card's own box is set inline (the engine measures cardWidth/cardHeight
// as plain numbers, and an inline style is what sizes .poster-face), so
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

const POSTER_WIDTH = computed(() => (mobile.value ? POSTER_WIDTH_MOBILE : POSTER_WIDTH_DESKTOP))
const POSTER_HEIGHT = computed(() => (mobile.value ? POSTER_HEIGHT_MOBILE : POSTER_HEIGHT_DESKTOP))

// Module scope, so the engine sees the same function every time.
const getLabel = (index: number) => filmAt(index).title

const { vRiffleRoot, vRiffleCard, activeIndex, next, prev } = useRiffle(() => ({
  count: films.length,
  cardWidth: POSTER_WIDTH.value,
  cardHeight: POSTER_HEIGHT.value,
  getLabel,
}))

const active = computed(() => filmAt(activeIndex.value))
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
 * breakpoint: a media query alone cannot resize it, since it is set inline
 * for the engine to measure. Desktop (the rules above) is unchanged; this
 * query only ever narrows them.
 */
@media (max-width: 520px) {
  .page {
    padding: 2rem 1rem;
  }

  .stage {
    padding: 1rem 1rem 1rem 5.5rem;
  }
}

.poster {
  cursor: grab;
  border-radius: 18px;
}

.poster:active {
  cursor: grabbing;
}

.poster:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 18px;
}

.poster-face {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgb(255 255 255 / 8%);
  box-shadow:
    0 24px 48px -16px rgb(0 0 0 / 60%),
    0 2px 6px rgb(0 0 0 / 35%);
}

.poster-face::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  background: radial-gradient(circle at 28% 18%, rgb(255 255 255 / 30%), transparent 60%);
  mix-blend-mode: overlay;
}

.poster-scrim {
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

.poster-text {
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

.poster-title {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.2;
}

.poster-year {
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  opacity: 0.8;
}

.meta {
  text-align: center;
}

.title {
  margin: 0;
  font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', serif;
  font-size: 1.75rem;
  font-weight: 500;
}

.year {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.8rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
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
  border: 1px solid var(--control-border);
  background: var(--control-bg);
  color: var(--ink);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

@media (prefers-reduced-motion: no-preference) {
  .control {
    transition:
      background-color 0.15s ease,
      transform 0.1s ease;
  }

  .control:active {
    transform: scale(0.96);
  }
}

.control:hover {
  background: rgb(255 255 255 / 12%);
}

.control:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.readout {
  min-width: 4.5rem;
  text-align: center;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}
</style>
