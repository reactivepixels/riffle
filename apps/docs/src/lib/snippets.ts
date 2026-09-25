/**
 * Every code sample shown on the docs site is pulled straight from a real,
 * tested source file rather than retyped into a page. This module is the
 * single place that extracts them, so a drifted example fails loudly at
 * build time instead of silently going stale in prose.
 */
import coreReadmeRaw from '../../../../packages/core/README.md?raw'
import legacyReadmeRaw from './legacy-vue-card-stack-readme.md?raw'
import vueLegacyMigrationRaw from '../../../../examples/vue-movie-stack/src/LegacyMigration.vue?raw'
import vueScaleStepConversionRaw from '../../../../examples/vue-movie-stack/src/scaleStepConversion.ts?raw'
import spreadLayoutRaw from '../../../../examples/custom-layout/src/spread-layout.ts?raw'
import reactInfiniteFeedAppRaw from '../../../../examples/react-infinite-feed/src/App.tsx?raw'
import reactInfiniteFeedGrowthRaw from '../../../../examples/react-infinite-feed/src/growth.ts?raw'
import vueClampControlsAppRaw from '../../../../examples/vue-clamp-controls/src/App.vue?raw'
import vueClampControlsWaypointsRaw from '../../../../examples/vue-clamp-controls/src/waypoints.ts?raw'
import reactExternalControlStackRaw from '../../../../examples/react-recipes/src/ExternalControlStack.tsx?raw'
import reactFormCardsStackRaw from '../../../../examples/react-recipes/src/FormCardsStack.tsx?raw'
import vanillaVerticalRaw from '../../../../examples/vanilla-recipes/src/vertical.ts?raw'
import reactVerticalRaw from '../../../../examples/vertical-stack/src/App.tsx?raw'
import vueVerticalRaw from '../../../../examples/vue-recipes/src/VerticalStack.vue?raw'
import vanillaCustomLayoutRaw from '../../../../examples/custom-layout/src/main.ts?raw'
import reactCustomLayoutRaw from '../../../../examples/react-recipes/src/CustomLayoutStack.tsx?raw'
import vueCustomLayoutRaw from '../../../../examples/vue-recipes/src/CustomLayoutStack.vue?raw'
import vanillaQuickstartRaw from '../../../../examples/vanilla-movie-stack/src/quickstart.ts?raw'
import reactQuickstartRaw from '../../../../examples/react-movie-stack/src/Quickstart.tsx?raw'
import vueQuickstartRaw from '../../../../examples/vue-movie-stack/src/Quickstart.vue?raw'
import vanillaMovieStackMainRaw from '../../../../examples/vanilla-movie-stack/src/main.ts?raw'
import reactHeadlessRaw from '../../../../examples/react-movie-stack/src/HeadlessStack.tsx?raw'
import vueScriptSetupRaw from '../../../../examples/vue-movie-stack/src/ScriptSetupStack.vue?raw'
import vanillaWaypointsRaw from '../../../../examples/vanilla-recipes/src/waypoints.ts?raw'
import vanillaClampRaw from '../../../../examples/vanilla-recipes/src/clamp.ts?raw'
import vanillaInfiniteFeedRaw from '../../../../examples/vanilla-recipes/src/infinite-feed.ts?raw'
import vanillaGrowthRaw from '../../../../examples/vanilla-recipes/src/growth.ts?raw'
import vanillaProgrammaticControlRaw from '../../../../examples/vanilla-recipes/src/programmatic-control.ts?raw'
import vanillaFormsInCardsRaw from '../../../../examples/vanilla-recipes/src/forms-in-cards.ts?raw'
import reactClampStackRaw from '../../../../examples/react-recipes/src/ClampStack.tsx?raw'
import reactClampWaypointsRaw from '../../../../examples/react-recipes/src/waypoints.ts?raw'
import vueInfiniteFeedRaw from '../../../../examples/vue-recipes/src/InfiniteFeed.vue?raw'
import vueGrowthRaw from '../../../../examples/vue-recipes/src/growth.ts?raw'
import vueExternalControlStackWiringRaw from '../../../../examples/vue-recipes/src/ExternalControlStack.vue?raw'
import vueFormCardsStackWiringRaw from '../../../../examples/vue-recipes/src/FormCardsStack.vue?raw'

function extractFencedBlock(markdown: string, heading: string, lang: string): string {
  const headingIndex = markdown.indexOf(heading)
  if (headingIndex === -1) {
    throw new Error(`Could not find heading "${heading}" while extracting a docs snippet`)
  }
  const fenceOpen = '```' + lang
  const openIndex = markdown.indexOf(fenceOpen, headingIndex)
  if (openIndex === -1) {
    throw new Error(
      `Could not find a ${lang} code fence after "${heading}" while extracting a docs snippet`,
    )
  }
  const codeStart = openIndex + fenceOpen.length
  const closeIndex = markdown.indexOf('```', codeStart)
  if (closeIndex === -1) {
    throw new Error(`Unterminated code fence after "${heading}" while extracting a docs snippet`)
  }
  return markdown.slice(codeStart, closeIndex).replace(/^\n/, '').replace(/\n$/, '')
}

/**
 * The package README's install line (an untagged fence, hence the empty
 * language): one command, shown on every framework track's overview.
 */
export const coreInstall: string = extractFencedBlock(coreReadmeRaw, '## Install', '')

/** The short usage snippet from the package README, shown on the landing page. */
export const usageExample: string = extractFencedBlock(coreReadmeRaw, '## Usage', 'ts')

/** The short React usage snippet from the package README, shown on the landing page. */
export const reactUsageExample: string = extractFencedBlock(coreReadmeRaw, '### React', 'tsx')

/** The short Vue usage snippet from the package README, shown on the landing page. */
export const vueUsageExample: string = extractFencedBlock(coreReadmeRaw, '### Vue', 'vue')

/** The legacy vue-card-stack component, quoted verbatim for the migration guide. */
export const legacyUsageComponent: string = extractFencedBlock(legacyReadmeRaw, '## Usage', 'js')

/** The legacy vue-card-stack template, quoted verbatim for the migration guide. */
export const legacyUsageTemplate: string = extractFencedBlock(legacyReadmeRaw, '## Usage', 'html')

/**
 * The legacy README's usage example translated directly to Riffle, the
 * worked "after" in the migration guide: a real, typechecked file rather
 * than a hand-written translation.
 */
export const vueMigrationAfter: string = vueLegacyMigrationRaw

/** The scaleMultiplier-to-scaleStep conversion, shown on the migration page. */
export const vueScaleStepConversion: string = vueScaleStepConversionRaw

/**
 * The lines between `#region <name>` and `#endregion <name>` markers in a
 * real file, in whatever comment syntax the file uses (`// #region x`,
 * `<!-- #region x -->`, or a JSX comment): a focused part of a file too
 * long to show whole. A name may mark several regions of one file; they are
 * joined with a blank line, in order. Each region is dedented, and marker
 * lines inside a region are dropped. Throws if the name marks nothing, or a
 * region never closes, so a moved marker fails the build rather than
 * showing the wrong code.
 */
function region(source: string, name: string): string {
  const open = new RegExp(`#region ${name}\\b`)
  const close = new RegExp(`#endregion ${name}\\b`)
  const marker = /#(end)?region\b/
  const blocks: string[][] = []
  let current: string[] | null = null
  for (const line of source.split('\n')) {
    if (current === null) {
      if (open.test(line)) current = []
    } else if (close.test(line)) {
      blocks.push(current)
      current = null
    } else if (!marker.test(line)) {
      current.push(line)
    }
  }
  if (current !== null) throw new Error(`Unterminated #region ${name} in a docs snippet source`)
  if (blocks.length === 0) throw new Error(`No #region ${name} in a docs snippet source`)
  return blocks
    .map((lines) => {
      const indents = lines.filter((l) => l.trim() !== '').map((l) => l.match(/^ */)![0].length)
      const indent = Math.min(...indents)
      return lines.map((l) => l.slice(indent)).join('\n')
    })
    .join('\n\n')
}

/**
 * The quickstart in each framework: the same files the README quickstarts
 * are checked against (scripts/check-readme-examples.mjs), so the README,
 * this snippet and the live demo that renders the file are one piece of code.
 */
export const vanillaQuickstart: string = vanillaQuickstartRaw
export const reactQuickstart: string = reactQuickstartRaw
export const vueQuickstart: string = vueQuickstartRaw

/** The essentials after the quickstart: controls and cleanup, prop getters, directives. */
export const vanillaEssentials: string = region(vanillaMovieStackMainRaw, 'essentials')
export const reactEssentials: string = region(reactHeadlessRaw, 'essentials')
export const vueEssentials: string = region(vueScriptSetupRaw, 'essentials')

/** A vertical stack (`axis: 'y'`), in each framework. */
export const vanillaVerticalSource: string = region(vanillaVerticalRaw, 'vertical')
export const reactVerticalSource: string = region(reactVerticalRaw, 'vertical')
export const vueVerticalSource: string = region(vueVerticalRaw, 'vertical')

/** The `spread()` layout wired to a stack, in each framework. */
export const vanillaCustomLayoutSource: string = region(vanillaCustomLayoutRaw, 'wiring')
export const reactCustomLayoutSource: string = region(reactCustomLayoutRaw, 'wiring')
export const vueCustomLayoutSource: string = region(vueCustomLayoutRaw, 'wiring')

/** spread()'s `pose`, the part of the strategy the Layouts guide walks through. */
export const spreadPoseSource: string = region(spreadLayoutRaw, 'pose')

/**
 * The four recipe pages (src/tracks/recipes/*.mdx): infinite-feed,
 * clamp-with-controls, programmatic-control, forms-in-cards, each in every
 * framework. A recipe's supporting data file (waypoints, growth) is usually
 * short enough to show whole; its component or mount() module shows a
 * focused `#region` instead.
 */

/**
 * The clamp-with-controls recipe's data: the same invented trail waypoints
 * on every track (react-recipes' own copy, ported verbatim from
 * vue-clamp-controls' own file, the same way vanilla-recipes' copy is).
 */
export const vanillaWaypointsSource: string = vanillaWaypointsRaw
export const reactClampDataSource: string = reactClampWaypointsRaw
export const vueWaypointsSource: string = vueClampControlsWaypointsRaw

/** `bounds: 'clamp'` wired to genuinely disabled Prev/Next controls. */
export const vanillaDisabledControlsSource: string = region(vanillaClampRaw, 'disabled-controls')
export const reactDisabledControlsSource: string = region(reactClampStackRaw, 'disabled-controls')
export const vueDisabledControlsSource: string = region(vueClampControlsAppRaw, 'disabled-controls')

/** The growth guard: pure, framework free, unit tested on its own. */
export const vanillaGrowthSource: string = vanillaGrowthRaw
export const reactGrowthSource: string = reactInfiniteFeedGrowthRaw
export const vueGrowthSource: string = vueGrowthRaw

/** `shouldGrow` wired to the stack: check on mount, on every change, on every append. */
export const vanillaGrowthWiringSource: string = region(vanillaInfiniteFeedRaw, 'growth-wiring')
export const reactGrowthWiringSource: string = region(reactInfiniteFeedAppRaw, 'growth-wiring')
export const vueGrowthWiringSource: string = region(vueInfiniteFeedRaw, 'growth-wiring')

/** A thumbnail rail driving the stack purely through `goTo`, from outside it. */
export const vanillaGotoWiringSource: string = region(vanillaProgrammaticControlRaw, 'goto-wiring')
export const reactGotoWiringSource: string = region(reactExternalControlStackRaw, 'goto-wiring')
export const vueGotoWiringSource: string = region(vueExternalControlStackWiringRaw, 'goto-wiring')

/** Each card's own label and text input. */
export const vanillaCardFieldsSource: string = region(vanillaFormsInCardsRaw, 'card-fields')
export const reactCardFieldsSource: string = region(reactFormCardsStackRaw, 'card-fields')
export const vueCardFieldsSource: string = region(vueFormCardsStackWiringRaw, 'card-fields')

/** Redirecting focus into the new active card's own field, from `change`. */
export const vanillaFocusRedirectSource: string = region(vanillaFormsInCardsRaw, 'focus-redirect')
export const reactFocusRedirectSource: string = region(reactFormCardsStackRaw, 'focus-redirect')
export const vueFocusRedirectSource: string = region(vueFormCardsStackWiringRaw, 'focus-redirect')
