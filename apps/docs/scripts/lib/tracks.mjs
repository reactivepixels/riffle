/**
 * The docs site's framework tracks, defined once. The track generator
 * (../generate-tracks.mjs), the API generator (../generate-api.mjs),
 * astro.config.mjs (one sidebar topic per track), the content schema
 * (src/content.config.ts) and the e2e specs all read these, so adding or
 * renaming a track is a one-line change here rather than a hunt across
 * several places.
 */

/** Every framework track, in sidebar order. */
export const FRAMEWORKS = /** @type {const} */ (['vanilla', 'react', 'vue'])

/**
 * The tracks whose own package is an adapter over core (react, vue), as
 * opposed to vanilla, whose own package already is core. generate-api.mjs
 * uses this to decide which tracks carry a separate `api/core/` subset of
 * referenced core types alongside their own package's pages; vanilla's own
 * package is core, so it has nothing to separate.
 */
export const ADAPTER_FRAMEWORKS = /** @type {const} */ (['react', 'vue'])

/** The site's own title: Starlight's `title`, and the suffix of every document title. */
export const SITE_TITLE = 'Riffle'

/** The human-readable name of each track, as the sidebar switcher shows it. */
export const TRACK_LABELS = /** @type {const} */ ({
  vanilla: 'Vanilla JS',
  react: 'React',
  vue: 'Vue',
})

/** Each track's own npm package name: what its `/<fw>/api/` landing page and its sidebar API group are labelled with. */
export const TRACK_PACKAGE_NAMES = /** @type {const} */ ({
  vanilla: '@rpxl/riffle',
  react: '@rpxl/riffle/react',
  vue: '@rpxl/riffle/vue',
})

/**
 * TypeDoc's own export "kinds", the sub-groups every package's API
 * reference is split into (only the kinds a given package actually has:
 * react has no classes, vue has no type-aliases, and so on). Shared between
 * generate-api.mjs (which groups a track's landing page by these) and
 * astro.config.mjs (whose sidebar groups mirror the same split), so the two
 * can never drift into different kind lists or labels.
 */
export const API_KINDS = /** @type {const} */ ([
  { dir: 'functions', label: 'Functions' },
  { dir: 'classes', label: 'Classes' },
  { dir: 'interfaces', label: 'Interfaces' },
  { dir: 'type-aliases', label: 'Types' },
  { dir: 'variables', label: 'Variables' },
])

/**
 * The site-relative path of a page inside a track: `/react/recipes/x/` for
 * `trackPath('react', 'recipes/x')`, and the track overview `/react/` for an
 * empty slug. Always has a leading and trailing slash, and never the site's
 * `base` prefix: callers add that themselves (Astro's `import.meta.env.BASE_URL`
 * in a component, the literal `/riffle` in the config).
 *
 * @param {(typeof FRAMEWORKS)[number]} fw
 * @param {string} slug
 * @returns {string}
 */
export function trackPath(fw, slug) {
  const trimmed = slug.replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? `/${fw}/` : `/${fw}/${trimmed}/`
}

/**
 * The path for `slug` inside track `fw` when that page actually exists there
 * (`/react/getting-started/`), otherwise that track's overview: the shared
 * fallback both the same-page track switcher and the `/choose/` page use, so
 * neither ever links to a 404 for a page that is `only: [...]` another
 * framework, or that has no equivalent in this track at all.
 *
 * @param {(typeof FRAMEWORKS)[number]} fw
 * @param {string} slug
 * @param {ReadonlySet<string>} ids every docs entry id on the site
 * @returns {string}
 */
export function chooseTarget(fw, slug, ids) {
  const trimmed = slug.replace(/^\/+|\/+$/g, '')
  const targetId = trimmed === '' ? fw : `${fw}/${trimmed}`
  return ids.has(targetId) ? trackPath(fw, trimmed) : trackPath(fw, '')
}

/**
 * Where a track switcher on page `id` (a docs entry id, such as
 * `react/guides/concepts`, or `react` for an overview) should send a visitor
 * choosing track `fw`: the same page in that track when it exists there
 * (`/vue/guides/concepts/`), otherwise that track's overview (a page whose
 * template is `only: [...]` another framework, or a page outside the tracks).
 *
 * @param {string} id
 * @param {(typeof FRAMEWORKS)[number]} fw
 * @param {ReadonlySet<string>} ids every docs entry id on the site
 * @returns {string}
 */
export function switchTarget(id, fw, ids) {
  const current = FRAMEWORKS.find((name) => id === name || id.startsWith(`${name}/`))
  if (current === undefined) return trackPath(fw, '')
  const slug = id.slice(current.length + 1)
  return chooseTarget(fw, slug, ids)
}

/**
 * True when `value` is one of `FRAMEWORKS`: the guard every reader of the
 * `riffle:framework` localStorage key uses, so a value written by a future
 * (or a stale, pre-rename) version of the site is never trusted blindly.
 *
 * @param {unknown} value
 * @returns {value is (typeof FRAMEWORKS)[number]}
 */
export function isFramework(value) {
  return typeof value === 'string' && FRAMEWORKS.includes(value)
}

/**
 * The localStorage key the landing page's three entry points and the track
 * switcher both write, so choosing a track once is remembered everywhere.
 * Every read and write of it is wrapped in try/catch by its callers: a
 * private-browsing tab or a blocked storage policy must never break
 * navigation.
 */
export const FRAMEWORK_STORAGE_KEY = 'riffle:framework'
