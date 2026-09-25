#!/usr/bin/env node
/**
 * Measures the package's three shipped entries' bundle sizes with
 * size-limit, the same tool and the same `dist/` output that gates
 * `@rpxl/riffle`'s own PR (see packages/core/package.json's `size-limit`
 * field and packages/core/scripts/update-readme-size.mjs, which does the
 * same thing for the core README). The landing page's numbers come from
 * this file's JSON output rather than being typed into index.mdx by hand: a
 * hand-typed number drifts the first time an entry grows or shrinks and
 * nothing would catch it.
 *
 * Both `pnpm --filter @rpxl/docs dev` and `pnpm --filter @rpxl/docs build`
 * run this before Astro starts (see package.json), the same way
 * generate-api.mjs does. Requires the package's `dist/` to already exist
 * (`pnpm --filter @rpxl/riffle build`); a missing dist fails loudly rather
 * than measuring nothing.
 *
 * The output (src/generated/bundle-sizes.json) is not committed: every
 * build regenerates it from the package's actual dist output, so the
 * landing page can never show a stale number.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const outPath = fileURLToPath(new URL('../src/generated/bundle-sizes.json', import.meta.url))
const packageRoot = join(repoRoot, 'packages/core')

/**
 * `@rpxl/riffle`'s package.json declares four size-limit entries: "engine"
 * and "engine + adapter handle" measure the same `dist/index.js`, with the
 * landing page's headline number the engine alone, the same entry the core
 * README's own size badge uses, so the two numbers on the site can never
 * disagree with each other; "react entry" and "vue entry" measure
 * `dist/react/index.js` and `dist/vue/index.js`.
 */
const ENTRIES = [
  { key: 'core', distPath: 'dist/index.js', entryName: 'engine' },
  { key: 'react', distPath: 'dist/react/index.js', entryName: 'react entry' },
  { key: 'vue', distPath: 'dist/vue/index.js', entryName: 'vue entry' },
]

function measureAll() {
  for (const { distPath } of ENTRIES) {
    const distEntry = join(packageRoot, distPath)
    if (!existsSync(distEntry)) {
      console.error(
        `generate-bundle-sizes: packages/core/${distPath} is missing. ` +
          'Run `pnpm --filter @rpxl/riffle build` first.',
      )
      process.exit(1)
    }
  }

  const raw = execFileSync('pnpm', ['exec', 'size-limit', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  const results = JSON.parse(raw)

  return ENTRIES.map(({ key, entryName }) => {
    const entry = results.find((r) => r.name === entryName)
    if (!entry) {
      console.error(
        `generate-bundle-sizes: no size-limit result named "${entryName}". ` +
          `Found: ${results.map((r) => r.name).join(', ')}`,
      )
      process.exit(1)
    }
    return { key, sizeBytes: entry.size, limitBytes: entry.sizeLimit }
  })
}

function main() {
  const sizes = {}
  for (const { key, sizeBytes, limitBytes } of measureAll()) {
    sizes[key] = { sizeBytes, limitBytes }
  }

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(sizes, null, 2) + '\n')
  console.log(
    `generate-bundle-sizes: core ${sizes.core.sizeBytes}B, react ${sizes.react.sizeBytes}B, ` +
      `vue ${sizes.vue.sizeBytes}B (gzip). Wrote ${outPath}`,
  )
}

main()
