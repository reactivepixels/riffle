/**
 * The track switcher at phone width. Below Starlight's desktop breakpoint
 * the sidebar, and the switcher inside it, sits in a popover behind the
 * header's menu button, so tracks.spec.ts's desktop switcher tests cannot
 * reach it there. This opens that popover first, the way a visitor does.
 * Runs in the mobile-chromium project (Pixel 7) only; see
 * playwright.config.ts.
 */
import { expect, test } from '@playwright/test'

const DOCS_ORIGIN = 'http://localhost:4340'
const BASE = '/riffle'

test('on a phone, the switcher in the nav popover lands on the same page in another track, and remembers it', async ({
  page,
}) => {
  await page.goto(`${DOCS_ORIGIN}${BASE}/react/recipes/infinite-feed/`)
  const vue = page.locator('[data-track-switcher="vue"]')
  // Precondition: at this width the switcher is hidden until the menu opens.
  await expect(vue).toBeHidden()

  await page.locator('button[popovertarget="starlight__sidebar"]').click()
  await expect(vue).toBeVisible()
  await vue.click()

  await expect(page).toHaveURL(`${DOCS_ORIGIN}${BASE}/vue/recipes/infinite-feed/`)
  await expect(page.locator('h1')).toContainText(/infinite feed/i)
  expect(await page.evaluate(() => localStorage.getItem('riffle:framework'))).toBe('vue')
})
