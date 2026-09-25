import { createRiffle, fan, type Riffle } from '@rpxl/riffle'
import { trackAt, trackGradient, tracks } from './tracks'
import './app.css'

const ROW_WIDTH_DESKTOP = 300
const ROW_WIDTH_MOBILE = 220
// A list-row height, not a poster aspect ratio: this stack fans vertically
// (axis 'y' below), so a narrow viewport only ever needs the row's WIDTH to
// shrink.
const ROW_HEIGHT = 92
const MOBILE_QUERY = '(max-width: 520px)'

function rowWidth(mobile: boolean): number {
  return mobile ? ROW_WIDTH_MOBILE : ROW_WIDTH_DESKTOP
}

// Module scope, so the engine sees the same function for the life of the
// instance.
const getLabel = (index: number) => trackAt(index).title

// Module scope, like getLabel above: one layout object for the life of the
// instance.
// #region vertical
const layout = fan({ offset: -32 })
// #endregion vertical

/**
 * Builds a vertically fanned stack of six invented tracks inside `el`:
 * `axis: 'y'`, `bounds: 'clamp'`, an up/down key hint, and a CSS trick that
 * hides a background row's text through the engine's own `inert` attribute
 * (see app.css's `.recipe-vertical .row[inert] .row-text` rule).
 */
export function mount(el: HTMLElement): () => void {
  el.innerHTML = ''

  const page = document.createElement('main')
  page.className = 'recipe-vertical'

  const stage = document.createElement('div')
  stage.className = 'stage'
  const stack = document.createElement('div')
  stack.className = 'stack'
  stack.setAttribute('aria-label', 'Tracks')
  stack.style.display = 'grid'
  stage.appendChild(stack)
  page.appendChild(stage)

  const meta = document.createElement('div')
  meta.className = 'meta'
  const title = document.createElement('h1')
  title.className = 'title'
  const artist = document.createElement('p')
  artist.className = 'artist'
  meta.appendChild(title)
  meta.appendChild(artist)
  page.appendChild(meta)

  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.innerHTML = 'Focus the stack, then press <kbd>&#8593;</kbd> or <kbd>&#8595;</kbd> to browse'
  page.appendChild(hint)

  const controls = document.createElement('div')
  controls.className = 'controls'
  const prevButton = document.createElement('button')
  prevButton.type = 'button'
  prevButton.className = 'control'
  prevButton.setAttribute('aria-label', 'Previous track')
  prevButton.innerHTML = '<span aria-hidden="true">&#8593;</span>'
  const readout = document.createElement('span')
  readout.className = 'readout'
  readout.setAttribute('data-testid', 'readout')
  const nextButton = document.createElement('button')
  nextButton.type = 'button'
  nextButton.className = 'control'
  nextButton.setAttribute('aria-label', 'Next track')
  nextButton.setAttribute('data-testid', 'next-button')
  nextButton.innerHTML = '<span aria-hidden="true">&#8595;</span>'
  controls.appendChild(prevButton)
  controls.appendChild(readout)
  controls.appendChild(nextButton)
  page.appendChild(controls)

  el.appendChild(page)

  const mql = window.matchMedia(MOBILE_QUERY)
  let width = rowWidth(mql.matches)

  const rowFaces: HTMLElement[] = []
  const rows: HTMLElement[] = []

  tracks.forEach((track) => {
    const row = document.createElement('div')
    row.className = 'row'
    row.style.gridArea = '1 / 1'

    const face = document.createElement('div')
    face.className = 'row-face'
    face.style.width = `${width}px`
    face.style.height = `${ROW_HEIGHT}px`
    face.style.background = trackGradient(track)

    const text = document.createElement('div')
    text.className = 'row-text'
    const titleSpan = document.createElement('span')
    titleSpan.className = 'row-title'
    titleSpan.textContent = track.title
    const artistSpan = document.createElement('span')
    artistSpan.className = 'row-artist'
    artistSpan.textContent = track.artist
    text.appendChild(titleSpan)
    text.appendChild(artistSpan)

    face.appendChild(text)
    row.appendChild(face)
    stack.appendChild(row)
    rowFaces.push(face)
    rows.push(row)
  })

  // #region vertical
  const riffle: Riffle = createRiffle(stack, {
    count: tracks.length,
    axis: 'y',
    bounds: 'clamp',
    layout,
    cardWidth: width,
    cardHeight: ROW_HEIGHT,
    getLabel,
  })
  // #endregion vertical

  rows.forEach((row, index) => riffle.registerNode(index, row))

  function updateMeta(index: number): void {
    const track = trackAt(index)
    title.textContent = track.title
    artist.textContent = track.artist
    readout.textContent = `${index + 1} / ${tracks.length}`
  }

  function onMobileChange(): void {
    const next = rowWidth(mql.matches)
    if (next === width) return
    width = next
    rowFaces.forEach((face) => {
      face.style.width = `${width}px`
    })
    riffle.update({ cardWidth: width })
  }
  mql.addEventListener('change', onMobileChange)

  function onPrev(): void {
    riffle.prev()
  }
  function onNext(): void {
    riffle.next()
  }
  prevButton.addEventListener('click', onPrev)
  nextButton.addEventListener('click', onNext)

  const unsubscribe = riffle.on('change', ({ index }) => updateMeta(index))
  updateMeta(riffle.getSnapshot().activeIndex)

  return function unmount(): void {
    mql.removeEventListener('change', onMobileChange)
    prevButton.removeEventListener('click', onPrev)
    nextButton.removeEventListener('click', onNext)
    unsubscribe()
    riffle.destroy()
    el.innerHTML = ''
  }
}

const root = document.getElementById('vertical-recipe-root')
if (root) mount(root)
