import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Tests run against this same package's own source, so the dev loop and
    // CI need no prebuild. The published build still imports the engine by
    // name (see tsup.config.ts, where it is external).
    alias: { '@rpxl/riffle': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    name: 'vue',
    // ssr.test.ts overrides this to 'node' itself via a
    // `// @vitest-environment node` comment at the top of the file.
    environment: 'happy-dom',
    include: ['tests/vue/**/*.test.ts'],
  },
})
