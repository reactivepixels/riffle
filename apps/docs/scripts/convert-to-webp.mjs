#!/usr/bin/env node
/**
 * Converts one PNG to a small `.webp`, then deletes the PNG. A tiny,
 * separate script rather than inlined in
 * e2e/scripts/generate-example-screenshots.mjs: that script imports
 * `@playwright/test`, resolved from e2e's own node_modules by Node's
 * ordinary "walk up from the importing file" rule, and `sharp` is a
 * dependency of apps/docs, not of e2e. Rather than add `sharp` to e2e just
 * for this, the screenshot script shells out to this file (run with `pnpm
 * --filter @rpxl/docs exec node scripts/convert-to-webp.mjs <in.png>
 * <out.webp>`), whose own location resolves `sharp` correctly.
 */
import { rm } from 'node:fs/promises'
import sharp from 'sharp'

const [, , inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  console.error('Usage: convert-to-webp.mjs <input.png> <output.webp>')
  process.exit(1)
}

await sharp(inputPath).webp({ quality: 82 }).toFile(outputPath)
await rm(inputPath)
console.log(`convert-to-webp: wrote ${outputPath}`)
