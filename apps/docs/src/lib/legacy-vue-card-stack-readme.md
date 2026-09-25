<!--
  Vendored verbatim from rodleviton/vue-card-stack's README.md (MIT licensed,
  same author, unmaintained). The migration guide (../../content/docs/migration.mdx)
  extracts the Usage section's fenced blocks from this file through ?raw, the same
  way snippets.ts pulls every other code sample from a real file, so the legacy
  example shown there is a direct quote rather than retyped prose.
-->

## Install

```bash
npm install vue-card-stack

or

yarn add vue-card-stack
```

## Usage

```js
import Vue from 'vue'
import VueCardStack from 'vue-card-stack'

export default {
  components: {
    VueCardStack,
  },
  data() {
    return {
      cards: [
        { background: '#00659d' },
        { background: '#00abbc' },
        { background: '#e2c58a' },
        { background: '#fc8890' },
        { background: '#b35d7f' },
      ],
    }
  },
}
```

```html
<vue-card-stack :cards="cards">
  <template v-slot:card="{ card }">
    <div :style="{ background: card.background }" style="width: 100%; height: 100%;"></div>
  </template>
</vue-card-stack>
```

## API

### Props

| Name                  | Type              |             Default             | Description                                                                                        |
| :-------------------- | :---------------- | :-----------------------------: | :------------------------------------------------------------------------------------------------- |
| **cards**             | `Array`           |              `[]`               | Array of cards to render stack.                                                                    |
| **cardWidth**         | `Number`          |              `300`              | Width of card in pixels.                                                                           |
| **cardHeight**        | `Number`          |              `400`              | Height of card in pixels.                                                                          |
| **stackWidth**        | `[Number:String]` | `cardWidth + paddingHorizontal` | Width of card stack in pixels or as a percentage (responsive).                                     |
| **sensitivity**       | `Number`          |             `0.25`              | Distance card must travel as percentage of `cardWidth` + `paddingHorizontal`.                      |
| **maxVisibleCards**   | `Number`          |              `10`               | Number of cards that will be visible at any one time.                                              |
| **scaleMultiplier**   | `Number`          |             `0.75`              | A number between `0` and `1` that determines how much a card scales as it moved through the stack. |
| **speed**             | `Number`          |              `0.2`              | Duration in milliseconds for card swipe transition.                                                |
| **paddingHorizontal** | `Number`          |              `20`               | A gutter size in pixels that will be applied to left and right hand side of card stack.            |
| **paddingVertical**   | `Number`          |              `20`               | A gutter size in pixels that will be applied to top and bottom of card stack.                      |
