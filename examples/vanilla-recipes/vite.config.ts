import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))

// A multi-page app: one HTML entry per recipe, plus the index page that
// links to all five. build.rollupOptions.input is required for Vite to
// discover any HTML entry beyond index.html; see
// https://vite.dev/guide/build.html#multi-page-app for the pattern.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(here, 'index.html'),
        vertical: resolve(here, 'vertical.html'),
        clamp: resolve(here, 'clamp.html'),
        'infinite-feed': resolve(here, 'infinite-feed.html'),
        'programmatic-control': resolve(here, 'programmatic-control.html'),
        'forms-in-cards': resolve(here, 'forms-in-cards.html'),
      },
    },
  },
})
