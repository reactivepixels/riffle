import { createRiffle, type Riffle } from '@rpxl/riffle'
import { filmAt, films, posterGradient } from './films'
import './app.css'

const POSTER_WIDTH = 160
const POSTER_HEIGHT = 240

// Module scope, so the engine sees the same function for the life of the
// instance.
const getLabel = (index: number) => filmAt(index).title

/**
 * Builds a poster stack plus a thumbnail rail inside `el`. Mirrors
 * examples/react-movie-stack/src/ExternalControlStack.tsx: the rail is a
 * row of numbered buttons that jump straight to a card wherever the stack
 * currently sits, driven purely through `riffle.goTo(index)`, the same
 * imperative call a URL sync or a "now playing" panel elsewhere on a real
 * page would use. `aria-current` marks the active thumbnail, read from
 * `activeIndex` alone; every actual move goes through `goTo`. No separate
 * prev/next controls: the rail is the only way to move the stack, matching
 * the original component exactly (it has no controls of its own either,
 * since it is meant to be embedded alongside a page's own chrome). Each
 * button also carries `data-rail-index`, the film's index: e2e's
 * `advanceTarget` (e2e/utils/examples.ts) clicks the second one
 * (`[data-rail-index="1"]`) as this recipe's stand-in for a generic "Next"
 * control, since the React and Vue versions of this recipe carry the same
 * attribute on the same button for the same reason.
 */
export function mount(el: HTMLElement): () => void {
  el.innerHTML = ''

  const page = document.createElement('main')
  page.className = 'recipe-programmatic'

  const stage = document.createElement('div')
  stage.className = 'stage'
  const stack = document.createElement('div')
  stack.className = 'stack'
  stack.setAttribute('aria-label', 'Films')
  stack.style.display = 'grid'
  stage.appendChild(stack)
  page.appendChild(stage)

  const rail = document.createElement('div')
  rail.className = 'rail'
  rail.setAttribute('role', 'group')
  rail.setAttribute('aria-label', 'Jump to film')
  // #region goto-wiring
  const railButtons: HTMLButtonElement[] = []
  films.forEach((film, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'rail-button'
    button.setAttribute('aria-label', `Jump to ${film.title}`)
    button.setAttribute('data-rail-index', String(index))
    button.textContent = String(index + 1)
    button.addEventListener('click', () => riffle.goTo(index))
    rail.appendChild(button)
    railButtons.push(button)
  })
  // #endregion goto-wiring
  page.appendChild(rail)

  el.appendChild(page)

  const posters: HTMLElement[] = []

  films.forEach((film) => {
    const poster = document.createElement('div')
    poster.className = 'poster'
    poster.style.gridArea = '1 / 1'
    poster.style.width = `${POSTER_WIDTH}px`
    poster.style.height = `${POSTER_HEIGHT}px`
    poster.style.background = posterGradient(film)
    stack.appendChild(poster)
    posters.push(poster)
  })

  const riffle: Riffle = createRiffle(stack, {
    count: films.length,
    cardWidth: POSTER_WIDTH,
    cardHeight: POSTER_HEIGHT,
    getLabel,
  })

  posters.forEach((poster, index) => riffle.registerNode(index, poster))

  function updateActive(index: number): void {
    railButtons.forEach((button, buttonIndex) => {
      const active = buttonIndex === index
      button.classList.toggle('rail-button-active', active)
      if (active) button.setAttribute('aria-current', 'true')
      else button.removeAttribute('aria-current')
    })
  }

  const unsubscribe = riffle.on('change', ({ index }) => updateActive(index))
  updateActive(riffle.getSnapshot().activeIndex)

  return function unmount(): void {
    unsubscribe()
    riffle.destroy()
    el.innerHTML = ''
  }
}

const root = document.getElementById('programmatic-control-recipe-root')
if (root) mount(root)
