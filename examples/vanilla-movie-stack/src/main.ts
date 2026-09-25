import { createRiffle, type Riffle } from '@rpxl/riffle'
import { filmAt, films, posterGradient } from './films'
import './app.css'

const POSTER_WIDTH_DESKTOP = 220
const POSTER_HEIGHT_DESKTOP = 330
const POSTER_WIDTH_MOBILE = 150
const POSTER_HEIGHT_MOBILE = 225
// Matches app.css's own `@media (max-width: 520px)` breakpoint. The poster's
// own box is set inline below (the engine measures cardWidth/cardHeight as
// plain numbers, and an inline style is what sizes .poster-face), so
// shrinking it at narrow widths needs this same breakpoint read in JS, not
// CSS alone.
const MOBILE_QUERY = '(max-width: 520px)'

function posterSize(mobile: boolean): { width: number; height: number } {
  return mobile
    ? { width: POSTER_WIDTH_MOBILE, height: POSTER_HEIGHT_MOBILE }
    : { width: POSTER_WIDTH_DESKTOP, height: POSTER_HEIGHT_DESKTOP }
}

// Module scope, so the engine sees the same function for the life of the
// instance.
const getLabel = (index: number) => filmAt(index).title

/**
 * Builds the fanned poster stack inside `el` and wires it to a Riffle
 * instance, with plain DOM calls and `createRiffle` directly: eight films,
 * prev and next buttons, and posters that shrink at phone widths.
 */
export function mount(el: HTMLElement): () => void {
  el.innerHTML = ''

  const page = document.createElement('main')
  // The single scoping class every rule in app.css is nested under, so this
  // module's CSS can never leak onto, or be leaked onto by, unrelated markup
  // when it is imported and mounted elsewhere (see app.css's own comment).
  page.className = 'vms-root'

  const stage = document.createElement('div')
  stage.className = 'stage'

  const stack = document.createElement('div')
  stack.className = 'stack'
  stack.setAttribute('aria-label', 'Films')
  // Stacks every poster in one grid cell (each poster sets `gridArea` below);
  // the engine then positions them with transforms.
  stack.style.display = 'grid'
  stage.appendChild(stack)
  page.appendChild(stage)

  const meta = document.createElement('div')
  meta.className = 'meta'
  const title = document.createElement('h1')
  title.className = 'title'
  const year = document.createElement('p')
  year.className = 'year'
  meta.appendChild(title)
  meta.appendChild(year)
  page.appendChild(meta)

  const controls = document.createElement('div')
  controls.className = 'controls'

  const prevButton = document.createElement('button')
  prevButton.type = 'button'
  prevButton.className = 'control'
  prevButton.setAttribute('aria-label', 'Previous film')
  prevButton.innerHTML = '<span aria-hidden="true">&#8249;</span>'

  const readout = document.createElement('span')
  readout.className = 'readout'
  readout.setAttribute('data-testid', 'readout')

  const nextButton = document.createElement('button')
  nextButton.type = 'button'
  nextButton.className = 'control'
  nextButton.setAttribute('aria-label', 'Next film')
  nextButton.setAttribute('data-testid', 'next-button')
  nextButton.innerHTML = '<span aria-hidden="true">&#8250;</span>'

  controls.appendChild(prevButton)
  controls.appendChild(readout)
  controls.appendChild(nextButton)
  page.appendChild(controls)

  el.appendChild(page)

  const mql = window.matchMedia(MOBILE_QUERY)
  let { width: posterWidth, height: posterHeight } = posterSize(mql.matches)

  const posterFaces: HTMLElement[] = []
  const posters: HTMLElement[] = []

  films.forEach((film) => {
    const poster = document.createElement('div')
    poster.className = 'poster'
    // The card's own grid cell; see the comment on `stack.style.display` above.
    poster.style.gridArea = '1 / 1'

    const face = document.createElement('div')
    face.className = 'poster-face'
    face.style.width = `${posterWidth}px`
    face.style.height = `${posterHeight}px`
    face.style.background = posterGradient(film)

    const scrim = document.createElement('div')
    scrim.className = 'poster-scrim'

    const text = document.createElement('div')
    text.className = 'poster-text'
    text.setAttribute('aria-hidden', 'true')
    const titleSpan = document.createElement('span')
    titleSpan.className = 'poster-title'
    titleSpan.textContent = film.title
    const yearSpan = document.createElement('span')
    yearSpan.className = 'poster-year'
    yearSpan.textContent = String(film.year)
    text.appendChild(titleSpan)
    text.appendChild(yearSpan)

    face.appendChild(scrim)
    face.appendChild(text)
    poster.appendChild(face)
    stack.appendChild(poster)
    posterFaces.push(face)
    posters.push(poster)
  })

  const riffle: Riffle = createRiffle(stack, {
    count: films.length,
    cardWidth: posterWidth,
    cardHeight: posterHeight,
    getLabel,
  })

  posters.forEach((poster, index) => riffle.registerNode(index, poster))

  function updateMeta(index: number): void {
    const film = filmAt(index)
    title.textContent = film.title
    year.textContent = String(film.year)
    readout.textContent = `${index + 1} / ${films.length}`
  }

  function onMobileChange(): void {
    const next = posterSize(mql.matches)
    if (next.width === posterWidth && next.height === posterHeight) return
    posterWidth = next.width
    posterHeight = next.height
    posterFaces.forEach((face) => {
      face.style.width = `${posterWidth}px`
      face.style.height = `${posterHeight}px`
    })
    riffle.update({ cardWidth: posterWidth, cardHeight: posterHeight })
  }

  mql.addEventListener('change', onMobileChange)

  // #region essentials
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
  // #endregion essentials
}

const root = document.getElementById('vanilla-movie-stack-root')
if (root) mount(root)
