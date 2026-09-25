#!/usr/bin/env node
/**
 * Fails on any internal link in the built docs site that points at nothing:
 * every `<a href>` on every page in apps/docs/dist (body, sidebar, track
 * switcher, landing cards), resolved against its own page and the site's
 * `/riffle` base, and followed through redirect stubs to where it lands.
 * Run it after `pnpm --filter @rpxl/docs build`; see
 * apps/docs/scripts/lib/built-links.mjs for exactly what counts as broken.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkBuiltLinks } from '../apps/docs/scripts/lib/built-links.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(here, '../apps/docs/dist')

if (!existsSync(distDir)) {
  console.error(`check-built-links: ${distDir} does not exist; build the docs site first.`)
  process.exit(1)
}

const { pages, links, broken } = checkBuiltLinks(distDir, { base: '/riffle' })

if (broken.length > 0) {
  console.error(`check-built-links: ${broken.length} broken internal link(s) in ${pages} page(s):`)
  for (const { page, href, reason } of broken) console.error(`  ${page} -> ${href} (${reason})`)
  process.exit(1)
}

console.log(`check-built-links: ${links} internal link(s) across ${pages} page(s), 0 broken`)
