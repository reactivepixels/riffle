/**
 * Finds server-rendered islands that rendered nothing.
 *
 * When a framework component throws during the static build, Astro logs the
 * error and still writes the page, with that island's markup left empty, and
 * the build exits 0. The island then renders on the client instead, so the
 * page looks fine in a browser and every e2e spec passes, while the page that
 * ships has no server-rendered stack (and a real bug went unreported). This
 * is what catches it: every `<astro-island ssr>` in the built site must
 * contain markup. Client-only islands carry no `ssr` attribute and are
 * skipped.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ISLAND = /<astro-island\b([^>]*)>([\s\S]*?)<\/astro-island>/g
const SSR_ATTRIBUTE = /\sssr(?=[\s=]|$)/
// Astro's own end marker and slot templates are not rendered output.
const NOT_OUTPUT = /<!--astro:end-->|<template\b[^>]*>[\s\S]*?<\/template>|\s/g

/**
 * @param {string} html
 * @returns {{ islands: number, empty: string[] }} `empty` holds each empty
 *   island's `component-url`, or `(unknown)`.
 */
export function findEmptyIslands(html) {
  let islands = 0
  const empty = []
  for (const [, attributes, inner] of html.matchAll(ISLAND)) {
    if (!SSR_ATTRIBUTE.test(attributes)) continue
    islands += 1
    if (inner.replace(NOT_OUTPUT, '') === '') {
      empty.push(/component-url="([^"]*)"/.exec(attributes)?.[1] ?? '(unknown)')
    }
  }
  return { islands, empty }
}

/** @param {string} dir @returns {string[]} */
function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return htmlFiles(path)
    return name.endsWith('.html') ? [path] : []
  })
}

/**
 * @param {string} distDir
 * @returns {{ pages: number, islands: number, empty: { page: string, component: string }[] }}
 */
export function checkBuiltIslands(distDir) {
  const files = htmlFiles(distDir)
  let islands = 0
  const empty = []
  for (const file of files) {
    const result = findEmptyIslands(readFileSync(file, 'utf8'))
    islands += result.islands
    for (const component of result.empty) empty.push({ page: relative(distDir, file), component })
  }
  return { pages: files.length, islands, empty }
}
