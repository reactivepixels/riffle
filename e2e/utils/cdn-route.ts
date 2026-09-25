import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

const here = fileURLToPath(new URL('.', import.meta.url))
const CORE_DIST_INDEX = resolve(here, '../../packages/core/dist/index.js')

const RIFFLE_PREFIX = 'https://esm.sh/@rpxl/riffle@0.1'

/**
 * `vanilla-basic` imports
 * `https://esm.sh/@rpxl/riffle@0.1`, which does not exist until publish.
 * Every request to esm.sh is intercepted here: the riffle package URL (and
 * any subpath/query string off it) is fulfilled from the workspace build,
 * everything else is failed loudly rather than silently let through to the
 * real network, so an unrouted esm.sh request cannot pass by accident.
 */
export async function routeCdnToLocalBuild(page: Page): Promise<void> {
  const body = await readFile(CORE_DIST_INDEX, 'utf8')
  await page.route('https://esm.sh/**', async (route) => {
    const url = route.request().url()
    if (url.startsWith(RIFFLE_PREFIX)) {
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body })
      return
    }
    throw new Error(`Unrouted esm.sh request in vanilla-basic: ${url}`)
  })
}
