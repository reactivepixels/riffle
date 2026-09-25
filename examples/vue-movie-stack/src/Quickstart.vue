<template>
  <!-- justify-content keeps the stack's one grid column, and so every card, the
       card's own width (centred), so the fan scales about the card itself. -->
  <Riffle
    aria-label="Films"
    :cards="films"
    :card-width="300"
    :card-height="400"
    style="justify-content: center"
  >
    <template #card="{ card, index }">
      <div class="card" :style="{ background: `hsl(${index * 72} 65% 45%)` }">
        {{ card.title }}
      </div>
    </template>
  </Riffle>
</template>

<script setup lang="ts">
import { Riffle } from '@rpxl/riffle/vue'

interface Film {
  title: string
}

defineProps<{ films: Film[] }>()
</script>

<style scoped>
.card {
  width: 300px;
  height: 400px;
  border-radius: 16px;
  color: white;
  display: grid;
  place-items: center;
}
</style>
