#!/usr/bin/env node
/**
 * Em and en dashes read as machine written. Fails, listing the file and line,
 * if either appears in any tracked, human-editable file.
 *
 * Built from code points rather than typed literally, so this file can never
 * match itself, and works on macOS, which has no `grep -P`.
 *
 * Files come from `git ls-files` rather than a filesystem walk, so untracked
 * local files and `node_modules` are never scanned. Every tracked file is
 * checked, whatever its name or extension (LICENSE, .nvmrc and the like
 * included), except binary files, recognised by a NUL byte in their first
 * 8 KB, and pnpm-lock.yaml, which is generated.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const EM_DASH = String.fromCharCode(0x2014)
const EN_DASH = String.fromCharCode(0x2013)

const SKIPPED = new Set(['pnpm-lock.yaml'])
const BINARY_SNIFF_BYTES = 8192

function trackedFiles() {
  const output = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  return output.split('\n').filter(Boolean)
}

function isBinary(buffer) {
  return buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)
}

const failures = []

for (const file of trackedFiles()) {
  if (SKIPPED.has(file)) continue

  let buffer
  try {
    buffer = readFileSync(file)
  } catch {
    // A path git tracks but that is no longer on disk (e.g. staged deletion)
    // has nothing to check.
    continue
  }
  if (isBinary(buffer)) continue
  const content = buffer.toString('utf8')

  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes(EM_DASH) || line.includes(EN_DASH)) {
      failures.push(`${file}:${i + 1}: ${line.trim()}`)
    }
  }
}

if (failures.length > 0) {
  console.error(
    'Found an em dash or en dash in public text. Use a comma, a colon, parentheses, or two sentences.',
  )
  for (const failure of failures) {
    console.error(failure)
  }
  process.exit(1)
}

console.log('prose check passed')
