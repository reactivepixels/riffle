import { createRiffle, type Riffle } from '@rpxl/riffle'
import { waypointGradient, waypoints } from './waypoints'
import './app.css'

const CARD_WIDTH_DESKTOP = 220
const CARD_HEIGHT_DESKTOP = 300
const CARD_WIDTH_MOBILE = 150
const CARD_HEIGHT_MOBILE = 204
const MOBILE_QUERY = '(max-width: 520px)'

function cardSize(mobile: boolean): { width: number; height: number } {
  return mobile
    ? { width: CARD_WIDTH_MOBILE, height: CARD_HEIGHT_MOBILE }
    : { width: CARD_WIDTH_DESKTOP, height: CARD_HEIGHT_DESKTOP }
}

// Module scope, so the engine sees the same function for the life of the
// instance.
const getLabel = (index: number) => waypoints[index]?.name ?? ''

/**
 * Builds a clamped stack of five invented trail waypoints inside `el`.
 * Mirrors examples/vue-clamp-controls/src/App.vue: `bounds: 'clamp'`, and
 * prev/next buttons that are genuinely `disabled` (not just styled) at the
 * ends, read from `riffle.getSnapshot().canPrev`/`canNext` via
 * `riffle.subscribe`, the same discrete state a `canPrev`/`canNext` computed
 * ref reads from in the Vue original.
 */
export function mount(el: HTMLElement): () => void {
  el.innerHTML = ''

  const page = document.createElement('main')
  page.className = 'recipe-clamp'

  const stage = document.createElement('div')
  stage.className = 'stage'
  const stack = document.createElement('div')
  stack.className = 'stack'
  stack.setAttribute('aria-label', 'Waypoints')
  stack.style.display = 'grid'
  stage.appendChild(stack)
  page.appendChild(stage)

  const controls = document.createElement('div')
  controls.className = 'controls'
  const prevButton = document.createElement('button')
  prevButton.type = 'button'
  prevButton.className = 'control'
  prevButton.setAttribute('aria-label', 'Previous waypoint')
  prevButton.innerHTML = '<span aria-hidden="true">&#8249;</span>'
  const readout = document.createElement('span')
  readout.className = 'readout'
  readout.setAttribute('data-testid', 'readout')
  const nextButton = document.createElement('button')
  nextButton.type = 'button'
  nextButton.className = 'control'
  nextButton.setAttribute('aria-label', 'Next waypoint')
  nextButton.setAttribute('data-testid', 'next-button')
  nextButton.innerHTML = '<span aria-hidden="true">&#8250;</span>'
  controls.appendChild(prevButton)
  controls.appendChild(readout)
  controls.appendChild(nextButton)
  page.appendChild(controls)

  el.appendChild(page)

  const mql = window.matchMedia(MOBILE_QUERY)
  let { width, height } = cardSize(mql.matches)

  const cardFaces: HTMLElement[] = []
  const cards: HTMLElement[] = []

  waypoints.forEach((waypoint) => {
    const card = document.createElement('div')
    card.className = 'card'
    card.style.gridArea = '1 / 1'

    const face = document.createElement('div')
    face.className = 'card-face'
    face.style.width = `${width}px`
    face.style.height = `${height}px`
    face.style.background = waypointGradient(waypoint)

    const scrim = document.createElement('div')
    scrim.className = 'card-scrim'

    const text = document.createElement('div')
    text.className = 'card-text'
    text.setAttribute('aria-hidden', 'true')
    const nameSpan = document.createElement('span')
    nameSpan.className = 'card-name'
    nameSpan.textContent = waypoint.name
    const elevationSpan = document.createElement('span')
    elevationSpan.className = 'card-elevation'
    elevationSpan.textContent = waypoint.elevation
    text.appendChild(nameSpan)
    text.appendChild(elevationSpan)

    face.appendChild(scrim)
    face.appendChild(text)
    card.appendChild(face)
    stack.appendChild(card)
    cardFaces.push(face)
    cards.push(card)
  })

  // #region disabled-controls
  const riffle: Riffle = createRiffle(stack, {
    count: waypoints.length,
    bounds: 'clamp',
    cardWidth: width,
    cardHeight: height,
    getLabel,
  })
  // #endregion disabled-controls

  cards.forEach((card, index) => riffle.registerNode(index, card))

  function updateReadout(index: number): void {
    readout.textContent = `Card ${index + 1} of ${waypoints.length}`
  }

  // #region disabled-controls
  // Buttons are truly `disabled` at the ends, not just styled: a click, a
  // tap or an Enter key on a disabled button does nothing, and it drops out
  // of the tab order's activation, which a CSS-only affordance never gives
  // you.
  function updateButtons(): void {
    const snapshot = riffle.getSnapshot()
    prevButton.disabled = !snapshot.canPrev
    nextButton.disabled = !snapshot.canNext
  }
  // #endregion disabled-controls

  function onMobileChange(): void {
    const next = cardSize(mql.matches)
    if (next.width === width && next.height === height) return
    width = next.width
    height = next.height
    cardFaces.forEach((face) => {
      face.style.width = `${width}px`
      face.style.height = `${height}px`
    })
    riffle.update({ cardWidth: width, cardHeight: height })
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

  const unsubscribeChange = riffle.on('change', ({ index }) => updateReadout(index))
  const unsubscribeSnapshot = riffle.subscribe(updateButtons)
  updateReadout(riffle.getSnapshot().activeIndex)
  updateButtons()

  return function unmount(): void {
    mql.removeEventListener('change', onMobileChange)
    prevButton.removeEventListener('click', onPrev)
    nextButton.removeEventListener('click', onNext)
    unsubscribeChange()
    unsubscribeSnapshot()
    riffle.destroy()
    el.innerHTML = ''
  }
}

const root = document.getElementById('clamp-recipe-root')
if (root) mount(root)
