// @ts-check
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightLinksValidator from 'starlight-links-validator'
import starlightSidebarTopics from 'starlight-sidebar-topics'
import react from '@astrojs/react'
import vue from '@astrojs/vue'
import {
  API_KINDS,
  ADAPTER_FRAMEWORKS,
  FRAMEWORKS,
  SITE_TITLE,
  TRACK_LABELS,
  TRACK_PACKAGE_NAMES,
  trackPath,
} from './scripts/lib/tracks.mjs'
import { buildRedirects, loadApiRedirects } from './scripts/lib/redirects.mjs'
import { vueRefreshStubs } from './scripts/lib/vue-refresh-stubs.mjs'

// The monorepo root, three levels up from this file (apps/docs -> apps -> root).
const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url))

// scripts/generate-api.mjs writes each track's own `<fw>/api/` directory:
// the track's own package's pages sit directly under it
// (`<fw>/api/<kind>/<symbol>/`, no repeated package segment), and react's
// and vue's tracks each also carry a `core/` subset of the core types they
// reference (`<fw>/api/core/<kind>/<symbol>/`); vanilla has no such subset,
// since vanilla's own package already is core. Each of those two groups
// splits further into one subdirectory per TypeDoc "kind" (only the kinds
// present: react has no classes, vue has no type-aliases, and so on).
// Starlight's `autogenerate` sidebar groups take their LABEL from the
// directory's own name, not from any page's frontmatter title (there is no
// override for this), so the only way to label a group "@rpxl/riffle/react"
// instead of "react", or "Functions" instead of "functions", is to declare
// that group's label explicitly here rather than autogenerating one
// combined tree. `autogenerate` still does the per-page listing within each
// kind, so a newly exported function still appears without touching this
// file; only a new KIND a package did not have before needs a line here
// (in API_KINDS, shared with generate-api.mjs).
const contentDocsDir = fileURLToPath(new URL('./src/content/docs', import.meta.url))

/**
 * The API groups a track's sidebar shows, each a `{ dir, label }` pair:
 * `dir` is the subdirectory under `<fw>/api/` the group's pages live in
 * (`''` for the track's own package, flattened directly into `api/`;
 * `'core'` for react's and vue's referenced-core subset), and `label` is
 * the npm package name the group is shown under.
 *
 * @param {(typeof FRAMEWORKS)[number]} fw
 */
function apiGroupsFor(fw) {
  const groups = [{ dir: '', label: TRACK_PACKAGE_NAMES[fw] }]
  if (ADAPTER_FRAMEWORKS.includes(fw))
    groups.push({ dir: 'core', label: TRACK_PACKAGE_NAMES.vanilla })
  return groups
}
// scripts/generate-api.mjs writes the old-to-new per-package API path map
// here once it splits the API reference per track. Read with
// loadApiRedirects, which returns {} when the file has not been generated
// yet, so this config still builds on its own.
const apiRedirectsPath = fileURLToPath(
  new URL('./src/generated/api-redirects.json', import.meta.url),
)

/**
 * Built from whatever `scripts/generate-api.mjs` actually generated for
 * this track (run before Astro starts, by the `dev`/`build` scripts), not
 * hardcoded: a group or kind directory that does not exist is left out
 * rather than rendered as an empty group. Before that script has ever run
 * (a fresh checkout's first `astro dev` without going through `pnpm dev`),
 * every `existsSync` check below is false and this returns an empty array,
 * so the "API" group is merely absent rather than a build error.
 *
 * @param {(typeof FRAMEWORKS)[number]} fw
 */
function apiSidebar(fw) {
  const apiDir = join(contentDocsDir, fw, 'api')
  return apiGroupsFor(fw)
    .filter((group) => existsSync(join(apiDir, group.dir)))
    .map((group) => ({
      label: group.label,
      items: API_KINDS.filter((kind) => existsSync(join(apiDir, group.dir, kind.dir))).map(
        (kind) => ({
          label: kind.label,
          items: [
            {
              autogenerate: {
                directory: group.dir
                  ? `${fw}/api/${group.dir}/${kind.dir}`
                  : `${fw}/api/${kind.dir}`,
              },
            },
          ],
        }),
      ),
    }))
}

// https://astro.build/config
export default defineConfig({
  site: 'https://reactivepixels.github.io',
  base: '/riffle',
  // Every URL that existed before the framework tracks (see
  // scripts/lib/redirects.mjs's own doc comment for how the map was
  // enumerated from git history, and for the /choose/ fallback slugs), plus
  // the generated per-package API path map once it exists.
  redirects: buildRedirects({ apiRedirects: loadApiRedirects(apiRedirectsPath) }),
  vite: {
    // Lets the Vue demos load in `astro dev` alongside React. See the
    // plugin's own doc comment.
    plugins: [vueRefreshStubs()],
    server: {
      fs: {
        // Getting-started, adapters, and migration snippets import source
        // from examples/* and packages/core, outside this app's own
        // directory.
        allow: [workspaceRoot],
      },
    },
  },
  integrations: [
    // The landing page's "One engine, three frameworks" section renders a
    // live React stack and a live Vue stack side by side (see
    // src/content/docs/index.mdx): the framework's own proof that the
    // engine underneath is framework agnostic.
    react(),
    vue(),
    starlight({
      title: SITE_TITLE,
      description: 'A framework-agnostic carousel card stack. Cards, cascading.',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/reactivepixels/riffle' },
      ],
      // The social preview image every page falls back to. Rendered from
      // og/og-card.html (outside src/pages, so it is never built into the
      // site or its sitemap) by e2e/scripts/generate-og-image.mjs into
      // public/og.png, at exactly the 1280x640 the width/height tags below
      // declare. An absolute URL, not a relative one: unlike a README
      // (where npm cannot resolve one at all), a relative URL here would
      // resolve fine on the docs site itself but break the moment the same
      // `head` is read by a crawler that only ever sees the raw HTML with
      // no notion of this site's own base path.
      head: [
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://reactivepixels.github.io/riffle/og.png',
          },
        },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1280' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '640' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:image',
            content: 'https://reactivepixels.github.io/riffle/og.png',
          },
        },
      ],
      // Fails the docs build on a broken internal link in Markdown content.
      // errorOnRelativeLinks is off, so a relative link is never checked
      // here at all: scripts/generate-api.mjs writes every API cross-link as
      // an absolute URL for that reason, and scripts/check-built-links.mjs
      // (run after the build in CI) crawls the built HTML for anything this
      // plugin cannot see, relative links and component-rendered links
      // included. Existence and hash (#fragment) checking stay on here.
      plugins: [
        // /choose/ is a custom page (src/pages/choose.astro), not a content
        // entry, so this plugin reports every link to it as invalid, even
        // though it exists. It is excluded here by its exact path (a query
        // string is stripped before matching); scripts/check-built-links.mjs,
        // which crawls the built site, still checks every link to it.
        starlightLinksValidator({ errorOnRelativeLinks: false, exclude: ['/riffle/choose/'] }),
        // One sidebar per framework track (the pages scripts/generate-tracks.mjs
        // writes from src/tracks/), each opened by its own topic. The plugin's
        // topic list is replaced by src/components/tracks/TrackSwitcher.astro
        // (see `components` below), which links each track to the same page
        // rather than to the track's fixed overview. A topic's `link` has no
        // /riffle base: the plugin adds it (through astro:i18n's
        // getRelativeLocaleUrl) before the link reaches the page.
        //
        // Every page now lives in a track: the API reference is written per
        // track by scripts/generate-api.mjs (see apiSidebar above).
        starlightSidebarTopics(
          [
            ...FRAMEWORKS.map((fw) => ({
              id: fw,
              label: TRACK_LABELS[fw],
              link: trackPath(fw, ''),
              items: [
                { slug: fw },
                { slug: `${fw}/getting-started` },
                { label: 'Guides', items: [{ autogenerate: { directory: `${fw}/guides` } }] },
                { label: 'Recipes', items: [{ autogenerate: { directory: `${fw}/recipes` } }] },
                { slug: `${fw}/examples` },
                // A page only some tracks carry (the Vue-only migration
                // guide, `only: [vue]`), listed in exactly those tracks.
                ...(existsSync(join(contentDocsDir, fw, 'migration.mdx'))
                  ? [{ slug: `${fw}/migration` }]
                  : []),
                { label: 'API', items: apiSidebar(fw) },
              ],
            })),
          ],
          // Pages no sidebar lists still belong to a topic, so they keep a
          // sidebar: each track's API package index page.
          {
            topics: Object.fromEntries(FRAMEWORKS.map((fw) => [fw, [`/${fw}/api/**`]])),
          },
        ),
      ],
      components: {
        Sidebar: './src/components/tracks/TrackSwitcher.astro',
        // The landing page's right-column live demo: see LandingHero.astro's
        // own doc comment for why Starlight's own `hero.image` frontmatter
        // cannot host it.
        Hero: './src/components/LandingHero.astro',
        // Tags a framework track page's indexed content with Pagefind
        // filter/meta attributes (see the component's own doc comment).
        MarkdownContent: './src/components/tracks/MarkdownContent.astro',
        // Pre-filters search results to the current track using the
        // `framework` facet MarkdownContent's override registers.
        Search: './src/components/tracks/Search.astro',
      },
      routeMiddleware: './src/components/tracks/pagination-middleware.ts',
      customCss: ['./src/styles/custom.css'],
    }),
  ],
})
