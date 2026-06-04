// Cockpit d'atelier — configuration Nuxt minimale.
//
// SSR activé (défaut). On NE met PAS `ssr: false` : la version de Nuxt installée
// a un bug du builder Vite en mode SPA (resolveServerEntry attend un `input.server`
// que la config client ne fournit pas → "No entry found in rollupOptions.input").
//
// L'app reste « hors-ligne » : en dev, Nitro sert en local, sans aucun appel réseau
// (police système, pas de CDN). Tout accès navigateur (localStorage, crypto) se fait
// dans onMounted (client only). Serveur et client rendent tous deux `cards=[]` au
// premier paint → pas de mismatch d'hydratation ; onMounted peuple ensuite.
export default defineNuxtConfig({
  devtools: { enabled: false },     // écran de projection propre
  devServer: { port: 3030 },        // évite un éventuel conflit avec d'autres projets locaux
  // Clés Supabase (publiques). Remplies par les variables d'env Vercel :
  //   NUXT_PUBLIC_SUPABASE_URL  /  NUXT_PUBLIC_SUPABASE_ANON_KEY
  // Si vides → l'app reste en localStorage pur (mode local, hors-ligne).
  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabaseKey: '',
      boardId: 'default',   // NUXT_PUBLIC_BOARD_ID pour cloisonner plusieurs ateliers
    },
  },
  app: {
    head: {
      title: "Cockpit d'atelier — Cadrage IA / Tech",
      htmlAttrs: { lang: 'fr' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'light' },
      ],
    },
  },
  compatibilityDate: '2025-01-01',
})
