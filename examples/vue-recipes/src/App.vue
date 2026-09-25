<!--
  Page chrome only: a nav linking to each recipe, and a hash router that
  mounts one recipe component per route. No router dependency: the hash
  fragment never reaches the server, so `vite preview`'s static file server
  needs no history-fallback configuration either.

  Every recipe component is self-contained (no props, no dependency on this
  file's own app.css), so this shell's only real job beyond navigation is
  reserving the room each recipe's fan needs so it never gets clipped: see
  app.css's `.stage--fan` and `.stage--column-fan`. `stage--fan` covers the
  three recipes built on the default `fan()` layout (or, for
  ExternalControlStack and FormCardsStack, the same default layout the
  `<Riffle>` drop-in falls back to), which spreads cards behind the front
  one toward the negative (left) side; `stage--column-fan` covers
  VerticalStack, whose own vertical fan needs room below instead;
  `stage--arc` covers CustomLayoutStack, whose own `spread()` layout arcs
  the other way and already sizes its own box to fit.
-->
<template>
  <div class="app">
    <header class="app-header">
      <a class="app-title" href="#/">Riffle: Vue recipes</a>
      <nav class="app-nav" aria-label="Recipes">
        <a
          v-for="recipe in RECIPES"
          :key="recipe.slug"
          :href="`#/${recipe.slug}`"
          :aria-current="slug === recipe.slug ? 'page' : undefined"
        >
          {{ recipe.label }}
        </a>
      </nav>
    </header>
    <main class="app-main">
      <div v-if="active" class="page">
        <div :class="['stage', `stage--${active.stage}`]">
          <component :is="active.Component" />
        </div>
        <p class="page-description">{{ active.description }}</p>
      </div>
      <div v-else class="page index-page">
        <h1>Vue recipes</h1>
        <p>
          Five small Vue apps, each demonstrating one Riffle recipe. Pick one from the nav above, or
          from the list below.
        </p>
        <ul class="index-list">
          <li v-for="recipe in RECIPES" :key="recipe.slug">
            <a :href="`#/${recipe.slug}`">{{ recipe.label }}</a>
            <p>{{ recipe.description }}</p>
          </li>
        </ul>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import VerticalStack from './VerticalStack.vue'
import InfiniteFeed from './InfiniteFeed.vue'
import ExternalControlStack from './ExternalControlStack.vue'
import FormCardsStack from './FormCardsStack.vue'
import CustomLayoutStack from './CustomLayoutStack.vue'

interface Recipe {
  /** The hash-route segment, e.g. `vertical` for `#/vertical`. */
  slug: string
  label: string
  description: string
  Component: Component
  stage: 'fan' | 'column-fan' | 'arc'
}

const RECIPES: readonly Recipe[] = [
  {
    slug: 'vertical',
    label: 'Vertical axis',
    description: "axis: 'y', fanned vertically, browsed with the up and down arrow keys.",
    Component: VerticalStack,
    stage: 'column-fan',
  },
  {
    slug: 'infinite-feed',
    label: 'Infinite feed',
    description: 'The stack grows by eight cards once the active card nears the end.',
    Component: InfiniteFeed,
    stage: 'fan',
  },
  {
    slug: 'programmatic-control',
    label: 'Programmatic control',
    description: 'A sibling component drives the stack entirely through the template ref.',
    Component: ExternalControlStack,
    stage: 'fan',
  },
  {
    slug: 'forms-in-cards',
    label: 'Forms inside cards',
    description: 'Every card holds a real text input; only the active one is ever reachable.',
    Component: FormCardsStack,
    stage: 'fan',
  },
  {
    slug: 'custom-layout',
    label: 'Custom layout',
    description: 'A hand-written LayoutStrategy, arcing cards out instead of stacking them.',
    Component: CustomLayoutStack,
    stage: 'arc',
  },
]

function readSlug(): string {
  if (typeof window === 'undefined') return ''
  return window.location.hash.replace(/^#\/?/, '')
}

const slug = ref(readSlug())
function onHashChange(): void {
  slug.value = readSlug()
}
onMounted(() => window.addEventListener('hashchange', onHashChange))
onUnmounted(() => window.removeEventListener('hashchange', onHashChange))

const active = computed(() => RECIPES.find((recipe) => recipe.slug === slug.value))
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.app-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem 1rem 0;
  text-align: center;
}

.app-title {
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;
  letter-spacing: 0.02em;
  color: inherit;
}

.app-nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.app-nav a {
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  border: 1px solid var(--control-border);
  background: var(--control-bg);
  color: inherit;
  font-size: 0.8rem;
  text-decoration: none;
}

.app-nav a[aria-current='page'] {
  border-color: var(--accent);
  color: var(--accent);
}

.app-main {
  flex: 1;
}

.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 3rem 1.5rem;
}

.page-description {
  max-width: 32rem;
  margin: 0;
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
}

/*
 * The three recipes built on the default `fan()` layout spread the cards
 * behind the front one toward the negative (left) side (see
 * packages/core/src/layout/fan.ts: `out.main = -offset * depth`), so the
 * room for that fan has to be reserved on the left, not centred, or the
 * back cards clip against the viewport's own left edge at narrow widths.
 * The numbers here (padding-left, plus .page's own left padding above) give
 * the widest card any recipe on this stage uses (240px, FormCardsStack and
 * InfiniteFeed) comfortable room for its visible cards at rest, confirmed
 * against the clipped-card check this repository runs at both 375px and
 * 1440px.
 */
.stage--fan {
  width: 100%;
  max-width: 640px;
  padding-left: 7rem;
}

/*
 * VerticalStack's own fan spreads vertically (axis="y"), so it needs room
 * below the row instead of to the left; see VerticalStack.vue's own
 * `layout` (`fan({ offset: -32 })`).
 */
.stage--column-fan {
  width: 100%;
  max-width: 640px;
  padding-bottom: 6.5rem;
}

/*
 * CustomLayoutStack's own `spread()` layout arcs the other way (right and
 * down, see examples/custom-layout/src/spread-layout.ts) and already sizes
 * its own box to the arc's measured reach, scaled to the width this stage
 * gives it (root.clientWidth, read in CustomLayoutStack.vue), so this stage
 * only needs to isolate its stacking context, not skew its padding.
 */
.stage--arc {
  width: 100%;
  max-width: 640px;
  isolation: isolate;
}

.index-page {
  max-width: 32rem;
  text-align: center;
}

.index-list {
  list-style: none;
  margin: 1.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  text-align: left;
}

.index-list li {
  padding: 0.85rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--control-border);
  background: var(--control-bg);
}

.index-list a {
  font-weight: 600;
  text-decoration: none;
  color: inherit;
}

.index-list p {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.8rem;
}

@media (max-width: 520px) {
  .page {
    padding: 2rem 1rem;
  }

  .stage--fan {
    padding-left: 6.5rem;
  }

  .stage--column-fan {
    padding-bottom: 6.5rem;
  }
}
</style>
