/**
 * The vanilla half of the live demo registry, kept in its own module
 * because it is imported by browser code: Demo.astro's client script looks
 * a demo up here by name and mounts it. Every entry is a lazy import, so a
 * page only downloads the demo it actually shows. Nothing here may import
 * an Astro, React or Vue component.
 */
import type { DemoName } from './track-demos'

/** A vanilla demo: mounts itself into an empty element and returns its own teardown. */
export interface VanillaDemoModule {
  mount(el: HTMLElement): () => void
}

export type VanillaDemoLoader = () => Promise<VanillaDemoModule>

/**
 * Every demo whose vanilla track entry is a module. A demo that is a docs
 * tool rather than framework code (the tuning panel) has no entry here:
 * its vanilla entry in ./track-demos.ts is an island instead, and that
 * registry's own type still requires every demo to have a vanilla entry.
 */
export const VANILLA_DEMOS = {
  hero: () => import('../components/tracks/demos/hero-vanilla'),
  'first-stack': () => import('../components/tracks/demos/quickstart-vanilla'),
  'custom-layout': () => import('../components/tracks/demos/custom-layout-vanilla'),
  // The four recipe pages' vanilla demos mount their own real recipe app
  // module directly (examples/vanilla-recipes): each already exports
  // `mount(el)` in exactly this shape, so no docs-local wrapper is needed.
  // Each module's own bottom-of-file `getElementById('...-recipe-root')`
  // auto-mount is a no-op here, since no docs page has that id.
  'infinite-feed': () => import('../../../../examples/vanilla-recipes/src/infinite-feed'),
  'clamp-with-controls': () => import('../../../../examples/vanilla-recipes/src/clamp'),
  'programmatic-control': () =>
    import('../../../../examples/vanilla-recipes/src/programmatic-control'),
  'forms-in-cards': () => import('../../../../examples/vanilla-recipes/src/forms-in-cards'),
} satisfies Partial<Record<DemoName, VanillaDemoLoader>>
