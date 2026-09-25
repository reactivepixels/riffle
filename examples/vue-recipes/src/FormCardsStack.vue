<!--
  Forms inside cards: every card holds a real text input, not a decorative
  one. This demonstrates three things:

  - An editable target keeps its own keys. Typing in the focused input,
    including arrow keys and Home/End, moves the caret instead of the
    stack. The engine already does this, no configuration needed.
  - A background card's input is genuinely unreachable: every card but the
    active one is inert, so Tab, a screen reader's virtual cursor, and a
    direct `.focus()` call can none of them reach a note field that is not
    currently on top. The engine already does this too.
  - Where focus lands when the active card changes while a field inside it
    is focused: on the new card's own root, not inside a field, the same
    place focus would land for any other card content. The `@change`
    handler below is what a form author writes if they want focus inside
    the new card's first field instead, checking that focus is still
    somewhere in the stack (not off on an unrelated part of the page)
    before redirecting it deeper.

  Shown on the "Forms inside cards" recipe, and rendered live there. Styled
  in `<style scoped>` plus a couple of inline styles for the size that
  varies at runtime: this component is rendered directly on the docs site
  (which does not load this app's own stylesheet) as well as on this app's
  own page for it. The card shrinks at phone widths (matched by this app's
  own left-fan reservation, see app.css) so the fanned cards behind the
  front one stay fully on screen at 375px, the same reasoning
  react-recipes' FormCardsStack.tsx gives for its own mobile card size.
-->
<template>
  <div class="stack">
    <Riffle
      ref="riffleRef"
      aria-label="Films"
      :cards="films"
      :get-key="getKey"
      :get-label="getLabel"
      :card-width="cardWidth"
      :card-height="cardHeight"
      @change="onChange"
    >
      <!-- #region card-fields -->
      <template #card="{ card, index }">
        <div class="card-face" :style="{ width: `${cardWidth}px`, height: `${cardHeight}px` }">
          <strong>{{ card.title }}</strong>
          <label :for="`${idBase}-note-${index}`" class="note-label">Your note</label>
          <input
            :id="`${idBase}-note-${index}`"
            :ref="(el) => setNoteField(index, el as HTMLInputElement | null)"
            type="text"
            class="note-input"
            :placeholder="`What did you think of ${card.title}?`"
          />
        </div>
      </template>
      <!-- #endregion card-fields -->
    </Riffle>
    <div class="controls">
      <button type="button" class="control" aria-label="Previous film" @click="riffleRef?.prev()">
        <span aria-hidden="true">&#8249;</span>
      </button>
      <span class="readout" data-testid="readout">{{ activeIndex + 1 }} / {{ films.length }}</span>
      <button
        type="button"
        class="control"
        aria-label="Next film"
        data-testid="next-button"
        @click="riffleRef?.next()"
      >
        <span aria-hidden="true">&#8250;</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'
import { Riffle, type RiffleEventMap, type RiffleInstance } from '@rpxl/riffle/vue'
import { filmAt, films } from './films'

const CARD_WIDTH_DESKTOP = 240
const CARD_HEIGHT_DESKTOP = 320
const CARD_WIDTH_MOBILE = 150
const CARD_HEIGHT_MOBILE = 200
// Matches this app's own app.css `@media (max-width: 520px)` breakpoint. The
// card's own box is set inline (the engine measures cardWidth/cardHeight as
// plain numbers, and an inline style is what sizes .card-face), so
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

const cardWidth = computed(() => (mobile.value ? CARD_WIDTH_MOBILE : CARD_WIDTH_DESKTOP))
const cardHeight = computed(() => (mobile.value ? CARD_HEIGHT_MOBILE : CARD_HEIGHT_DESKTOP))

// Module scope, so the engine sees the same function every time.
const getLabel = (index: number) => filmAt(index).title
const getKey = (film: (typeof films)[number]) => film.title

// A stable id prefix for this component instance's own fields. `useId` gives
// the server and the client the same value, so the label and input ids
// survive hydration (a random prefix would differ between the two).
const idBase = `vue-recipes-form-cards-${useId()}`

const riffleRef = ref<RiffleInstance | null>(null)
const activeIndex = ref(0)
// One entry per card's own note field, keyed the same way `films` is
// indexed: read from onChange below to move focus into the field itself,
// one step further than where the engine's own focus-following already
// lands (the new active card's root element).
const noteFieldRefs: Record<number, HTMLInputElement | null> = {}
function setNoteField(index: number, el: HTMLInputElement | null): void {
  noteFieldRefs[index] = el
}

// #region focus-redirect
function onChange(event: RiffleEventMap['change']): void {
  activeIndex.value = event.index
  // Only redirect focus into the new field when focus was already
  // somewhere inside the stack: that is exactly the condition the engine's
  // own focus-following uses to decide whether to move focus onto the new
  // active card's root at all. Skipping this check would steal focus into
  // a card field even when nothing on the page had focus in the stack, for
  // example while a visitor was reading unrelated page text and something
  // else called goTo().
  const wasFocusInStack =
    document.activeElement?.closest('[aria-roledescription="carousel"]') != null
  if (!wasFocusInStack) return
  // The engine updates the new active card's accessibility state, including
  // its own focus-follow onto that card's root, before it fires this
  // handler, so this call is the last one to move focus, not the first, and
  // it is the one that sticks.
  noteFieldRefs[event.index]?.focus()
}
// #endregion focus-redirect
</script>

<style scoped>
.stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.card-face {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border-radius: 16px;
  background: #1c1c26;
  color: #f3efe8;
  border: 1px solid rgb(255 255 255 / 8%);
  box-shadow:
    0 24px 48px -16px rgb(0 0 0 / 60%),
    0 2px 6px rgb(0 0 0 / 35%);
}

.note-label {
  font-size: 0.8rem;
}

.note-input {
  padding: 0.5rem;
  border-radius: 8px;
  border: 1px solid rgb(255 255 255 / 24%);
  font: inherit;
}

.controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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

.readout {
  min-width: 4.5rem;
  text-align: center;
  color: #9c988e;
}
</style>
