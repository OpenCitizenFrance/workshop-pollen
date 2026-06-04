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
      // Tolérant à tous les noms d'env courants (avec/sans préfixe NUXT_PUBLIC_, NEXT_PUBLIC_,
      // intégration Supabase↔Vercel). Lu au build ; Vercel fournit les vars au build.
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      boardId: process.env.NUXT_PUBLIC_BOARD_ID || 'default',
    },
  },
  app: {
    head: {
      title: "Cockpit d'atelier — Cadrage IA / Tech",
      htmlAttrs: { lang: 'fr' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'theme-color', content: '#50228F' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap' },
      ],
      // Anti-flash : pose data-theme sur <html> avant le premier paint (lit localStorage / préférence système).
      script: [
        { tagPosition: 'head', innerHTML: "try{var t=localStorage.getItem('cockpit-atelier:theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}" },
      ],
    },
  },
  compatibilityDate: '2025-01-01',
})
