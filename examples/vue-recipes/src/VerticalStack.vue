<!--
  A vertical-axis stack: `axis="y"` on the drop-in, fanned with a
  hand-tuned `fan({ offset: -32 })` (the reference layout's default offset
  is 32, tuned down here to a tighter row-height fan). Focus the
  stack, then ArrowUp/ArrowDown move it; the engine reads the axis to pick
  which arrow keys apply, no extra configuration.
-->
<template>
  <div class="vertical-stack-recipe">
    <!-- #region vertical -->
    <Riffle
      ref="riffleRef"
      aria-label="Tracks"
      axis="y"
      bounds="clamp"
      :layout="layout"
      :cards="tracks"
      :get-key="getKey"
      :get-label="getLabel"
      :card-width="rowWidth"
      :card-height="92"
      card-class-name="row"
      @change="(event) => (activeIndex = event.index)"
    >
      <template #card="{ card }">
        <div class="row-face" :style="{ width: `${rowWidth}px`, background: trackGradient(card) }">
          <!-- Decorative: the card's aria-label (from get-label above) already
               names the track for assistive tech, and the title reappears
               below the stack for sighted and AT users alike. -->
          <div class="row-text" aria-hidden="true">
            <span class="row-title">{{ card.title }}</span>
            <span class="row-artist">{{ card.artist }}</span>
          </div>
        </div>
      </template>
    </Riffle>
    <!-- #endregion vertical -->

    <div class="meta">
      <h1 class="title">{{ active.title }}</h1>
      <p class="artist">{{ active.artist }}</p>
    </div>

    <p class="hint">
      Focus the stack, then press <kbd>&#8593;</kbd> or <kbd>&#8595;</kbd> to browse
    </p>

    <div class="controls">
      <button type="button" class="control" aria-label="Previous track" @click="riffleRef?.prev()">
        <span aria-hidden="true">&#8593;</span>
      </button>
      <span class="readout">{{ activeIndex + 1 }} / {{ tracks.length }}</span>
      <button type="button" class="control" aria-label="Next track" @click="riffleRef?.next()">
        <span aria-hidden="true">&#8595;</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { fan } from '@rpxl/riffle'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/vue'
import { trackAt, trackGradient, tracks } from './tracks'

const ROW_WIDTH_DESKTOP = 300
const ROW_WIDTH_MOBILE = 220
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

const rowWidth = computed(() => (mobile.value ? ROW_WIDTH_MOBILE : ROW_WIDTH_DESKTOP))

// Module scope, so the engine sees the same function every time.
const getLabel = (index: number) => trackAt(index).title
const getKey = (track: (typeof tracks)[number]) => track.title

// Module scope: an option object identity, like a function, must stay
// stable across renders or the adapter treats it as a changed option.
// #region vertical
const layout = fan({ offset: -32 })
// #endregion vertical

const riffleRef = ref<RiffleInstance | null>(null)
const activeIndex = ref(0)
const active = computed(() => trackAt(activeIndex.value))
</script>

<style scoped>
/*
 * This component supplies no page-level padding of its own: the room the
 * fanned rows behind the front one need (the vertical fan's own offset,
 * see the `layout` above) is this app's own App.vue's job to reserve, the
 * same division of labour react-recipes' ClampStack.tsx and app.css give
 * for their own fan reservation.
 */
.vertical-stack-recipe {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.row-face {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  height: 92px;
  border-radius: 14px;
  border: 1px solid rgb(255 255 255 / 8%);
  box-shadow:
    0 20px 40px -18px rgb(0 0 0 / 60%),
    0 2px 6px rgb(0 0 0 / 35%);
}

.row-text {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0 1.1rem;
  color: #fff;
  text-shadow: 0 1px 3px rgb(0 0 0 / 45%);
}

.row-title {
  font-size: 0.98rem;
  font-weight: 600;
  line-height: 1.2;
}

.row-artist {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  opacity: 0.85;
}

.meta {
  text-align: center;
}

.title {
  margin: 0;
  font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', serif;
  font-size: 1.5rem;
  font-weight: 500;
}

.artist {
  margin: 0.3rem 0 0;
  color: #8d9490;
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.hint {
  margin: 0;
  color: #8d9490;
  font-size: 0.82rem;
  text-align: center;
}

.hint kbd {
  display: inline-block;
  min-width: 1.4rem;
  padding: 0.1rem 0.35rem;
  border-radius: 5px;
  border: 1px solid rgb(255 255 255 / 16%);
  background: rgb(255 255 255 / 6%);
  font-family: inherit;
  font-size: 0.78rem;
}

.controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}

.control {
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 16%);
  background: rgb(255 255 255 / 6%);
  color: #eef1f0;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.control:hover {
  background: rgb(255 255 255 / 12%);
}

.control:focus-visible {
  outline: 2px solid #4fb0ae;
  outline-offset: 2px;
}

.readout {
  min-width: 4rem;
  text-align: center;
  color: #8d9490;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}
</style>
