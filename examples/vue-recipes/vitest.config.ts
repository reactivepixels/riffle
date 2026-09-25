import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// FormCardsStack.test.ts mounts an actual .vue single-file component
// (unlike packages/core's own Vue tests, which only ever mount plain
// defineComponent/h() definitions), so vitest needs the same Vite plugin
// vite.config.ts uses to compile it. `mergeConfig` combines that
// already-typed config (its own `plugins: [vue()]`, built against this
// workspace's own vite) with the vitest-only fields below, rather than
// passing `plugins` through this file's own `defineConfig` call directly:
// vitest@2.1.9 depends on its own bundled vite@^5 (a plain dependency, not
// a peer), while this workspace's own vite is ^8.3.0, so `@vitejs/plugin-vue`'s
// `Plugin` (built against workspace vite) and the `plugins` field a
// `defineConfig({ plugins: [...] })` call built against vitest's bundled
// vite@5 expects are two structurally different types under this project's
// `exactOptionalPropertyTypes`. Reading vite.config.ts's own, already
// resolved `UserConfig` object sidesteps that overload resolution entirely:
// `mergeConfig` merges two plain values, it does not itself type-check a
// `plugins` array against either vite's or vitest's own `Plugin` type.
export default mergeConfig(
  viteConfig,
  defineConfig({
    // Tests run against the workspace package's own source, so the dev loop
    // and CI need no prebuild of packages/core first, the same reasoning
    // packages/core/vitest.vue.config.ts gives for its own alias. The
    // published build still resolves these by package name.
    resolve: {
      alias: {
        '@rpxl/riffle/vue': fileURLToPath(
          new URL('../../packages/core/src/vue/index.ts', import.meta.url),
        ),
        '@rpxl/riffle': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      },
    },
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts'],
    },
  }),
)
