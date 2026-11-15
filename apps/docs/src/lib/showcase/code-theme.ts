/**
 * The syntax theme every showcase "View the code" panel renders with
 * (Astro's own `<Code>` component, Shiki underneath). Written here rather
 * than picked from Shiki's bundled themes so every token colour is known to
 * clear WCAG AA (4.5:1 or better) against the panel's own `#111116`
 * background, the comment colour included.
 */
export const showcaseCodeTheme = {
  name: 'riffle-showcase',
  type: 'dark' as const,
  colors: {
    'editor.background': '#111116',
    'editor.foreground': '#ecebf3',
  },
  tokenColors: [
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#a3a1b4', fontStyle: 'italic' },
    },
    {
      scope: [
        'keyword',
        'storage',
        'storage.type',
        'storage.modifier',
        'keyword.control',
        'keyword.operator.new',
        'keyword.operator.expression',
      ],
      settings: { foreground: '#ff9ec0' },
    },
    {
      scope: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string'],
      settings: { foreground: '#ffd88a' },
    },
    {
      scope: ['constant.numeric', 'constant.language', 'constant.language.boolean'],
      settings: { foreground: '#8fd3ff' },
    },
    {
      scope: [
        'entity.name.function',
        'support.function',
        'meta.function-call entity.name.function',
      ],
      settings: { foreground: '#a6f0a0' },
    },
    {
      scope: [
        'variable.other.property',
        'variable.other.object.property',
        'meta.object-literal.key',
        'support.type.property-name',
      ],
      settings: { foreground: '#d2c4ff' },
    },
    {
      scope: ['entity.name.type', 'support.type', 'support.class', 'entity.other.inherited-class'],
      settings: { foreground: '#86e8dc' },
    },
    {
      scope: ['punctuation', 'meta.brace', 'keyword.operator'],
      settings: { foreground: '#c4c1d4' },
    },
  ],
}
