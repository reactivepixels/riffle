#!/usr/bin/env node
/**
 * Runs prettier over exactly the files git considers part of the working
 * tree: tracked files plus untracked ones that no ignore rule excludes
 * (`git ls-files --cached --others --exclude-standard`). That honours
 * `.gitignore` and each clone's own `.git/info/exclude`, so local-only files
 * a maintainer keeps out of history are never checked or rewritten, without
 * this repository having to name them anywhere. `.prettierignore` still
 * applies on top, for tracked files prettier should leave alone
 * (pnpm-lock.yaml, generated output).
 *
 * `prettier --ignore-path .git/info/exclude` cannot do this: prettier
 * resolves an ignore file's patterns relative to that file's own directory,
 * so a pattern in `.git/info/exclude` would only ever match paths under
 * `.git/info/`.
 *
 * Usage: `node scripts/prettier-files.mjs --check` or `--write`.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const mode = process.argv[2]
if (mode !== '--check' && mode !== '--write') {
  console.error('Usage: node scripts/prettier-files.mjs --check | --write')
  process.exit(2)
}

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter(Boolean)
  // A tracked file deleted from the working tree but not yet staged is still
  // listed; there is nothing on disk to format.
  .filter((file) => existsSync(file))

const prettierBin = createRequire(import.meta.url).resolve('prettier/bin/prettier.cjs')

// Batched so a large tree never exceeds the platform's argument length limit.
const BATCH = 400
let failed = false
for (let i = 0; i < files.length; i += BATCH) {
  const batch = files.slice(i, i + BATCH)
  const result = spawnSync(process.execPath, [prettierBin, mode, '--ignore-unknown', ...batch], {
    stdio: 'inherit',
  })
  if (result.status !== 0) failed = true
}

process.exit(failed ? 1 : 0)
