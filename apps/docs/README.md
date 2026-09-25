# @rpxl/docs

The Riffle documentation site, built with Astro and Starlight. Private, not published.

The landing page, the track guides, and the adapters page all run live copies of
`@rpxl/riffle` (or its React and Vue entries) straight from the workspace: nothing here
is a screen recording. Code samples are imported from real files in the repository
(`examples/vanilla-basic/index.html`, `packages/core/README.md`, the adapter source
under `packages/core/src/react` and `packages/core/src/vue`) rather than retyped, so a
stale example fails the build instead of drifting quietly.

## Commands

Run from the repository root:

| Command                            | Action                                 |
| :--------------------------------- | :------------------------------------- |
| `pnpm --filter @rpxl/docs dev`     | Start the local dev server             |
| `pnpm --filter @rpxl/docs build`   | Build the production site to `./dist/` |
| `pnpm --filter @rpxl/docs preview` | Preview the production build locally   |

## Structure

- `src/tracks/` holds the framework track templates (the overview, Getting Started and the
  guides). `scripts/generate-tracks.mjs` writes one copy of each into
  `src/content/docs/{vanilla,react,vue}/` (gitignored), and `src/components/tracks/` renders
  their framework-specific parts from the registries in `src/lib/track-snippets.ts` and
  `src/lib/track-demos.ts`.
- `src/content/docs/` holds the remaining pages: `index.mdx` (landing), `adapters/index.mdx`
  (the live React and Vue demo), the recipes, the examples gallery, and `migration.mdx`.
- `src/components/VanillaRiffle.astro` is the live, draggable hero.
- `src/components/PositionScrubber.astro` is the concepts page scrubber. It does not
  drive a `Riffle` instance: it calls the exported pure functions (`wrap`, `fan`,
  `createPose`) directly, so the reader sees the actual pipeline the engine runs.
- `src/components/ReactStack.tsx` and `src/components/VueStack.ts` are the adapters
  live demo (and each track's first-stack demo), one real `@rpxl/riffle/react` island and
  one real `@rpxl/riffle/vue` island, both driving the film data the movie-stack examples ship, hydrated with
  `client:visible`.
- `src/lib/snippets.ts` extracts every code sample shown on the site from its real
  source file, including the vendored `vue-card-stack` README used by the migration
  guide.
