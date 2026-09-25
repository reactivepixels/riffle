export default defineNuxtConfig({
  compatibilityDate: '2026-09-23',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Riffle: Nuxt',
      // WCAG 3.1.1 (axe rule html-has-lang): every other
      // example sets this (see examples/nextjs-app-router/app/layout.tsx's
      // <html lang="en">); this one had never set it at all.
      htmlAttrs: { lang: 'en' },
    },
  },
})
