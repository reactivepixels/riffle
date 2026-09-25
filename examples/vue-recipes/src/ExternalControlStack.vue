<!--
  Programmatic control from outside the stack: ThumbnailRail (below, in the
  same file) is a sibling of <Riffle>, not one of its slots, and never
  touches the engine directly. It drives the stack purely through the
  template ref's imperative handle (`riffleRef.value?.goTo(index)`), the
  same handle a completely separate part of an app (a URL sync, a "now
  playing" panel, a test harness) would use. Shown on the "Programmatic
  control" recipe, and rendered live there.

  Styled inline, like vue-clamp-controls' App.vue keeps most of its own
  markup scoped rather than inline: this component is rendered directly on
  the docs site (which does not load this app's own stylesheet) as well as
  on this app's own page for it, so its styling lives in `<style scoped>`
  below plus a couple of inline styles for values that vary at runtime
  (which button is current).
-->
<template>
  <div class="stack">
    <Riffle
      ref="riffleRef"
      aria-label="Films"
      :cards="films"
      :get-key="getKey"
      :get-label="getLabel"
      :card-width="POSTER_WIDTH"
      :card-height="POSTER_HEIGHT"
      @change="(event) => (activeIndex = event.index)"
    >
      <template #card="{ card }">
        <div
          class="poster"
          :style="{
            width: `${POSTER_WIDTH}px`,
            height: `${POSTER_HEIGHT}px`,
            background: posterGradient(card),
          }"
        />
      </template>
    </Riffle>
    <!-- #region goto-wiring -->
    <div class="rail" role="group" aria-label="Jump to film">
      <button
        v-for="(film, index) in films"
        :key="film.title"
        type="button"
        class="rail-button"
        :data-rail-index="index"
        :style="{ fontWeight: index === activeIndex ? 700 : 400 }"
        :aria-current="index === activeIndex ? 'true' : undefined"
        :aria-label="`Jump to ${film.title}`"
        @click="riffleRef?.goTo(index)"
      >
        {{ index + 1 }}
      </button>
    </div>
    <!-- #endregion goto-wiring -->
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Riffle, type RiffleInstance } from '@rpxl/riffle/vue'
import { filmAt, films, posterGradient } from './films'

const POSTER_WIDTH = 160
const POSTER_HEIGHT = 240

// Module scope, so the engine sees the same function every time.
const getLabel = (index: number) => filmAt(index).title
const getKey = (film: (typeof films)[number]) => film.title

const riffleRef = ref<RiffleInstance | null>(null)
const activeIndex = ref(0)
</script>

<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.rail {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

/*
 * Each rail button carries `data-rail-index`, a stable selector this app's
 * own e2e target uses as its `advance` selector (see
 * e2e/utils/examples.ts), since this recipe has no Next button of its own
 * to click, on purpose (see this file's own top comment).
 */
.rail-button {
  min-width: 32px;
  min-height: 32px;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 16%);
  background: rgb(255 255 255 / 6%);
  color: #f3efe8;
  cursor: pointer;
}

.rail-button[aria-current='true'] {
  outline: 2px solid currentColor;
}

.poster {
  border-radius: 16px;
}
</style>
