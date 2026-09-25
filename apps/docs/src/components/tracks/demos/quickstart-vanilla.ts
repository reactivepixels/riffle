/**
 * The vanilla first-stack demo: the README quickstart itself,
 * examples/vanilla-movie-stack/src/quickstart.ts, run unchanged. That file
 * is a script for a page that holds `<div id="stack"></div>` (the README's
 * own markup), so this supplies exactly that element, then loads the script.
 * A module runs once per page, which is all a docs page ever needs.
 */
export function mount(host: HTMLElement): () => void {
  const stack = document.createElement('div')
  stack.id = 'stack'
  host.replaceChildren(stack)
  void import('../../../../../../examples/vanilla-movie-stack/src/quickstart')
  return () => host.replaceChildren()
}
