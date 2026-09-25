<!--
  Type-only fixture for the Vue generics break-it proof. Not
  mounted or rendered by any test; `pnpm typecheck` runs `vue-tsc` over the
  whole package, so this file's template alone is the assertion.

  `card` must be inferred as `Film`, not `unknown`, from `:cards="films"`,
  the same way `<script setup generic="T">` infers a slot's type from a
  bound prop. `card.title` below only compiles if that inference worked.
  The second card usage keeps the pre-generics consumer pattern (a cast
  from `unknown`) compiling too: `Film` is assignable to itself, so an
  `as Film` on an already-`Film` value is legal, redundant, but never an
  error, exactly like the cast every existing `.vue` example already uses.

  Break-it proof: change `card.title` below to
  `card.doesNotExist`. `vue-tsc --noEmit` then fails with "Property
  'doesNotExist' does not exist on type 'Film'", proving the slot really is
  typed by `cards`, not silently `any`/`unknown`.
-->
<script setup lang="ts">
import { Riffle } from '../../../src/vue'

interface Film {
  title: string
}

const films: Film[] = [{ title: 'Neon Harbor' }]
</script>

<template>
  <Riffle :cards="films" :card-width="300" :card-height="400">
    <template #card="{ card }">
      <div>{{ card.title }}</div>
      <div>{{ (card as Film).title }}</div>
    </template>
  </Riffle>
</template>
