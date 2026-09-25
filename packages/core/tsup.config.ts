import { defineConfig } from 'tsup'

// tsup runs every config in this array concurrently, not in sequence, so a
// `clean: true` on any one of them races the other two writing into the same
// `dist/`. None of the three configs below cleans; the `build` script wipes
// `dist/` once, up front, before tsup starts (see package.json).
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    treeshake: true,
    sourcemap: true,
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
  },
  {
    entry: { 'react/index': 'src/react/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    external: ['@rpxl/riffle', 'react', 'react-dom'],
    // Every export is a hook or a client component, so frameworks with React
    // Server Components (such as the Next.js App Router) can import the package
    // from a server component without a wrapper file of their own.
    banner: { js: "'use client'" },
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
  },
  {
    entry: { 'vue/index': 'src/vue/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    treeshake: true,
    sourcemap: true,
    external: ['@rpxl/riffle', 'vue'],
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
  },
])
