/**
 * The code each framework track shows for a given snippet name, rendered
 * by `<Snippet name="..." />` (src/components/tracks/Snippet.astro) on the
 * track the page belongs to. Every value comes from a real file through
 * ./snippets.ts, never retyped here.
 *
 * The type is the parity check: every snippet name must have an entry for
 * every framework, so leaving one out is a compile error in `pnpm typecheck`
 * rather than a track that quietly shows nothing. Long files show a focused
 * `#region` (see `region` in ./snippets.ts), and Snippet.astro refuses any
 * snippet over 40 lines. A snippet that is the same
 * in every framework (a layout strategy is framework agnostic) still lists
 * all three, through `everyTrack`.
 */
import {
  coreInstall,
  reactCardFieldsSource,
  reactClampDataSource,
  reactCustomLayoutSource,
  reactDisabledControlsSource,
  reactEssentials,
  reactFocusRedirectSource,
  reactGotoWiringSource,
  reactGrowthSource,
  reactGrowthWiringSource,
  reactQuickstart,
  reactVerticalSource,
  spreadPoseSource,
  vanillaCardFieldsSource,
  vanillaCustomLayoutSource,
  vanillaDisabledControlsSource,
  vanillaEssentials,
  vanillaFocusRedirectSource,
  vanillaGotoWiringSource,
  vanillaGrowthSource,
  vanillaGrowthWiringSource,
  vanillaQuickstart,
  vanillaVerticalSource,
  vanillaWaypointsSource,
  vueCardFieldsSource,
  vueCustomLayoutSource,
  vueDisabledControlsSource,
  vueEssentials,
  vueFocusRedirectSource,
  vueGotoWiringSource,
  vueGrowthSource,
  vueGrowthWiringSource,
  vueQuickstart,
  vueVerticalSource,
  vueWaypointsSource,
} from './snippets'

export type Framework = 'vanilla' | 'react' | 'vue'

export type SnippetName =
  | 'install'
  | 'first-stack'
  | 'essentials'
  | 'vertical'
  | 'custom-layout'
  | 'spread-layout'
  | 'waypoints'
  | 'disabled-controls'
  | 'growth'
  | 'growth-wiring'
  | 'goto-wiring'
  | 'card-fields'
  | 'focus-redirect'

export interface SnippetEntry {
  code: string
  lang: string
  title: string
}

/** One entry shown unchanged on every track. */
function everyTrack(entry: SnippetEntry): Record<Framework, SnippetEntry> {
  return { vanilla: entry, react: entry, vue: entry }
}

export const SNIPPETS: Record<SnippetName, Record<Framework, SnippetEntry>> = {
  // One package, so the same install command shows on every track.
  install: everyTrack({ code: coreInstall, lang: 'sh', title: 'Terminal' }),
  // The README quickstart, from the real file the README is checked against.
  'first-stack': {
    vanilla: { code: vanillaQuickstart, lang: 'ts', title: 'quickstart.ts' },
    react: { code: reactQuickstart, lang: 'tsx', title: 'Quickstart.tsx' },
    vue: { code: vueQuickstart, lang: 'vue', title: 'Quickstart.vue' },
  },
  // What comes next: controls and cleanup, prop getters, directives.
  essentials: {
    vanilla: { code: vanillaEssentials, lang: 'ts', title: 'main.ts' },
    react: { code: reactEssentials, lang: 'tsx', title: 'HeadlessStack.tsx' },
    vue: { code: vueEssentials, lang: 'ts', title: 'ScriptSetupStack.vue' },
  },
  vertical: {
    vanilla: { code: vanillaVerticalSource, lang: 'ts', title: 'vertical.ts' },
    react: { code: reactVerticalSource, lang: 'tsx', title: 'App.tsx' },
    vue: { code: vueVerticalSource, lang: 'vue', title: 'VerticalStack.vue' },
  },
  'custom-layout': {
    vanilla: { code: vanillaCustomLayoutSource, lang: 'ts', title: 'main.ts' },
    react: { code: reactCustomLayoutSource, lang: 'tsx', title: 'CustomLayoutStack.tsx' },
    vue: { code: vueCustomLayoutSource, lang: 'ts', title: 'CustomLayoutStack.vue' },
  },
  'spread-layout': everyTrack({
    code: spreadPoseSource,
    lang: 'ts',
    title: 'spread-layout.ts',
  }),
  // The clamp-with-controls recipe's data: the same invented trail
  // waypoints on every track.
  waypoints: {
    vanilla: { code: vanillaWaypointsSource, lang: 'ts', title: 'waypoints.ts' },
    react: { code: reactClampDataSource, lang: 'ts', title: 'waypoints.ts' },
    vue: { code: vueWaypointsSource, lang: 'ts', title: 'waypoints.ts' },
  },
  // `bounds: 'clamp'` wired to genuinely disabled Prev/Next controls, the
  // clamp-with-controls recipe.
  'disabled-controls': {
    vanilla: { code: vanillaDisabledControlsSource, lang: 'ts', title: 'clamp.ts' },
    react: { code: reactDisabledControlsSource, lang: 'tsx', title: 'ClampStack.tsx' },
    vue: { code: vueDisabledControlsSource, lang: 'vue', title: 'App.vue' },
  },
  // The infinite-feed recipe's growth guard, pure and unit tested on its own.
  growth: {
    vanilla: { code: vanillaGrowthSource, lang: 'ts', title: 'growth.ts' },
    react: { code: reactGrowthSource, lang: 'ts', title: 'growth.ts' },
    vue: { code: vueGrowthSource, lang: 'ts', title: 'growth.ts' },
  },
  // `shouldGrow` wired to the stack, the infinite-feed recipe.
  'growth-wiring': {
    vanilla: { code: vanillaGrowthWiringSource, lang: 'ts', title: 'infinite-feed.ts' },
    react: { code: reactGrowthWiringSource, lang: 'tsx', title: 'App.tsx' },
    vue: { code: vueGrowthWiringSource, lang: 'vue', title: 'InfiniteFeed.vue' },
  },
  // A thumbnail rail driving the stack purely through `goTo`, the
  // programmatic-control recipe.
  'goto-wiring': {
    vanilla: { code: vanillaGotoWiringSource, lang: 'ts', title: 'programmatic-control.ts' },
    react: { code: reactGotoWiringSource, lang: 'tsx', title: 'ExternalControlStack.tsx' },
    vue: { code: vueGotoWiringSource, lang: 'vue', title: 'ExternalControlStack.vue' },
  },
  // Each card's own label and text input, the forms-in-cards recipe.
  'card-fields': {
    vanilla: { code: vanillaCardFieldsSource, lang: 'ts', title: 'forms-in-cards.ts' },
    react: { code: reactCardFieldsSource, lang: 'tsx', title: 'FormCardsStack.tsx' },
    vue: { code: vueCardFieldsSource, lang: 'vue', title: 'FormCardsStack.vue' },
  },
  // Redirecting focus into the new active card's own field, the
  // forms-in-cards recipe.
  'focus-redirect': {
    vanilla: { code: vanillaFocusRedirectSource, lang: 'ts', title: 'forms-in-cards.ts' },
    react: { code: reactFocusRedirectSource, lang: 'tsx', title: 'FormCardsStack.tsx' },
    vue: { code: vueFocusRedirectSource, lang: 'vue', title: 'FormCardsStack.vue' },
  },
}
