#!/usr/bin/env node
/**
 * Fails when any server-rendered island in the built docs site is empty,
 * which is what a component that threw during the static build leaves
 * behind: the build logs the error but still exits 0. Run it after
 * `pnpm --filter @rpxl/docs build`; see apps/docs/scripts/lib/built-islands.mjs.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkBuiltIslands } from '../apps/docs/scripts/lib/built-islands.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(here, '../apps/docs/dist')

if (!existsSync(distDir)) {
  console.error(`check-built-islands: ${distDir} does not exist; build the docs site first.`)
  process.exit(1)
}

const { pages, islands, empty } = checkBuiltIslands(distDir)

if (islands === 0) {
  console.error(
    'check-built-islands: found no server-rendered islands at all; the check is not seeing the site.',
  )
  process.exit(1)
}

if (empty.length > 0) {
  console.error(`check-built-islands: ${empty.length} island(s) rendered nothing on the server:`)
  for (const { page, component } of empty) console.error(`  ${page}: ${component}`)
  console.error('The build log has the error each component threw.')
  process.exit(1)
}

console.log(
  `check-built-islands: ${islands} server-rendered island(s) across ${pages} page(s), 0 empty`,
)
