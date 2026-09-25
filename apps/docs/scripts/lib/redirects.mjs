/**
 * The docs site's static redirect map: every URL that existed before the
 * site was split into framework tracks, read by astro.config.mjs and
 * enumerated here from git history (`git ls-tree -r --name-only
 * c86c5cd~1 apps/docs/src/content/docs`, the commit immediately before the
 * tracks generator landed), so no old link is missed.
 */
import { existsSync, readFileSync } from 'node:fs'

/** The site's own base path, matching astro.config.mjs's `base`. */
const DEFAULT_BASE = '/riffle'

/**
 * Old pages that named a specific framework, or the migration page: each
 * goes straight into its track rather than through `/choose/`, since there
 * is nothing to choose.
 */
export const FRAMEWORK_REDIRECTS = {
  '/adapters/react/': '/react/',
  '/adapters/vue/': '/vue/',
  '/adapters/': '/',
  '/migration/': '/vue/migration/',
}

/**
 * Old framework-neutral pages, each mapped to the slug that replaced it
 * inside a track. Most old slugs still exist unchanged (`getting-started`,
 * `examples`, every `recipes/*`); the four guide pages moved under `guides/`
 * when the tracks were built, so their `next` value has to say so, or
 * `chooseTarget` (scripts/lib/tracks.mjs) would find no such page in any
 * track and silently fall back to that track's overview instead of the
 * guide the visitor actually asked for.
 */
export const NEUTRAL_REDIRECTS = [
  { from: 'getting-started', next: 'getting-started' },
  { from: 'concepts', next: 'guides/concepts' },
  { from: 'gestures', next: 'guides/gestures' },
  { from: 'layouts', next: 'guides/layouts' },
  { from: 'accessibility', next: 'guides/accessibility' },
  { from: 'examples', next: 'examples' },
  { from: 'recipes/clamp-with-controls', next: 'recipes/clamp-with-controls' },
  { from: 'recipes/forms-in-cards', next: 'recipes/forms-in-cards' },
  { from: 'recipes/infinite-feed', next: 'recipes/infinite-feed' },
  { from: 'recipes/programmatic-control', next: 'recipes/programmatic-control' },
]

/** Adds `base` to `path`, unless it is already there. */
function withBase(path, base) {
  return path === base || path.startsWith(`${base}/`) ? path : `${base}${path}`
}

/**
 * The full static redirect map for Astro's `redirects` config: the
 * framework-specific and neutral maps above, plus `apiRedirects` (the
 * old-to-new API path map the API reference generator writes to
 * `src/generated/api-redirects.json`, loaded by `loadApiRedirects`). Every
 * destination gets `base` added, so the config never has to remember to do
 * it per entry, and an already-based destination (as `apiRedirects` may
 * already provide) is left alone rather than doubled.
 *
 * @param {{ apiRedirects?: Record<string, string>, base?: string }} [options]
 * @returns {Record<string, string>}
 */
export function buildRedirects({ apiRedirects = {}, base = DEFAULT_BASE } = {}) {
  const redirects = {}
  for (const [from, to] of Object.entries(FRAMEWORK_REDIRECTS)) {
    redirects[from] = withBase(to, base)
  }
  for (const { from, next } of NEUTRAL_REDIRECTS) {
    redirects[`/${from}/`] = withBase(`/choose/?next=${next}`, base)
  }
  for (const [from, to] of Object.entries(apiRedirects)) {
    redirects[from] = withBase(to, base)
  }
  return redirects
}

/**
 * Reads the generated old-to-new API redirect map, or returns an empty map
 * when that file does not exist yet (the API reference generator that
 * writes it can run before or after this one): astro.config.mjs must still
 * build successfully, and its own redirects, before that file exists.
 *
 * @param {string} path
 * @returns {Record<string, string>}
 */
export function loadApiRedirects(path) {
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf8'))
}
