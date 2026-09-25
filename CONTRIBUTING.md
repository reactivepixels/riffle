# Contributing

## Setup

```
pnpm install
pnpm build
pnpm test
```

## The test rule

Before you commit a test, break the line it covers, watch it go red for the right
reason, then restore it. A green suite that stays green while the library outputs
nothing is worse than no suite.

A test that never fails proves nothing about the code it claims to cover. Breaking the
line under test, and reading the actual failure message, is the only way to know the
assertion is strong enough to catch the defect it is written against.

## Before you open a pull request

Run, from the repository root:

```
pnpm -r test
pnpm -r typecheck
pnpm -r build
pnpm lint
pnpm gates
```

`pnpm gates` runs the prose, framework-agnostic, snippet drift and internal-reference
checks (`scripts/check-prose.mjs`, `scripts/check-agnostic.mjs`,
`scripts/check-snippets.mjs` and `scripts/check-internal-refs.mjs`) that also run in CI.
It reads tracked files only, so `git add` a new file before running it.

## Docs structure

The docs site (`apps/docs`, Starlight) is three self-contained tracks, one per framework:
`/vanilla/`, `/react/` and `/vue/`. The landing page (`src/content/docs/index.mdx`) and
`/choose/` (`src/pages/choose.astro`) sit outside them.

- **Edit the templates, not the tracks.** Every track page is generated from one template
  in `apps/docs/src/tracks/` by `scripts/generate-tracks.mjs`, which writes it once per
  framework into `src/content/docs/{vanilla,react,vue}/` with `framework: <fw>` added.
  Each track's API reference is generated into `src/content/docs/<fw>/api/` from TSDoc by
  `scripts/generate-api.mjs`. Both outputs are gitignored and rewritten on every `dev`
  and `build`, so an edit made there is lost on the next run.
- **One template, three frameworks.** Write the prose once, in neutral terms, and let the
  components supply what differs:
  - `<Only fw="vue">` (or `fw="react, vue"`) keeps its content on those tracks only. A
    block-level `<Only>` is removed from the other tracks' pages outright, headings
    included, so their tables of contents stay clean.
  - `<Snippet name="growth" />` shows that track's code for a snippet name, from the
    registry in `src/lib/track-snippets.ts`. Every value there is a real file under
    `examples/` or `packages/`, imported with `?raw` through `src/lib/snippets.ts`,
    never retyped. A file too long to show whole shows a `#region <name>` ...
    `#endregion <name>` region of itself instead (`region()` in `snippets.ts`), and a
    snippet over 40 lines fails the build.
  - `<Demo name="hero" />` mounts that track's live demo, from
    `src/lib/track-demos.ts`: a hydrated island for React and Vue, a `mount(el)` module
    for vanilla (`src/lib/track-demos-vanilla.ts`).
  - A template that only makes sense for some frameworks says so in its frontmatter,
    `only: [vue]`, and is generated for those tracks alone.
- **The registries are typed for parity.** `SNIPPETS`, `DEMOS` and the examples gallery
  (`src/lib/track-examples.ts`) are keyed by every framework, so leaving one out fails
  `pnpm typecheck` rather than shipping a track that quietly shows nothing.
- **Link within a track with `/riffle/_track_/`.** A template link such as
  `/riffle/_track_/guides/gestures/` becomes `/riffle/react/guides/gestures/` on the React
  page, so links stay absolute and the build's link validator checks them. From outside
  the tracks (the landing page), link through `/riffle/choose/?next=guides/gestures`,
  which sends a visitor to that page in the track they chose, or asks them to choose.
  `node scripts/check-built-links.mjs`, run after `pnpm --filter @rpxl/docs build` (and
  in CI), crawls every link on the built site, redirect stubs included.

### Adding a recipe to all three frameworks

1. Build the recipe in each framework's own example app (`examples/vanilla-recipes`,
   `examples/react-recipes`, `examples/vue-recipes`), with a test, and add each page to
   `e2e/utils/examples.ts` so the accessibility and overflow specs cover it.
2. Mark the lines to show with `#region <name>` / `#endregion <name>`, export each
   framework's region from `src/lib/snippets.ts`, and add one `SNIPPETS` entry with all
   three frameworks in `src/lib/track-snippets.ts`.
3. For a live demo, add a `DEMOS` entry in `src/lib/track-demos.ts` (a small Astro
   wrapper under `src/components/tracks/demos/` for React and Vue, a `mount(el)` module
   for vanilla).
4. Write `apps/docs/src/tracks/recipes/<slug>.mdx` once, using `<Snippet>`, `<Demo>` and
   `<Only>` for whatever differs. The sidebar's Recipes group picks it up on every
   track automatically.

### Regenerating the gallery screenshots

Each track's Examples page shows a screenshot per example, checked into
`apps/docs/public/examples/`. They are not rebuilt with the site: when an example's
visuals change, or you add one to `src/lib/track-examples.ts`, regenerate it with the
committed Playwright script (each example gets a `TARGETS` entry in
`e2e/scripts/generate-example-screenshots.mjs`):

```
pnpm build
pnpm --filter @rpxl/riffle-e2e run generate-example-screenshots vanilla-movie-stack
```

Leave off the example name to regenerate every screenshot, then look at each one before
committing it.

## End-to-end tests

`pnpm -r test` and `pnpm gates` above do not run the Playwright suite in `e2e/`; run it
separately with `pnpm e2e` (this also builds the workspace packages first). See
`e2e/specs/interaction.spec.ts` and its neighbours for what each spec covers.

`e2e/specs/visual.spec.ts` compares pixel baselines committed for Linux only
(`*-chromium-linux.png`), matching CI's `ubuntu-latest` runner and the exact image CI
runs the whole `e2e` job in. On any other platform it skips, since there is no baseline
to compare against there. If you change something the baselines cover (an example's
CSS, the fan layout's geometry) and need to regenerate them, do it inside the same
Docker image CI uses, pinned to the `@playwright/test` version in `e2e/package.json`,
so the fonts and rendering match what CI will compare against:

```
docker run --platform linux/amd64 --rm -v "$(pwd)":/work -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble bash -lc '
    corepack enable && corepack prepare pnpm@10.11.1 --activate &&
    pnpm install --frozen-lockfile \
      --filter "@rpxl/riffle-e2e..." --filter "{./examples/*}..." --filter "@rpxl/docs..." &&
    pnpm --filter @rpxl/riffle build &&
    cd e2e && npx playwright test --project=chromium visual.spec.ts --update-snapshots'
```

`e2e/playwright.config.ts`'s `webServer` config starts every configured example's dev
server, and the built docs site, regardless of which spec or project you actually run: a
Playwright run inside this same container needs every one of those dependencies
installed, or the server for whatever nobody explicitly filtered for fails to start (a
missing example throws `vite: not found`; a missing docs install throws `Cannot find
package 'typedoc'`, since generating the API reference pages is part of the docs build).
`--filter "{./examples/*}..."` installs every example under `examples/` and each one's own
dependencies (the curly braces are required for pnpm to apply the trailing `...` to a
path-glob selector at all; without them it silently matches only the examples themselves,
`@rpxl/riffle` and so on left out) instead of a hand-picked subset that drifts out
of sync the next time an example is added; `--filter "@rpxl/docs..."` does the same for
the docs site.

Then review the resulting `*-chromium-linux.png` diffs and commit them. If
`@playwright/test`'s version in `e2e/package.json` ever changes, update the tag above
(and `.github/workflows/ci.yml`'s `e2e` job container) to match, and regenerate the
baselines the same way.

## Accessibility

`e2e/specs/a11y.spec.ts` runs `axe-core` against every example and every built docs
page as part of `pnpm e2e`, at rest and after one `next()`. Automation only catches
roughly 40% of real accessibility problems, though, so
[`docs/accessibility-checklist.md`](./docs/accessibility-checklist.md)'s manual
VoiceOver (iOS) and NVDA (Windows) pass is also a release gate; see `RELEASING.md`.

## Writing style

No em dashes or en dashes in code, comments, docs, or commit messages. Use a comma, a
colon, parentheses, or two sentences instead. `pnpm gates` fails on them.

## Releasing

Versioning and publishing are covered in [`RELEASING.md`](./RELEASING.md), and are the
maintainer's responsibility, not a contributor's.
