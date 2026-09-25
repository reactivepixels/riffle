<!--
  The smallest useRiffle stack: the directives straight from the composable.
  Shown and rendered on the docs site's Vue page.
-->
<template>
  <div class="stack">
    <section v-riffle-root aria-label="Films" :style="{ width: `${WIDTH}px` }">
      <article
        v-for="(film, index) in films"
        :key="film.title"
        v-riffle-card="index"
        :style="{
          width: `${WIDTH}px`,
          height: `${HEIGHT}px`,
          borderRadius: '16px',
          background: posterGradient(film),
        }"
      />
    </section>
    <div class="controls">
      <button type="button" aria-label="Previous film" @click="prev">
        <span aria-hidden="true">&#8249;</span>
      </button>
      <span>{{ filmAt(activeIndex).title }}</span>
      <button type="button" aria-label="Next film" @click="next">
        <span aria-hidden="true">&#8250;</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRiffle } from '@rpxl/riffle/vue'
import { filmAt, films, posterGradient } from './films'

const WIDTH = 160
const HEIGHT = 240

// Module scope, so the engine sees the same function every time.
const getLabel = (index: number) => filmAt(index).title

// The template can use v-riffle-root and v-riffle-card only because
// <script setup> exposes these two names, destructured at the top level, to
// it as directives. Rename them and the directives stop resolving.
// #region essentials
const { vRiffleRoot, vRiffleCard, activeIndex, next, prev } = useRiffle({
  count: films.length,
  cardWidth: WIDTH,
  cardHeight: HEIGHT,
  getLabel,
})
// #endregion essentials
</script>

<style scoped>
.stack,
.controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stack {
  flex-direction: column;
}
</style>
