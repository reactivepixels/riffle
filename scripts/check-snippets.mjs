#!/usr/bin/env node
//
// Snippet drift gate. Real usage code belongs in a real file, imported into
// a docs page with a `?raw` import (see apps/docs/src/lib/snippets.ts and
// its own doc comment), never retyped by hand into prose: a hand-typed copy
// can drift from the source it was copied from and nothing catches it. This
// fails if any .mdx file under apps/docs/src/content contains a fenced ts,
// tsx, js, jsx or vue code block (or the same languages spelled typescript,
// javascript, mts, cts, mjs or cjs): exactly the languages a docs page could
// plausibly hand-write and let drift. A fence is recognised whether it uses
// backticks or tildes, however indented (a list item's own content, for
// example), and whatever follows the language word on the opening line (an
// attribute string like `title="x"`, which a real syntax highlighter would
// carry): an earlier, stricter, single-form regex was
// missing exactly these three shapes.
//
// bash and sh are always allowed: an install command or a CLI invocation
// has no source file to import from. An untagged fence (```` ``` ```` with
// no language) is allowed too, for the same reason; every install snippet
// on the site is untagged already.
//
// The rare conceptual block, illustrative pseudo-code that was never meant
// to be a real, runnable file, is allowed with an explicit opt-out: an MDX
// comment on the line immediately before the fence, of the form
// `{/` + `* snippet-ok: <reason> ` + `*/}` (written split here only so this
// comment does not close itself). Every opt-out is counted and printed on
// every run, passing or failing, so a growing count stays visible rather
// than silently accumulating.
//
// packages/core/README.md is excluded, explicitly. This gate only ever scans
// .mdx files, and the package README is .md, so the exclusion is redundant
// today; it is listed anyway, by name, so it stays correct if the scan glob
// ever widens to .md. An npm README is read on npmjs.com and GitHub, neither
// of which can resolve a `?raw` import, so its short fenced install/usage
// block is an npm convention, not the kind of drift this gate exists to catch.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// The docs pages, and the framework track templates the build copies into
// them (apps/docs/src/tracks/, see apps/docs/scripts/generate-tracks.mjs):
// the copies are gitignored, so the templates are where a fence would live.
const SCAN_PREFIXES = ['apps/docs/src/content/', 'apps/docs/src/tracks/']
const SCAN_SUFFIX = '.mdx'
const ALLOWED_LANGS = new Set(['bash', 'sh'])
// Every spelling a highlighter accepts for the same languages counts: a
// `typescript` or `mjs` fence drifts exactly like a `ts` or `js` one.
const FORBIDDEN_LANGS = new Set([
  'ts',
  'tsx',
  'typescript',
  'mts',
  'cts',
  'js',
  'jsx',
  'javascript',
  'mjs',
  'cjs',
  'vue',
])
const OPT_OUT_RE = /^\s*\{\/\*\s*snippet-ok:\s*(.+?)\s*\*\/\}\s*$/

// CommonMark (and so MDX) fences with three or more backticks or three or
// more tildes, at any indentation (a list item's nested content, for
// example, indents every one of its lines, fence included), with an
// optional language word followed by anything else on the line (an
// attribute string like `title="x"`, which a fenced block from a real
// syntax highlighter or MDX component often carries). Only the fence
// marker's own run of backticks/tildes and the language word are
// significant here; everything after the language is ignored.
const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})\s*([\w-]*)/

const EXCLUDED = new Set(['packages/core/README.md'])

function trackedFiles() {
  const output = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  return output.split('\n').filter(Boolean)
}

function isScanned(file) {
  return (
    SCAN_PREFIXES.some((prefix) => file.startsWith(prefix)) &&
    file.endsWith(SCAN_SUFFIX) &&
    !EXCLUDED.has(file)
  )
}

/** The nearest preceding non-blank line, or null if the fence opens the file. */
function precedingLine(lines, fenceIndex) {
  for (let i = fenceIndex - 1; i >= 0; i -= 1) {
    if (lines[i].trim() !== '') return lines[i]
  }
  return null
}

function checkFile(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const failures = []
  const optOuts = []

  let i = 0
  while (i < lines.length) {
    const openMatch = lines[i].match(FENCE_OPEN_RE)
    if (!openMatch) {
      i += 1
      continue
    }
    const fenceChar = openMatch[1][0]
    const fenceLength = openMatch[1].length
    const lang = openMatch[2].toLowerCase()
    const openLine = i + 1
    // The closer must use the same fence character (a run of backticks
    // cannot be closed by tildes or vice versa, per CommonMark) and be at
    // least as long as the opener; it may sit at any indentation too, and
    // may carry no language word (a closing fence never has one).
    const closeRe = new RegExp(`^\\s*(${fenceChar}{${fenceLength},})\\s*$`)
    let closeIndex = -1
    for (let j = i + 1; j < lines.length; j += 1) {
      if (closeRe.test(lines[j])) {
        closeIndex = j
        break
      }
    }
    if (closeIndex === -1) {
      failures.push(`${file}:${openLine}: unterminated code fence`)
      break
    }

    if (FORBIDDEN_LANGS.has(lang)) {
      const before = precedingLine(lines, i)
      const optOut = before?.match(OPT_OUT_RE)
      if (optOut) {
        optOuts.push(`${file}:${openLine}: opted out (${lang}): ${optOut[1]}`)
      } else if (!ALLOWED_LANGS.has(lang)) {
        failures.push(
          `${file}:${openLine}: fenced \`${lang}\` block. Move real usage code to a real file ` +
            'and import it with ?raw (see apps/docs/src/lib/snippets.ts), or opt out immediately ' +
            'above the fence with {/* snippet-ok: <reason> */} for genuine conceptual pseudo-code.',
        )
      }
    }

    i = closeIndex + 1
  }

  return { failures, optOuts }
}

const allFailures = []
const allOptOuts = []

for (const file of trackedFiles()) {
  if (!isScanned(file)) continue
  const { failures, optOuts } = checkFile(file)
  allFailures.push(...failures)
  allOptOuts.push(...optOuts)
}

if (allOptOuts.length > 0) {
  console.log(`${allOptOuts.length} snippet opt-out(s):`)
  for (const optOut of allOptOuts) console.log(`  ${optOut}`)
}

if (allFailures.length > 0) {
  console.error(
    `Snippet drift gate failed: ${allFailures.length} fenced code block(s) not sourced from a real file.`,
  )
  for (const failure of allFailures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log('snippets check passed')
