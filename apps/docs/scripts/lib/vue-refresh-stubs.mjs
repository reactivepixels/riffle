/**
 * Dev-only fix for running the React and Vue integrations side by side.
 *
 * `@vitejs/plugin-react` turns on `oxc.jsx.refresh` for the dev server and
 * narrows it to React files with `jsxRefreshInclude`. `@vitejs/plugin-vue`
 * (6.0.9) compiles a `<script setup lang="ts">` block by passing the whole
 * dev `oxc` config to `transformWithOxc`, which does not apply that filter.
 * The compiled .vue module then calls `$RefreshSig$()`, a global that only
 * React's refresh preamble defines, so every page with a Vue demo fails in
 * `astro dev` with "$RefreshSig$ is not defined". Production builds never
 * enable refresh, so they are unaffected.
 *
 * A Vue component is never a React refresh boundary, so the calls are
 * harmless once they resolve. This plugin declares module-local no-op
 * stubs in any .vue module that references them. It prepends to the first
 * line without a newline, so only that line's columns shift in the source
 * map.
 */

const VUE_ID = /\.vue(?:\?|$)/
const REFRESH_GLOBALS = /\$Refresh(?:Sig|Reg)\$/

export const REFRESH_STUBS = 'const $RefreshSig$ = () => (type) => type, $RefreshReg$ = () => {};'

/**
 * Returns the stubbed code, or null when the module needs no change.
 * @param {string} code
 * @param {string} id
 * @returns {string | null}
 */
export function stubVueRefreshGlobals(code, id) {
  if (!VUE_ID.test(id) || !REFRESH_GLOBALS.test(code)) return null
  return REFRESH_STUBS + code
}

/** @returns {import('vite').Plugin} */
export function vueRefreshStubs() {
  return {
    name: 'riffle-docs:vue-refresh-stubs',
    apply: 'serve',
    enforce: 'post',
    transform(code, id) {
      const stubbed = stubVueRefreshGlobals(code, id)
      return stubbed === null ? null : { code: stubbed, map: null }
    },
  }
}
