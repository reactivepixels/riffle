#!/usr/bin/env node
/**
 * Fails on an internal-only process reference (a task/brief/spec/plan
 * pointer, a review-round or finding-code citation, a controller/reviewer/
 * implementer role mention) leaking into a tracked file.
 * Planning notes for this repository are kept locally and never published.
 * A comment or test title that cites one of them is meaningless to a
 * contributor who cannot see the document it points at, and reveals an
 * internal process this repository does not otherwise describe. The same
 * gate also rejects tooling names and absolute home-directory paths that
 * only make sense on one maintainer's machine.
 *
 * The pattern itself lives in one place, shared with the docs build's own
 * API-reference gate: see apps/docs/scripts/internal-reference-pattern.mjs
 * and its own doc comment for exactly what it matches, why, and the false
 * positives it was tuned against.
 *
 * Built the same way scripts/check-prose.mjs is: files come from
 * `git ls-files`, so untracked local files and node_modules are never
 * scanned; every tracked file is checked whatever its name or extension,
 * except binary files (a NUL byte in their first 8 KB) and pnpm-lock.yaml.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { findInternalReference } from '../apps/docs/scripts/internal-reference-pattern.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// Files allowed to contain the pattern's own alternatives, with the reason
// each is safe: they define or test the leak pattern itself, quoting its
// alternatives as literal example text, not citing a real internal document.
const ALLOWLIST = new Map([
  [
    'apps/docs/scripts/internal-reference-pattern.mjs',
    'defines the leak pattern; its doc comment and regex source necessarily contain example reference shapes',
  ],
  [
    'apps/docs/scripts/internal-reference-pattern.test.mjs',
    "the pattern's own unit test; its positive/negative case strings are literal example text, not real references",
  ],
])

const SKIPPED = new Set(['pnpm-lock.yaml'])
const BINARY_SNIFF_BYTES = 8192

function trackedFiles() {
  const output = execFileSync('git', ['ls-files'], { cwd: resolve(here, '..'), encoding: 'utf8' })
  return output.split('\n').filter(Boolean)
}

function isBinary(buffer) {
  return buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)
}

const failures = []
const repoRoot = resolve(here, '..')

for (const file of trackedFiles()) {
  if (SKIPPED.has(file)) continue
  if (ALLOWLIST.has(file)) continue

  let buffer
  try {
    buffer = readFileSync(resolve(repoRoot, file))
  } catch {
    // A path git tracks but that is no longer on disk (e.g. staged deletion)
    // has nothing to check.
    continue
  }
  if (isBinary(buffer)) continue
  const content = buffer.toString('utf8')

  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const found = findInternalReference(lines[i])
    if (found !== null) {
      failures.push(`${file}:${i + 1}: ${found}`)
    }
  }
}

if (failures.length > 0) {
  console.error(
    'Found an internal process reference (task/brief/spec/plan/round/finding-code/role ' +
      'mention, a tooling name, or an absolute home-directory path) in a tracked file. State ' +
      'what the code does and why in plain terms instead; ' +
      'see apps/docs/scripts/internal-reference-pattern.mjs for the exact pattern.',
  )
  for (const failure of failures) {
    console.error(failure)
  }
  process.exit(1)
}

console.log('internal-refs check passed')
