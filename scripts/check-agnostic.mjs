#!/usr/bin/env node
/**
 * Proves the engine entry is framework free, and that the React and Vue
 * entries import that engine rather than bundle a second copy of it, rather
 * than asserting either in a README.
 *
 * "Framework free" means nothing imports a framework. This matches actual
 * import, export...from, dynamic import(), and require() specifiers naming a
 * framework package (or a subpath of one) in the engine entry, rather than
 * grepping for the bare word: the engine's own shipped comments explain
 * React's `useSyncExternalStore` contract, and a bare-word grep would trip
 * on that documentation even though nothing is imported.
 *
 * "Imports the engine, never bundles it" matches the React and Vue entries
 * (dist/react/**, dist/vue/**) against createRiffle's own declaration
 * signature: a file that imports the engine has a reference to the name,
 * never the function body that defines it. A bundled copy would duplicate
 * engine state for any consumer who also imports the engine directly (two
 * module registries, an adapter's RiffleError that fails `instanceof`
 * against the engine's own).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST_DIR = 'packages/core/dist'
const ADAPTER_DIRS = ['react', 'vue']

const FORBIDDEN = ['react', 'react-dom', 'vue', 'svelte', 'solid-js']

// Matches the specifier string in:
//   import x from 'spec'      export x from 'spec'      export * from 'spec'
//   import 'spec'              import('spec')             require('spec')
const SPECIFIER_RE = /\b(?:import\s*\(\s*|require\s*\(\s*|from\s+|import\s+)['"]([^'"]+)['"]/g

const ENGINE_IMPORT_SPECIFIER = '@rpxl/riffle'
// createRiffle's own declaration signature, present only in the file that
// defines it, never in a file that merely imports the name.
const ENGINE_DEFINITION_MARKER = 'function createRiffle(container'

function isForbidden(specifier) {
  return FORBIDDEN.some((name) => specifier === name || specifier.startsWith(`${name}/`))
}

function isAdapterFile(file) {
  return ADAPTER_DIRS.some((dir) => file.startsWith(`${join(DIST_DIR, dir)}/`))
}

function walk(dir) {
  let files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) files = files.concat(walk(full))
    else files.push(full)
  }
  return files
}

let allFiles
try {
  allFiles = walk(DIST_DIR)
} catch {
  console.error(`Could not read ${DIST_DIR}. Run the build before this gate.`)
  process.exit(1)
}

const engineFiles = allFiles.filter((file) => !isAdapterFile(file))
const adapterCodeFiles = allFiles.filter(
  (file) =>
    isAdapterFile(file) &&
    (file.endsWith('.js') ||
      file.endsWith('.cjs') ||
      file.endsWith('.d.ts') ||
      file.endsWith('.d.cts')),
)

const failures = []

for (const file of engineFiles) {
  const content = readFileSync(file, 'utf8')
  let match
  SPECIFIER_RE.lastIndex = 0
  while ((match = SPECIFIER_RE.exec(content))) {
    const specifier = match[1]
    if (isForbidden(specifier)) {
      failures.push(`${file}: imports "${specifier}"`)
    }
  }
}

if (failures.length > 0) {
  console.error(
    'Framework reference found in the engine entry. @rpxl/riffle must stay framework agnostic.',
  )
  for (const failure of failures) {
    console.error(failure)
  }
  process.exit(1)
}

const inlineFailures = []

for (const file of adapterCodeFiles) {
  const content = readFileSync(file, 'utf8')
  if (content.includes(ENGINE_DEFINITION_MARKER)) {
    inlineFailures.push(
      `${file}: contains the engine's own createRiffle definition (bundled, not imported)`,
    )
    continue
  }
  if (
    (file.endsWith('.js') || file.endsWith('.cjs')) &&
    !content.includes(ENGINE_IMPORT_SPECIFIER)
  ) {
    inlineFailures.push(`${file}: does not import "${ENGINE_IMPORT_SPECIFIER}"`)
  }
}

if (inlineFailures.length > 0) {
  console.error(
    'The React or Vue entry bundles the engine instead of importing it from "@rpxl/riffle".',
  )
  for (const failure of inlineFailures) {
    console.error(failure)
  }
  process.exit(1)
}

console.log('agnostic check passed')
