import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NEUTRAL_REDIRECTS, buildRedirects, loadApiRedirects } from './redirects.mjs'

/**
 * Run with `node --test scripts/lib/redirects.test.mjs` (from apps/docs).
 * Wired into check:api, alongside the other script tests.
 */

test('the three framework-specific old pages redirect straight into their track, with the base', () => {
  const redirects = buildRedirects()
  assert.equal(redirects['/adapters/react/'], '/riffle/react/')
  assert.equal(redirects['/adapters/vue/'], '/riffle/vue/')
  assert.equal(redirects['/adapters/'], '/riffle/')
  assert.equal(redirects['/migration/'], '/riffle/vue/migration/')
})

test('every framework-neutral old page redirects to /choose/ with a next slug, with the base', () => {
  const redirects = buildRedirects()
  // Precondition: the neutral map actually lists these ten old pages (none silently dropped).
  assert.equal(NEUTRAL_REDIRECTS.length, 10)
  assert.equal(redirects['/getting-started/'], '/riffle/choose/?next=getting-started')
  // Guides moved under guides/ in the tracks, so the old top-level guide
  // slugs must redirect to the slug that actually exists there now, not the
  // stale top-level one (which would only ever fall back to the overview).
  assert.equal(redirects['/concepts/'], '/riffle/choose/?next=guides/concepts')
  assert.equal(redirects['/gestures/'], '/riffle/choose/?next=guides/gestures')
  assert.equal(redirects['/layouts/'], '/riffle/choose/?next=guides/layouts')
  assert.equal(redirects['/accessibility/'], '/riffle/choose/?next=guides/accessibility')
  assert.equal(redirects['/examples/'], '/riffle/choose/?next=examples')
  assert.equal(
    redirects['/recipes/clamp-with-controls/'],
    '/riffle/choose/?next=recipes/clamp-with-controls',
  )
  assert.equal(redirects['/recipes/forms-in-cards/'], '/riffle/choose/?next=recipes/forms-in-cards')
  assert.equal(redirects['/recipes/infinite-feed/'], '/riffle/choose/?next=recipes/infinite-feed')
  assert.equal(
    redirects['/recipes/programmatic-control/'],
    '/riffle/choose/?next=recipes/programmatic-control',
  )
})

test('an api redirect map is merged in, with the base added to destinations that lack it', () => {
  const redirects = buildRedirects({
    apiRedirects: {
      '/api/core/functions/createRiffle/': '/vanilla/api/functions/createRiffle/',
      '/api/react/functions/useRiffle/': '/riffle/react/api/functions/useRiffle/',
    },
  })
  assert.equal(
    redirects['/api/core/functions/createRiffle/'],
    '/riffle/vanilla/api/functions/createRiffle/',
  )
  // Already-based destinations are not double-prefixed.
  assert.equal(
    redirects['/api/react/functions/useRiffle/'],
    '/riffle/react/api/functions/useRiffle/',
  )
})

test('a custom base is honoured instead of the hardcoded default', () => {
  const redirects = buildRedirects({ base: '/preview' })
  assert.equal(redirects['/adapters/react/'], '/preview/react/')
  assert.equal(redirects['/getting-started/'], '/preview/choose/?next=getting-started')
})

test('loadApiRedirects returns an empty map when the file does not exist yet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'api-redirects-'))
  try {
    assert.deepEqual(loadApiRedirects(join(dir, 'missing.json')), {})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('loadApiRedirects parses the file when it does exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'api-redirects-'))
  try {
    const file = join(dir, 'api-redirects.json')
    const map = { '/api/vue/functions/useRiffle/': '/vue/api/functions/useRiffle/' }
    writeFileSync(file, JSON.stringify(map))
    // Precondition: the fixture file actually landed on disk before reading it back.
    assert.deepEqual(loadApiRedirects(file), map)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
