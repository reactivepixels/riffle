<!--
  The legacy vue-card-stack README's usage example, translated directly to
  Riffle: the same cards, the same #card slot. The migration guide shows this
  file as its "after". `card` here is typed `LegacyCard` straight from
  `:cards="cards"`, Riffle's generic `<Riffle>`, no cast needed.
-->
<template>
  <Riffle :cards="cards">
    <template #card="{ card }">
      <div :style="{ background: card.background }" style="width: 100%; height: 100%"></div>
    </template>
  </Riffle>
</template>

<script setup lang="ts">
import { Riffle } from '@rpxl/riffle/vue'

interface LegacyCard {
  background: string
}

const cards: LegacyCard[] = [
  { background: '#00659d' },
  { background: '#00abbc' },
  { background: '#e2c58a' },
  { background: '#fc8890' },
  { background: '#b35d7f' },
]
</script>
