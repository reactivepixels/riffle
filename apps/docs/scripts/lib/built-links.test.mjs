import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { checkBuiltLinks } from './built-links.mjs'

/**
 * Run with `node --test scripts/lib/built-links.test.mjs` (from apps/docs).
 * Each test builds a tiny fake `dist` of its own, shaped like Astro's
 * output: one `index.html` per directory-served page, plus the
 * `<meta http-equiv="refresh">` stubs Astro writes for a static redirect.
 */

let root

before(() => {
  root = mkdtempSync(join(tmpdir(), 'riffle-built-links-'))
})

after(() => {
  rmSync(root, { recursive: true, force: true })
})

let fixtureCount = 0
function fixture(files) {
  fixtureCount += 1
  const dist = join(root, `dist-${fixtureCount}`)
  for (const [rel, html] of Object.entries(files)) {
    const full = join(dist, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, html)
  }
  return dist
}

const page = (body) => `<!doctype html><html><body>${body}</body></html>`
const stub = (to) =>
  `<!doctype html><title>Redirecting to: ${to}</title><meta http-equiv="refresh" content="0;url=${to}"><body><a href="${to}">Redirecting</a></body>`

test('absolute links to pages that exist pass, with a real link count', () => {
  const dist = fixture({
    'index.html': page('<a href="/riffle/react/">React</a> <a href="https://example.com/">x</a>'),
    'react/index.html': page('<a href="/riffle/">home</a> <a href="#install">here</a>'),
  })
  const result = checkBuiltLinks(dist)
  assert.equal(result.pages, 2)
  // Precondition: both internal links were seen; the external one and the
  // bare fragment were not counted.
  assert.equal(result.links, 2)
  assert.deepEqual(result.broken, [])
})

test('a relative link is resolved against its own page, the way a browser resolves it', () => {
  // The API reference's old bug: a page served as a directory resolves
  // `../interfaces/x` one level too deep.
  const dist = fixture({
    'react/api/functions/useriffle/index.html': page(
      '<a href="../interfaces/rifflehandle">bad</a> <a href="../../interfaces/rifflehandle/">good</a>',
    ),
    'react/api/interfaces/rifflehandle/index.html': page('ok'),
  })
  const { broken } = checkBuiltLinks(dist)
  assert.deepEqual(broken, [
    {
      page: '/riffle/react/api/functions/useriffle/',
      href: '../interfaces/rifflehandle',
      reason: 'no such page in dist',
    },
  ])
})

test('a link outside the base path is broken, since the site only serves under it', () => {
  // dist/react/index.html exists, but is served at /riffle/react/, never at
  // /react/: a link missing the base is broken even though the file is there.
  const dist = fixture({
    'index.html': page('<a href="/react/">no base</a> <a href="/riffle/react/">based</a>'),
    'react/index.html': page('react'),
  })
  const { links, broken } = checkBuiltLinks(dist)
  assert.equal(links, 2)
  assert.deepEqual(
    broken.map((b) => b.href),
    ['/react/'],
  )
})

test('a query string is ignored when looking the page up', () => {
  const dist = fixture({
    'index.html': page('<a href="/riffle/react/?tab=vite">react</a>'),
    'react/index.html': page('react'),
  })
  const result = checkBuiltLinks(dist)
  assert.equal(result.links, 1)
  assert.deepEqual(result.broken, [])
})

test("a /choose/ link's `next` must name a page some track has", () => {
  const dist = fixture({
    'index.html': page(
      '<a href="/riffle/choose/?next=guides/gestures">ok</a> ' +
        '<a href="/riffle/choose/?next=guides/gesture">typo</a> ' +
        '<a href="/riffle/choose/">no next</a>',
    ),
    'choose/index.html': page('choose'),
    'vue/guides/gestures/index.html': page('gestures'),
  })
  const { links, broken } = checkBuiltLinks(dist)
  assert.equal(links, 3)
  assert.deepEqual(broken, [
    {
      page: '/riffle/',
      href: '/riffle/choose/?next=guides/gesture',
      reason: '?next=guides/gesture names a page no track has',
    },
  ])
})

test('a redirect stub counts as present only when its own target exists', () => {
  const dist = fixture({
    'index.html': page('<a href="/riffle/old/">old</a> <a href="/riffle/gone/">gone</a>'),
    'old/index.html': stub('/riffle/new/'),
    'new/index.html': page('new'),
    'gone/index.html': stub('/riffle/missing/'),
  })
  const { broken } = checkBuiltLinks(dist)
  // The stub's own `<a href>` to its missing target is reported as well,
  // from the stub page itself.
  assert.deepEqual(broken.map((b) => `${b.page} ${b.href} ${b.reason}`).sort(), [
    '/riffle/ /riffle/gone/ redirects to /riffle/missing/, which does not exist',
    '/riffle/gone/ /riffle/missing/ no such page in dist',
  ])
})

test('a redirect chain is followed to its end, and a loop is reported', () => {
  const dist = fixture({
    'index.html': page('<a href="/riffle/a/">a</a> <a href="/riffle/loop1/">loop</a>'),
    'a/index.html': stub('/riffle/b/'),
    'b/index.html': stub('/riffle/c/'),
    'c/index.html': page('c'),
    'loop1/index.html': stub('/riffle/loop2/'),
    'loop2/index.html': stub('/riffle/loop1/'),
  })
  const fromHome = checkBuiltLinks(dist).broken.filter((b) => b.page === '/riffle/')
  assert.deepEqual(
    fromHome.map((b) => `${b.href} ${b.reason}`),
    ['/riffle/loop1/ redirect loop through /riffle/loop1/'],
  )
})
