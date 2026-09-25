import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkBuiltIslands, findEmptyIslands } from './built-islands.mjs'

/**
 * Run with `node --test scripts/lib/built-islands.test.mjs` (from apps/docs).
 * Wired into check:api, alongside the other script tests.
 */

const island = (attributes, inner) => `<astro-island ${attributes}>${inner}</astro-island>`

test('a server-rendered island with markup passes', () => {
  const html = island('uid="a" component-url="/A.js" ssr', '<div data-riffle-root>cards</div>')
  assert.deepEqual(findEmptyIslands(html), { islands: 1, empty: [] })
})

test('a server-rendered island that rendered nothing is reported by its component', () => {
  // The shape a build writes when the component threw during prerender.
  const html = island('uid="b" component-url="/_astro/App.js" ssr="" client="load"', '')
  assert.deepEqual(findEmptyIslands(html), { islands: 1, empty: ['/_astro/App.js'] })
})

test('whitespace, the end marker and slot templates do not count as output', () => {
  const inner = '\n  <!--astro:end--> <template data-astro-template>fallback</template>\n'
  assert.deepEqual(findEmptyIslands(island('ssr component-url="/C.js"', inner)).empty, ['/C.js'])
})

test('client-only islands, which never render on the server, are skipped', () => {
  const html = island('uid="d" component-url="/D.js" client="only"', '')
  assert.deepEqual(findEmptyIslands(html), { islands: 0, empty: [] })
})

test('an attribute that merely contains "ssr" is not the ssr flag', () => {
  const html = island('uid="e" data-nossr="x" component-url="/E.js"', '')
  assert.deepEqual(findEmptyIslands(html), { islands: 0, empty: [] })
})

test('checkBuiltIslands walks every page under dist', () => {
  const dist = mkdtempSync(join(tmpdir(), 'built-islands-'))
  try {
    mkdirSync(join(dist, 'vue', 'recipes'), { recursive: true })
    writeFileSync(join(dist, 'index.html'), island('ssr component-url="/Ok.js"', '<p>ok</p>'))
    writeFileSync(
      join(dist, 'vue', 'recipes', 'index.html'),
      island('ssr component-url="/Bad.js"', ''),
    )
    writeFileSync(join(dist, 'notes.txt'), island('ssr component-url="/Ignored.js"', ''))
    assert.deepEqual(checkBuiltIslands(dist), {
      pages: 2,
      islands: 2,
      empty: [{ page: join('vue', 'recipes', 'index.html'), component: '/Bad.js' }],
    })
  } finally {
    rmSync(dist, { recursive: true, force: true })
  }
})
