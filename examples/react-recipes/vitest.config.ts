import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Tests run against the workspace package's own source, so the dev loop
    // and CI need no prebuild of packages/core first, the same reasoning
    // packages/core/vitest.react.config.ts gives for its own alias. The
    // published build still resolves these by package name.
    alias: {
      '@rpxl/riffle/react': fileURLToPath(
        new URL('../../packages/core/src/react/index.ts', import.meta.url),
      ),
      '@rpxl/riffle': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.tsx'],
  },
})
