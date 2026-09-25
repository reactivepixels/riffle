#!/usr/bin/env node
// Rewrites every README's Size section from size-limit's own measurement, so
// the published number is never hand-typed and can never drift from the
// gate that actually enforces it. Run after `pnpm build`, before a release
// (see RELEASING.md). Updates both this package's own README and the
// monorepo root README, which quotes the same measured number in its own
// landing-page copy, so the two can never say different things.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const readmeTargets = [
  fileURLToPath(new URL('../README.md', import.meta.url)),
  fileURLToPath(new URL('../../../README.md', import.meta.url)),
]

const raw = execFileSync('pnpm', ['exec', 'size-limit', '--json'], {
  cwd: packageRoot,
  encoding: 'utf8',
})
const results = JSON.parse(raw)
const engine = results.find((r) => r.name === 'engine')
if (!engine) {
  throw new Error(
    'update-readme-size: no size-limit result named "engine". Ran `pnpm build` first?',
  )
}

// Matches size-limit's own display convention (decimal kB, 2 decimal places).
const kb = (engine.size / 1000).toFixed(2)

const START = '<!-- size:start -->'
const END = '<!-- size:end -->'
// The blank line after START matches what `pnpm format` (Prettier) itself
// wants around an HTML comment in markdown: confirmed directly, an earlier
// version of this template without it was silently un-formatted by every
// run, one lint failure away from a release that forgot to run `pnpm
// format` afterward.
const section = `${START}\n\n**${kb} kB** minified and gzipped (\`createRiffle\` alone, measured by \`size-limit\`; see \`package.json\`'s \`size-limit\` field for the enforced budget).\n${END}`

for (const readmePath of readmeTargets) {
  const readme = readFileSync(readmePath, 'utf8')
  const markerPattern = new RegExp(`${START}[\\s\\S]*?${END}`)

  let next
  if (markerPattern.test(readme)) {
    next = readme.replace(markerPattern, section)
  } else {
    const heading = '## Size\n\n'
    const insertion = `${heading}${section}\n\n`
    const dividerIndex = readme.indexOf('## Docs')
    next =
      dividerIndex === -1
        ? `${readme.trimEnd()}\n\n${insertion.trimEnd()}\n`
        : readme.slice(0, dividerIndex) + insertion + readme.slice(dividerIndex)
  }

  if (next !== readme) {
    writeFileSync(readmePath, next)
    console.log(`${readmePath} size section updated: ${kb} kB`)
  } else {
    console.log(`${readmePath} size section already up to date: ${kb} kB`)
  }
}
