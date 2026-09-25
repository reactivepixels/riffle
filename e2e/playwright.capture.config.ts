import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const here = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(here, '..')

/**
 * A separate config for the hero capture, so `pnpm e2e` (and CI) never
 * starts this: recording a scripted pointer for `media/hero.webm`/`.gif` is
 * a launch-asset generation step (see `pnpm capture` in the root
 * `package.json`), not a correctness check, and it deliberately runs only
 * one project against one already-built example instead of the eight
 * servers the main `playwright.config.ts` starts for the whole suite.
 *
 * Reuses the exact same react-movie-stack build-and-preview command and
 * port (4301) as the main config's own webServer entry, so the two never
 * disagree about how that example is served; `capture.spec.ts` is the only
 * spec this config's `testMatch` selects.
 */
export default defineConfig({
  testDir: './specs',
  testMatch: ['capture.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: './.capture-output',
  // capture.spec.ts creates its own browser context (a fixed viewport at
  // 2x device scale, with recordVideo pointed at a known directory) rather
  // than using the default page fixture, so the project's own `use` only
  // needs the browser itself.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'pnpm --filter react-movie-stack run build && pnpm --filter react-movie-stack exec vite preview --port 4301 --strictPort',
      cwd: repoRoot,
      port: 4301,
      timeout: 120_000,
      reuseExistingServer: true,
    },
  ],
})
