#!/usr/bin/env node
/**
 * Encodes the raw recording capture.spec.ts produces into the two checked-in
 * hero assets: media/hero.webm (re-encoded for size, not just copied) and
 * media/hero.gif (palette-based, so a small file still looks clean rather
 * than banded). Run by `pnpm capture` (root package.json) right after
 * `pnpm --filter @rpxl/riffle-e2e run capture`, never standalone: it always
 * picks up whatever capture.spec.ts most recently wrote under
 * e2e/.capture-output/video/.
 *
 * Requires ffmpeg on PATH. If it is missing, this says so and stops rather
 * than silently producing nothing, and the error message it prints names a
 * fallback (gifski via npx, or a documented manual ffmpeg command) for a
 * machine that does not have ffmpeg; this repo's own CI and dev machines do.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const videoDir = join(repoRoot, 'e2e/.capture-output/video')
const mediaDir = join(repoRoot, 'media')
const webmOut = join(mediaDir, 'hero.webm')
const gifOut = join(mediaDir, 'hero.gif')
const palettePath = join(repoRoot, 'e2e/.capture-output/hero-palette.png')

const MAX_BYTES = 3 * 1024 * 1024

function findLatestRawVideo() {
  if (!existsSync(videoDir)) return null
  const candidates = readdirSync(videoDir)
    .filter((name) => name.endsWith('.webm'))
    .map((name) => {
      const full = join(videoDir, name)
      return { full, mtime: statSync(full).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
  return candidates[0]?.full ?? null
}

function checkFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function main() {
  if (!checkFfmpeg()) {
    console.error(
      'encode-hero: ffmpeg is not on PATH. Install it (e.g. `brew install ffmpeg`), or encode ' +
        'by hand: `ffmpeg -i <raw.webm> -vf scale=760:-1 -b:v 1M media/hero.webm`, then a ' +
        'palette-based GIF (`ffmpeg -i media/hero.webm -vf "fps=15,scale=480:-1:flags=lanczos,' +
        'split[a][b];[a]palettegen[p];[b][p]paletteuse" media/hero.gif`), or `npx gifski` ' +
        'against a PNG frame sequence.',
    )
    process.exit(1)
  }

  const rawVideo = findLatestRawVideo()
  if (!rawVideo) {
    console.error(
      `encode-hero: no recording found under ${videoDir}. Run \`pnpm --filter @rpxl/riffle-e2e run capture\` first.`,
    )
    process.exit(1)
  }
  console.log(`Encoding from ${rawVideo}`)

  mkdirSync(mediaDir, { recursive: true })

  // WebM: re-encoded (not copied) at a bitrate sized to comfortably clear
  // the 3 MB budget for a 6-10s clip, scaled to the recording's own width
  // (760, capture.spec.ts's viewport) since it is already the target crop.
  // `-ss 0.12` (before `-i`, so ffmpeg seeks rather than decodes-and-drops)
  // trims the recording's own first couple of frames: capture.spec.ts's
  // warm-up navigation gets real content on screen by the time the
  // recorded page's own first frame lands, but the very first frame or two
  // is still the recorder's own black initialization frame, confirmed
  // directly by extracting PNG frames from an untrimmed encode.
  execFileSync('ffmpeg', [
    '-y',
    '-ss',
    '0.12',
    '-i',
    rawVideo,
    '-vf',
    'scale=760:-2',
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '900k',
    '-an',
    webmOut,
  ])

  // GIF: a two-pass palette (palettegen/paletteuse), the standard way to
  // keep a small GIF from banding, at a reduced frame rate and width: a GIF
  // has no real inter-frame compression the way VP9 does, so it needs a
  // smaller frame to hit the same budget.
  execFileSync('ffmpeg', [
    '-y',
    '-i',
    webmOut,
    '-vf',
    'fps=12,scale=480:-2:flags=lanczos,palettegen',
    palettePath,
  ])
  execFileSync('ffmpeg', [
    '-y',
    '-i',
    webmOut,
    '-i',
    palettePath,
    '-filter_complex',
    'fps=12,scale=480:-2:flags=lanczos[x];[x][1:v]paletteuse',
    gifOut,
  ])

  for (const [label, path] of [
    ['hero.webm', webmOut],
    ['hero.gif', gifOut],
  ]) {
    const size = statSync(path).size
    const mb = (size / (1024 * 1024)).toFixed(2)
    console.log(`${label}: ${mb} MB`)
    if (size > MAX_BYTES) {
      console.error(`encode-hero: ${label} is ${mb} MB, over the 3 MB budget.`)
      process.exit(1)
    }
  }
}

main()
