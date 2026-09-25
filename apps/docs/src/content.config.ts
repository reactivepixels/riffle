import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'
import { FRAMEWORKS } from '../scripts/lib/tracks.mjs'

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        // Added by scripts/generate-tracks.mjs to every page it writes into a
        // framework track; absent on every other page. The track components
        // (src/components/tracks/) read it to pick what to render.
        framework: z.enum(FRAMEWORKS).optional(),
        // A template that exists only in some tracks, such as `only: [vue]`.
        only: z.array(z.enum(FRAMEWORKS)).optional(),
      }),
    }),
  }),
}
