import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REFRESH_STUBS, stubVueRefreshGlobals, vueRefreshStubs } from './vue-refresh-stubs.mjs'

/**
 * Run with `node --test scripts/lib/vue-refresh-stubs.test.mjs` (from apps/docs).
 * Wired into check:api, alongside the other script tests.
 */

const COMPILED_VUE =
  'import { ref } from "vue";\nvar _s = $RefreshSig$();\nexport default _sfc_main;'

test('a compiled .vue module that calls the refresh globals gets local stubs', () => {
  const out = stubVueRefreshGlobals(COMPILED_VUE, '/x/examples/vue-clamp-controls/src/App.vue')
  assert.equal(out, REFRESH_STUBS + COMPILED_VUE)
  // The stubs sit on the first line, so later lines keep their positions.
  assert.equal(out.split('\n').length, COMPILED_VUE.split('\n').length)
})

test('the stubs resolve the calls the refresh transform emits', () => {
  const run = new Function(
    `${REFRESH_STUBS} const _s = $RefreshSig$(); $RefreshReg$(1, 'A'); return _s(42)`,
  )
  assert.equal(run(), 42)
})

test('.vue ids with a query are matched too', () => {
  assert.notEqual(
    stubVueRefreshGlobals(COMPILED_VUE, '/x/App.vue?vue&type=script&setup=true&lang.ts'),
    null,
  )
})

test('React files and .vue modules without refresh calls are left alone', () => {
  assert.equal(stubVueRefreshGlobals(COMPILED_VUE, '/x/Stack.tsx'), null)
  assert.equal(stubVueRefreshGlobals('export default {}', '/x/App.vue'), null)
  assert.equal(stubVueRefreshGlobals(COMPILED_VUE, '/x/App.vuex'), null)
})

test('the plugin only runs in dev, after the Vue compiler', () => {
  const plugin = vueRefreshStubs()
  assert.equal(plugin.apply, 'serve')
  assert.equal(plugin.enforce, 'post')
  assert.equal(plugin.transform('export default {}', '/x/App.vue'), null)
  assert.deepEqual(plugin.transform(COMPILED_VUE, '/x/App.vue'), {
    code: REFRESH_STUBS + COMPILED_VUE,
    map: null,
  })
})
