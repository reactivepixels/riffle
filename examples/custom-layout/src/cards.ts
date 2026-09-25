/**
 * Seven generated swatches for the arc demo. Each gets a two-stop CSS
 * gradient instead of artwork, since this example is about the layout, not
 * the content it carries.
 */
export interface Swatch {
  label: string
  from: string
  to: string
}

export const cards: readonly Swatch[] = [
  { label: 'One', from: '#1f2a44', to: '#5087c9' },
  { label: 'Two', from: '#2a1a3c', to: '#a85fc9' },
  { label: 'Three', from: '#3a1526', to: '#e14e73' },
  { label: 'Four', from: '#3a2410', to: '#e6913f' },
  { label: 'Five', from: '#243a17', to: '#8fc94e' },
  { label: 'Six', from: '#0f3630', to: '#3fc9a8' },
  { label: 'Seven', from: '#101c30', to: '#4f8fc9' },
]

/** A swatch's background: a single diagonal two-stop gradient. */
export function swatchGradient(swatch: Swatch): string {
  return `linear-gradient(150deg, ${swatch.from}, ${swatch.to})`
}
