import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(here, '..')

const CI = !!process.env.CI

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  // Capped rather than left at the local core count: several specs are
  // genuinely timing-sensitive (the fling-vs-slow-drag distinction is a
  // matter of real elapsed milliseconds, not just assertions), and running
  // many WebKit workers at once measurably distorts that timing under CPU
  // contention (reproduced directly: this suite is flaky at the default
  // worker count with WebKit specifically, and stable at 2 across five
  // consecutive full runs). 2 also matches a typical CI runner's core
  // count, so a local run is representative of CI rather than optimistic.
  workers: 2,
  // Playwright's own default ('missing') writes a new baseline
  // to disk for any screenshot that has none, on every platform, CI
  // included, and only fails the run that wrote it: a second run (a CI
  // retry, or a flaky-looking rerun) would then pass against a baseline
  // nobody reviewed or committed, silently masking a genuinely missing
  // comparison as a pass. In CI, 'none' means a missing or different
  // screenshot always fails, with nothing ever auto-written. Locally,
  // 'missing' is kept for the convenience Playwright's default gives a
  // contributor generating a new baseline on demand; visual.spec.ts's own
  // platform check (see its top comment) means this only actually applies
  // on Linux, since it skips before ever reaching a screenshot assertion
  // everywhere else.
  updateSnapshots: CI ? 'none' : 'missing',
  reporter: CI
    ? [['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // visual.spec.ts is Chromium-only (cross-engine font
    // rendering makes pixel baselines across engines noise, and the
    // interaction specs already cover the engines), so it is excluded from
    // every other project below via testIgnore rather than an in-test skip:
    // a pixel-comparison spec has no other project's baseline to compare
    // against, so it should never even attempt to run there. a11y.spec.ts
    // is Chromium-only the same way: axe-core inspects the
    // rendered accessibility tree, which does not vary meaningfully across
    // engines the way pixels or real input handling do, and running the
    // same axe scan three times over (once per desktop engine) would only
    // multiply CI time, not coverage. overflow.spec.ts is
    // Chromium/mobile-chromium only for the same reason:
    // scrollWidth/clientWidth is a layout measurement, not a
    // rendering-engine-specific one, and interaction.spec.ts already covers
    // Firefox and WebKit behaviourally. tracks.spec.ts is Chromium-only for
    // the same reason as a11y.spec.ts (it exercises routing, redirects and
    // search, none of which vary by rendering engine or by touch versus
    // pointer input), plus a concrete one: its switcher tests click
    // TrackSwitcher.astro's link directly, which Starlight's own responsive
    // layout collapses behind a hidden mobile-nav toggle below its desktop
    // breakpoint, so the same click times out on mobile-chromium's narrow
    // viewport waiting for an element that is present but not actionable,
    // for a reason that has nothing to do with the switcher itself
    // (reproduced directly: both switcher tests fail there with
    // `locator.click: Test timeout of 30000ms exceeded`, while every other
    // project passes). tracks-mobile.spec.ts is the phone-width switcher
    // test, which opens that nav popover first: it runs in mobile-chromium
    // alone, and is ignored everywhere else.
    //
    // capture.spec.ts is ignored in every project: it records the hero video
    // and only ever runs through playwright.capture.config.ts (`pnpm capture`).
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: ['**/capture.spec.ts', '**/tracks-mobile.spec.ts'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: [
        '**/capture.spec.ts',
        '**/visual.spec.ts',
        '**/a11y.spec.ts',
        '**/overflow.spec.ts',
        '**/tracks.spec.ts',
        '**/tracks-mobile.spec.ts',
      ],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: [
        '**/capture.spec.ts',
        '**/visual.spec.ts',
        '**/a11y.spec.ts',
        '**/overflow.spec.ts',
        '**/tracks.spec.ts',
        '**/tracks-mobile.spec.ts',
      ],
    },
    // Pixel 7: touch-enabled, used only by the vertical-scroll spec (mobile-only, see
    // interaction.spec.ts). Every other spec explicitly skips this project;
    // see its own skip comment for why. hydration.spec.ts's drag-after-
    // hydration check is desktop-only (a drag works on
    // desktop Chromium), and its two other checks (no-JS markup, zero
    // console warnings) are a rendering-engine concern, not a touch-input
    // one, so hydration.spec.ts is excluded here the same way visual.spec.ts
    // is excluded from firefox/webkit above. overflow.spec.ts is
    // deliberately NOT excluded here (unlike a11y.spec.ts): a 375px-wide
    // viewport is a real, common mobile width, not a synthetic desktop one,
    // so this is exactly the project the fix matters most on.
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
      testIgnore: [
        '**/capture.spec.ts',
        '**/visual.spec.ts',
        '**/hydration.spec.ts',
        '**/a11y.spec.ts',
        '**/tracks.spec.ts',
      ],
    },
  ],
  // Each example is built and served from a fixed port so tests run against
  // what ships, not a dev server. Ports (4301-4303) were checked against
  // `lsof -iTCP -sTCP:LISTEN` at the time this harness was written and
  // against every port already named elsewhere in this repo (none were).
  // 4304 (vue-clamp-controls) and 4310/4320
  // (nextjs-app-router/nuxt-example, matching their own check:ssr scripts' fixed
  // ports so there is only one port per example to keep straight) were
  // checked the same way. 4305 (vertical-stack), 4306
  // (custom-layout), 4307 (react-infinite-feed) and 4340 (docs, `astro
  // preview`, which defaults to 4321 if not given a port) are a11y.spec.ts's,
  // checked the same way against `lsof -iTCP -sTCP:LISTEN`
  // and against every port already named in this file. 4350 (react-recipes,
  // one Vite app serving four hash-routed recipe pages, so it needs only one
  // port despite appearing four times in ALL_EXAMPLE_TARGETS) and 4360
  // (vue-recipes, the same shape, five hash-routed recipe pages) were
  // checked the same way.
  webServer: [
    {
      command:
        'pnpm --filter react-movie-stack run build && pnpm --filter react-movie-stack exec vite preview --port 4301 --strictPort',
      cwd: repoRoot,
      port: 4301,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      command:
        'pnpm --filter vue-movie-stack run build && pnpm --filter vue-movie-stack exec vite preview --port 4302 --strictPort',
      cwd: repoRoot,
      port: 4302,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      // vanilla-basic has no build step (a single HTML file loading Riffle
      // from a CDN URL); this static server also serves the image/link
      // card fixture and packages/core/dist directly. See e2e/serve.ts.
      command: 'pnpm exec tsx serve.ts',
      cwd: here,
      port: 4303,
      timeout: 60_000,
      reuseExistingServer: !CI,
      env: { RIFFLE_E2E_STATIC_PORT: '4303' },
    },
    {
      // visual.spec.ts's clamp-at-index-0 baseline.
      command:
        'pnpm --filter vue-clamp-controls run build && pnpm --filter vue-clamp-controls exec vite preview --port 4304 --strictPort',
      cwd: repoRoot,
      port: 4304,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      // a11y.spec.ts's vertical-stack target.
      command:
        'pnpm --filter vertical-stack run build && pnpm --filter vertical-stack exec vite preview --port 4305 --strictPort',
      cwd: repoRoot,
      port: 4305,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      // a11y.spec.ts's custom-layout target.
      command:
        'pnpm --filter custom-layout run build && pnpm --filter custom-layout exec vite preview --port 4306 --strictPort',
      cwd: repoRoot,
      port: 4306,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      // a11y.spec.ts's react-infinite-feed target.
      command:
        'pnpm --filter react-infinite-feed run build && pnpm --filter react-infinite-feed exec vite preview --port 4307 --strictPort',
      cwd: repoRoot,
      port: 4307,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      // a11y.spec.ts's vanilla-movie-stack target. 4308: checked against
      // `lsof -iTCP -sTCP:LISTEN` and against every port already named in
      // this file, the same way every port above it was chosen.
      command:
        'pnpm --filter vanilla-movie-stack run build && pnpm --filter vanilla-movie-stack exec vite preview --port 4308 --strictPort',
      cwd: repoRoot,
      port: 4308,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      // a11y.spec.ts's vanilla-recipes targets: five HTML pages (vertical,
      // clamp, infinite-feed, programmatic-control, forms-in-cards) built
      // and served from this one multi-page app. 4309: checked the same way
      // as 4308 above.
      command:
        'pnpm --filter vanilla-recipes run build && pnpm --filter vanilla-recipes exec vite preview --port 4309 --strictPort',
      cwd: repoRoot,
      port: 4309,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      // a11y.spec.ts's docs target: the built Starlight site, served the
      // way it actually ships (astro preview over dist/), not astro dev.
      // a11y.spec.ts itself enumerates every page to scan from this same
      // build's dist/sitemap-0.xml, so a new docs page is covered
      // automatically without a hand-maintained list. `astro preview` keeps
      // a single global lock file across the whole machine (confirmed
      // directly: a stray preview process left running from an earlier,
      // unrelated session refused to start a second one here at all, even
      // on a different port, and just printed the first one's address
      // instead); `--ignore-lock` is astro's own documented escape from
      // that, so this webServer entry cannot be blocked by another astro
      // preview process elsewhere.
      command:
        'pnpm --filter @rpxl/docs run build && pnpm --filter @rpxl/docs exec astro preview --port 4340 --ignore-lock',
      cwd: repoRoot,
      port: 4340,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      // hydration.spec.ts's Next.js target. Production build + `next start`,
      // the same shape check:ssr uses (examples/nextjs-app-router/scripts/check-ssr.mjs),
      // fixed at the port its own package.json's `start` script already
      // hardcodes (4310), so this and check:ssr never disagree on where the
      // server listens. A longer timeout than the Vite examples: a Next
      // production build (both routes, "/" and "/static") is slower than a
      // single-page Vite build.
      command:
        'pnpm --filter nextjs-app-router run build && pnpm --filter nextjs-app-router run start',
      cwd: repoRoot,
      port: 4310,
      timeout: 180_000,
      reuseExistingServer: !CI,
    },
    {
      // hydration.spec.ts's Nuxt target. Production build + the built Nitro
      // server, the same shape check:ssr uses
      // (examples/nuxt-example/scripts/check-ssr.mjs), fixed at the port its own
      // package.json's `start` script already hardcodes (4320).
      command: 'pnpm --filter nuxt-example run build && pnpm --filter nuxt-example run start',
      cwd: repoRoot,
      port: 4320,
      timeout: 180_000,
      reuseExistingServer: !CI,
    },
    {
      // a11y.spec.ts's and overflow.spec.ts's react-recipes targets: one
      // Vite app, four hash-routed pages (see ALL_EXAMPLE_TARGETS), so one
      // webServer entry covers all four.
      command:
        'pnpm --filter react-recipes run build && pnpm --filter react-recipes exec vite preview --port 4350 --strictPort',
      cwd: repoRoot,
      port: 4350,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      // a11y.spec.ts's and overflow.spec.ts's vue-recipes targets: one Vite
      // app, five hash-routed pages (see ALL_EXAMPLE_TARGETS), so one
      // webServer entry covers all five, the same shape as react-recipes
      // above.
      command:
        'pnpm --filter vue-recipes run build && pnpm --filter vue-recipes exec vite preview --port 4360 --strictPort',
      cwd: repoRoot,
      port: 4360,
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
  ],
})
