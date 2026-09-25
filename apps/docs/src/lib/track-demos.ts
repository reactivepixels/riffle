/**
 * The live demo each framework track mounts for a given demo name, rendered
 * by `<Demo name="..." />` (src/components/tracks/Demo.astro).
 *
 * React and Vue entries are small Astro wrappers
 * (src/components/tracks/demos/*.astro) that each import one island and
 * give it its client directive. That indirection is required: Astro only
 * hydrates a framework component it can trace back to a static import in
 * the rendering file, and a component looked up from a registry fails the
 * build with NoMatchingImport. Vanilla entries are lazy modules exporting
 * `mount(el)`, loaded in the browser (see ./track-demos-vanilla.ts), or,
 * for a docs tool that is not framework code at all (the tuning panel),
 * `{ island }` with the same kind of wrapper.
 *
 * As with SNIPPETS, the type enforces parity: every demo name needs an
 * entry for every framework, or `pnpm typecheck` fails.
 */
import type { Framework } from './track-snippets'
import { VANILLA_DEMOS, type VanillaDemoLoader } from './track-demos-vanilla'
import HeroReact from '../components/tracks/demos/HeroReact.astro'
import HeroVue from '../components/tracks/demos/HeroVue.astro'
import FirstStackReact from '../components/tracks/demos/FirstStackReact.astro'
import FirstStackVue from '../components/tracks/demos/FirstStackVue.astro'
import CustomLayoutReact from '../components/tracks/demos/CustomLayoutReact.astro'
import CustomLayoutVue from '../components/tracks/demos/CustomLayoutVue.astro'
import TuningPanelIsland from '../components/tracks/demos/TuningPanelIsland.astro'
import InfiniteFeedReact from '../components/tracks/demos/InfiniteFeedReact.astro'
import InfiniteFeedVue from '../components/tracks/demos/InfiniteFeedVue.astro'
import ClampWithControlsReact from '../components/tracks/demos/ClampWithControlsReact.astro'
import ClampWithControlsVue from '../components/tracks/demos/ClampWithControlsVue.astro'
import ProgrammaticControlReact from '../components/tracks/demos/ProgrammaticControlReact.astro'
import ProgrammaticControlVue from '../components/tracks/demos/ProgrammaticControlVue.astro'
import FormsInCardsReact from '../components/tracks/demos/FormsInCardsReact.astro'
import FormsInCardsVue from '../components/tracks/demos/FormsInCardsVue.astro'

export type DemoName =
  | 'hero'
  | 'first-stack'
  | 'tuning-panel'
  | 'custom-layout'
  | 'infinite-feed'
  | 'clamp-with-controls'
  | 'programmatic-control'
  | 'forms-in-cards'

/** An Astro component that renders one hydrated framework island. */
export type IslandDemo = typeof HeroReact

/** A vanilla track entry: a lazy `mount(el)` module, or an island for a docs tool. */
export type VanillaDemo = VanillaDemoLoader | { island: IslandDemo }

/** What a demo entry is for each framework. */
export type DemoEntry<F extends Framework> = F extends 'vanilla' ? VanillaDemo : IslandDemo

export const DEMOS: Record<DemoName, { [F in Framework]: DemoEntry<F> }> = {
  hero: { vanilla: VANILLA_DEMOS.hero, react: HeroReact, vue: HeroVue },
  'first-stack': {
    vanilla: VANILLA_DEMOS['first-stack'],
    react: FirstStackReact,
    vue: FirstStackVue,
  },
  'tuning-panel': {
    vanilla: { island: TuningPanelIsland },
    react: TuningPanelIsland,
    vue: TuningPanelIsland,
  },
  'custom-layout': {
    vanilla: VANILLA_DEMOS['custom-layout'],
    react: CustomLayoutReact,
    vue: CustomLayoutVue,
  },
  'infinite-feed': {
    vanilla: VANILLA_DEMOS['infinite-feed'],
    react: InfiniteFeedReact,
    vue: InfiniteFeedVue,
  },
  'clamp-with-controls': {
    vanilla: VANILLA_DEMOS['clamp-with-controls'],
    react: ClampWithControlsReact,
    vue: ClampWithControlsVue,
  },
  'programmatic-control': {
    vanilla: VANILLA_DEMOS['programmatic-control'],
    react: ProgrammaticControlReact,
    vue: ProgrammaticControlVue,
  },
  'forms-in-cards': {
    vanilla: VANILLA_DEMOS['forms-in-cards'],
    react: FormsInCardsReact,
    vue: FormsInCardsVue,
  },
}
