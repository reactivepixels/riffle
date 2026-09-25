/**
 * Framework-track coverage that the sitemap-driven specs (a11y.spec.ts and
 * friends) do not give: the same-page switcher and its fallback, the
 * landing page's remembered choice, every old URL's redirect (including
 * the API split's 47), search's framework filter, and the carried
 * regression that `<Only>` content renders only in its own track.
 *
 * Runs against the built docs site (playwright.config.ts's webServer
 * builds with `astro build` then serves it with `astro preview`, port
 * 4340), the same way a11y.spec.ts does: Pagefind's index (used by the
 * search tests) only exists once a real build has run, and the redirect
 * stubs this file enumerates are themselves build output.
 */
import { expect, test } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { FRAMEWORKS, TRACK_LABELS, switchTarget } from '../../apps/docs/scripts/lib/tracks.mjs'
import {
  FRAMEWORK_REDIRECTS,
  NEUTRAL_REDIRECTS,
  buildRedirects,
  loadApiRedirects,
} from '../../apps/docs/scripts/lib/redirects.mjs'

const DOCS_PORT = 4340
const DOCS_ORIGIN = `http://localhost:${DOCS_PORT}`
// apps/docs/astro.config.mjs's `base`. astro preview (unlike a bare static
// file server) serves every route under this prefix, matching production
// (GitHub Pages serves the `riffle` repo's dist root the same way); see
// scripts/lib/redirects.mjs's own doc comment for why the redirect map's
// own "from" keys are base-less while its "to" values are not.
const BASE = '/riffle'
const DOCS_SITE_ORIGIN = 'https://reactivepixels.github.io'

const here = fileURLToPath(new URL('.', import.meta.url))
const docsDistDir = resolve(here, '../../apps/docs/dist')
const docsSitemapPath = resolve(docsDistDir, 'sitemap-0.xml')
const apiRedirectsPath = resolve(here, '../../apps/docs/src/generated/api-redirects.json')

/**
 * Every docs entry id on the site (`react/recipes/infinite-feed`, `react`
 * for a track overview, and so on), read from the built sitemap rather than
 * `getCollection('docs')` (only Astro's own build has that): each sitemap
 * `<loc>` is `${DOCS_SITE_ORIGIN}${BASE}/<id>/`, the exact shape
 * chooseTarget/switchTarget (scripts/lib/tracks.mjs) expect their `ids` set
 * to hold.
 */
function docIds(): Set<string> {
  const xml = readFileSync(docsSitemapPath, 'utf8')
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!)
  const prefix = `${DOCS_SITE_ORIGIN}${BASE}/`
  const ids = new Set<string>()
  for (const loc of locs) {
    if (!loc.startsWith(prefix)) continue
    const id = loc.slice(prefix.length).replace(/\/$/, '')
    if (id) ids.add(id)
  }
  if (ids.size === 0) {
    throw new Error(`docIds: no docs entries found in ${docsSitemapPath}`)
  }
  return ids
}

/** The framework switcher link for `fw` (TrackSwitcher.astro's own href), on whatever page `page` is currently at. */
function switcherLink(page: Page, fw: (typeof FRAMEWORKS)[number]) {
  return page.locator(`[data-track-switcher="${fw}"]`)
}

test.describe('tracks: same-page switcher', () => {
  test('switching from a react recipe lands on the same recipe in vue', async ({ page }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/react/recipes/infinite-feed/`)
    // Precondition: the page actually loaded the react recipe, not some
    // fallback or error page, before trusting what the switcher does next.
    await expect(page.locator('h1')).toContainText(/infinite feed/i)

    await switcherLink(page, 'vue').click()

    const expected = switchTarget('react/recipes/infinite-feed', 'vue', docIds())
    expect(expected).toBe('/vue/recipes/infinite-feed/')
    await expect(page).toHaveURL(`${DOCS_ORIGIN}${BASE}${expected}`)
    await expect(page.locator('h1')).toContainText(/infinite feed/i)
  })

  test('switching from the vue-only migration page falls back to the target track overview', async ({
    page,
  }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/vue/migration/`)
    await expect(page.locator('h1')).toContainText(/migrat/i)

    await switcherLink(page, 'react').click()

    const expected = switchTarget('vue/migration', 'react', docIds())
    // migration has no react page, so switchTarget must fall back to the
    // react overview rather than a 404.
    expect(expected).toBe('/react/')
    await expect(page).toHaveURL(`${DOCS_ORIGIN}${BASE}${expected}`)
    await expect(page.locator('h1')).toContainText(/overview/i)
  })
})

test.describe('tracks: remembered choice', () => {
  test('choosing React on the landing page persists, and the landing page then shows Continue with React', async ({
    page,
  }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/`)
    const reactCard = page.locator('[data-track-card="react"]')
    // Precondition: before choosing, the card still reads its initial
    // "Start with React" label, not something already remembered from a
    // previous run's storage.
    await expect(reactCard).toContainText('Start with React')

    await reactCard.click()
    await expect(page).toHaveURL(`${DOCS_ORIGIN}${BASE}/react/getting-started/`)

    const stored = await page.evaluate(() => localStorage.getItem('riffle:framework'))
    expect(stored).toBe('react')

    await page.goto(`${DOCS_ORIGIN}${BASE}/`)
    const rememberedCard = page.locator('[data-track-card="react"]')
    await expect(rememberedCard).toContainText('Continue with React')
    await expect(rememberedCard).toHaveClass(/track-card--remembered/)
  })
})

test.describe('tracks: redirects', () => {
  test('every redirect stub, followed in a browser, lands exactly on its configured target', async ({
    page,
    request,
  }) => {
    const apiRedirects = loadApiRedirects(apiRedirectsPath)
    // Precondition: the API generator actually ran and produced its 47
    // entries (apps/docs/scripts/generate-api.mjs's own build log says so),
    // so this test is exercising the real map, not an empty one that would
    // trivially "pass" by having nothing left to check.
    expect(Object.keys(apiRedirects).length).toBe(47)

    const redirects = buildRedirects({ apiRedirects })
    const entries = Object.entries(redirects)
    // 4 framework-specific (FRAMEWORK_REDIRECTS) + 10 framework-neutral
    // (NEUTRAL_REDIRECTS, each through /choose/) + 47 API = 61.
    expect(Object.keys(FRAMEWORK_REDIRECTS).length).toBe(4)
    expect(NEUTRAL_REDIRECTS.length).toBe(10)
    expect(entries.length).toBe(4 + 10 + 47)

    for (const [from, to] of entries) {
      await test.step(`${from} -> ${to}`, async () => {
        // A fresh page has no remembered track, so /choose/ targets stay put
        // on /choose/ rather than being forwarded on into a track.
        const stubRes = await page.goto(`${DOCS_ORIGIN}${BASE}${from}`)
        expect(stubRes?.status(), `redirect stub at ${from}`).toBe(200)
        await expect(page, `followed from ${from}`).toHaveURL(`${DOCS_ORIGIN}${to}`)

        const toRes = await request.get(`${DOCS_ORIGIN}${to}`)
        expect(toRes.status(), `final page at ${to} (redirected from ${from})`).toBe(200)
      })
    }
  })
})

test.describe('tracks: /choose/ deep links', () => {
  test('with no remembered track, /choose/?next=guides/gestures offers that page in every track', async ({
    page,
  }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/choose/?next=guides/gestures`)
    // Precondition: nothing remembered, so the page stays here to be chosen from.
    expect(await page.evaluate(() => localStorage.getItem('riffle:framework'))).toBeNull()
    await expect(page).toHaveURL(`${DOCS_ORIGIN}${BASE}/choose/?next=guides/gestures`)
    for (const fw of FRAMEWORKS) {
      await expect(page.locator(`[data-choose-card="${fw}"]`)).toHaveAttribute(
        'href',
        `${BASE}/${fw}/guides/gestures/`,
      )
    }
    // No empty "On this page" bar on a page with no headings to list.
    await expect(page.locator('starlight-toc, mobile-starlight-toc')).toHaveCount(0)
  })

  test("with a remembered track, /choose/?next=guides/gestures lands on that track's page", async ({
    page,
  }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/`)
    await page.evaluate(() => localStorage.setItem('riffle:framework', 'vue'))
    await page.goto(`${DOCS_ORIGIN}${BASE}/choose/?next=guides/gestures`)
    await expect(page).toHaveURL(`${DOCS_ORIGIN}${BASE}/vue/guides/gestures/`)
    await expect(page.locator('h1')).toContainText(/gestures/i)
  })
})

test.describe('tracks: switcher persistence', () => {
  test('choosing Vue in the switcher is remembered, and the landing page offers Continue with Vue', async ({
    page,
  }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/react/getting-started/`)
    // Precondition: nothing remembered yet.
    expect(await page.evaluate(() => localStorage.getItem('riffle:framework'))).toBeNull()

    await switcherLink(page, 'vue').click()
    await expect(page).toHaveURL(`${DOCS_ORIGIN}${BASE}/vue/getting-started/`)
    expect(await page.evaluate(() => localStorage.getItem('riffle:framework'))).toBe('vue')

    await page.goto(`${DOCS_ORIGIN}${BASE}/`)
    await expect(page.locator('[data-track-card="vue"]')).toContainText('Continue with Vue')
  })
})

test.describe('tracks: landing page', () => {
  test('no landing link hard-codes a track: each one goes through /choose/', async ({ page }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/`)
    // Every content link except the three track cards, which are the one
    // place a track is chosen by clicking it.
    const hrefs = await page
      .locator('.sl-markdown-content a[href]:not([data-track-card])')
      .evaluateAll((links) => links.map((l) => l.getAttribute('href') ?? ''))
    const chooseLinks = hrefs.filter((href) => href.startsWith(`${BASE}/choose/?next=`))
    // Precondition: the landing's Next list and its Why Riffle links are there.
    expect(chooseLinks.length).toBeGreaterThanOrEqual(6)
    for (const href of hrefs) {
      for (const fw of FRAMEWORKS) {
        expect(href, `landing link ${href} sends everyone into ${fw}`).not.toMatch(
          new RegExp(`^${BASE}/${fw}/`),
        )
      }
    }
    // The track cards themselves still link straight into their own track.
    await expect(page.locator('[data-track-card="react"]')).toHaveAttribute(
      'href',
      `${BASE}/react/getting-started/`,
    )
  })

  test("with Vue remembered, the landing page's Getting Started link lands in the Vue track", async ({
    page,
  }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/`)
    await page.evaluate(() => localStorage.setItem('riffle:framework', 'vue'))
    await page.goto(`${DOCS_ORIGIN}${BASE}/`)
    await page.locator('.sl-markdown-content a', { hasText: 'Getting Started' }).first().click()
    await expect(page).toHaveURL(`${DOCS_ORIGIN}${BASE}/vue/getting-started/`)
  })

  test('the landing page has its own document title, not "Riffle | Riffle"', async ({ page }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/`)
    await expect(page).toHaveTitle('Riffle: a cycling card stack for Vanilla JS, React and Vue')
  })
})

test.describe('tracks: landing stacks before hydration', () => {
  test.use({ javaScriptEnabled: false })

  test('each "One engine" stack shows only its front card until it hydrates', async ({ page }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/`)
    const stacks = page.locator('.demo-stack [aria-roledescription="carousel"]')
    await expect(stacks).toHaveCount(2)
    for (let i = 0; i < 2; i++) {
      const cards = stacks.nth(i).locator(':scope > *')
      // Precondition: every card is in the server-rendered markup.
      expect(await cards.count()).toBeGreaterThan(1)
      const visible = await cards.evaluateAll(
        (els) => els.filter((el) => getComputedStyle(el).visibility !== 'hidden').length,
      )
      expect(visible, `stack ${i}: cards visible before hydration`).toBe(1)
    }
  })
})

test.describe('tracks: landing stacks after hydration', () => {
  test('once hydrated, the rest of the fan is visible again', async ({ page }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/`)
    const stack = page.locator('.demo-stack [aria-roledescription="carousel"]').first()
    await stack.scrollIntoViewIfNeeded()
    await expect
      .poll(() =>
        stack
          .locator(':scope > *')
          .evaluateAll(
            (els) => els.filter((el) => getComputedStyle(el).visibility !== 'hidden').length,
          ),
      )
      .toBeGreaterThan(1)
  })
})

test.describe('tracks: per-track content', () => {
  test('every quickstart names its carousel "Films", vanilla included', async ({ page }) => {
    for (const fw of FRAMEWORKS) {
      await page.goto(`${DOCS_ORIGIN}${BASE}/${fw}/getting-started/`)
      const demo = page.locator('[aria-roledescription="carousel"]').first()
      await expect(demo, `${fw} quickstart demo`).toHaveAttribute('aria-label', 'Films')
    }
  })

  test("Getting Started's next steps link the track's own gallery", async ({ page }) => {
    for (const fw of FRAMEWORKS) {
      await page.goto(`${DOCS_ORIGIN}${BASE}/${fw}/getting-started/`)
      await expect(
        page.locator(`.sl-markdown-content a[href="${BASE}/${fw}/examples/"]`),
        `${fw} getting started`,
      ).toHaveCount(1)
    }
  })

  test('the vanilla gallery includes vanilla-movie-stack, with its screenshot', async ({
    page,
  }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/vanilla/examples/`)
    const img = page.locator('#vanilla-movie-stack img')
    await img.scrollIntoViewIfNeeded()
    await expect(img).toHaveAttribute('src', `${BASE}/examples/vanilla-movie-stack.webp`)
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
  })

  test('the Vue migration page is in the Vue sidebar and linked from the Vue overview', async ({
    page,
  }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/vue/`)
    const migration = `${BASE}/vue/migration/`
    await expect(page.locator(`#starlight__sidebar a[href="${migration}"]`)).toHaveCount(1)
    await expect(page.locator(`.sl-markdown-content a[href="${migration}"]`)).toHaveCount(1)
    // And never in another track's sidebar, where it does not exist.
    await page.goto(`${DOCS_ORIGIN}${BASE}/react/`)
    await expect(page.locator('#starlight__sidebar a[href*="/migration/"]')).toHaveCount(0)
  })

  test("no track page's prose or code names another framework", () => {
    const others = {
      vanilla: ['react', 'vue'],
      react: ['vue', 'vanilla'],
      vue: ['react', 'vanilla'],
    } as const
    function htmlFiles(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name)
        return statSync(full).isDirectory() ? htmlFiles(full) : name === 'index.html' ? [full] : []
      })
    }
    let scanned = 0
    const leaks: string[] = []
    for (const fw of FRAMEWORKS) {
      for (const file of htmlFiles(join(docsDistDir, fw))) {
        // The API reference is generated from each package's own TSDoc.
        if (file.includes(`${fw}/api/`)) continue
        const main = readFileSync(file, 'utf8').match(/<main[^>]*>([\s\S]*)<\/main>/)?.[1] ?? ''
        const text = main.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
        scanned += 1
        for (const other of others[fw]) {
          const hit = text.match(new RegExp(`.{0,60}\\b${other}\\b.{0,40}`, 'i'))
          if (hit) leaks.push(`${file.slice(docsDistDir.length)} [${other}]: ${hit[0].trim()}`)
        }
      }
    }
    // Precondition: every track's pages were read.
    expect(scanned).toBeGreaterThan(30)
    expect(leaks).toEqual([])
  })
})

test.describe('tracks: search', () => {
  async function openSearchAndType(page: Page, query: string) {
    const openBtn = page.locator('button[data-open-modal]')
    // The button starts `disabled` until SiteSearch's constructor runs
    // (Search.astro), which only happens once its script has loaded.
    await expect(openBtn).toBeEnabled({ timeout: 10_000 })
    await openBtn.click()
    await expect(page.locator('dialog[open]')).toBeVisible()
    const input = page.locator('#starlight__search input')
    await input.fill(query)
  }

  test('searching "clamp" from a react page surfaces the react clamp recipe, filtered to react by default', async ({
    page,
  }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/react/getting-started/`)
    await openSearchAndType(page, 'clamp')

    const results = page.locator('.pagefind-ui__result-link')
    await expect(results.first()).toBeVisible({ timeout: 10_000 })

    const hrefs = await results.evaluateAll((links) =>
      links.map((l) => l.getAttribute('href') ?? ''),
    )
    expect(hrefs.length).toBeGreaterThan(0)
    // Pre-filtered to the current track (Search.astro's override calls
    // triggerFilters once PagefindUI mounts): every result is a react page,
    // so the react clamp recipe is trivially first among them.
    for (const href of hrefs) {
      expect(href, `result href should stay within /react/: ${href}`).toContain('/react/')
    }
    expect(hrefs.some((href) => href.includes('/react/recipes/clamp-with-controls/'))).toBe(true)

    // The visible per-result framework label, shown even where filtering
    // is off (MarkdownContent.astro's `data-pagefind-meta`).
    await expect(page.locator('.pagefind-ui__result-tag').first()).toContainText(
      `Framework: ${TRACK_LABELS.react}`,
    )
  })
})

test.describe('tracks: API search', () => {
  test('searching "useRiffleState" from /react/ surfaces the react API page', async ({ page }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/react/`)
    const openBtn = page.locator('button[data-open-modal]')
    await expect(openBtn).toBeEnabled({ timeout: 10_000 })
    await openBtn.click()
    await page.locator('#starlight__search input').fill('useRiffleState')

    const results = page.locator('.pagefind-ui__result-link')
    await expect(results.first()).toBeVisible({ timeout: 10_000 })
    const hrefs = await results.evaluateAll((links) =>
      links.map((l) => l.getAttribute('href') ?? ''),
    )
    for (const href of hrefs) {
      expect(href, `result href should stay within /react/: ${href}`).toContain('/react/')
    }
    expect(hrefs).toContain(`${BASE}/react/api/functions/userifflestate/`)
  })
})

test.describe('tracks: <Only> renders only in its own track', () => {
  const VUE_ONLY_TEXT = 'Riffle for Vue requires Vue 3.4.20 or later.'

  test('the vue-only install note is present on /vue/ and absent on /react/ and /vanilla/', async ({
    page,
  }) => {
    await page.goto(`${DOCS_ORIGIN}${BASE}/vue/`)
    await expect(page.getByText(VUE_ONLY_TEXT)).toBeVisible()

    await page.goto(`${DOCS_ORIGIN}${BASE}/react/`)
    await expect(page.getByText(VUE_ONLY_TEXT)).toHaveCount(0)

    await page.goto(`${DOCS_ORIGIN}${BASE}/vanilla/`)
    await expect(page.getByText(VUE_ONLY_TEXT)).toHaveCount(0)
  })
})
