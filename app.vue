<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'

/* ────────────────────────────────────────────────────────────────────────
   COCKPIT D'ATELIER — cadrage IA / Tech
   Tout l'état vit ici, persisté dans localStorage. Aucun backend.
   ──────────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'cockpit-atelier:v1'

const EQUIPES = ['Ops', 'Sales', 'Tech', 'Transverse']

// Référents (owners) qui portent un cas d'usage. null = pas encore assigné.
const OWNERS = ['Olivier', 'Axel', 'Pierre', 'Georges']
// Couleur d'identité par owner → repère visuel cohérent dans toutes les vues.
const OWNER_COLORS = { Olivier: '#6366F1', Axel: '#F59E0B', Pierre: '#F43F5E', Georges: '#14B8A6' }
function ownerColor (name) { return OWNER_COLORS[name] || '#71717A' }

// Les 3 types de réponse — couleur cohérente reprise dans TOUTES les vues.
// Hybride (violet) = le mélange Software (bleu) + GenAI (vert).
const TYPES = {
  Software: { label: 'Software', sub: 'Solution logicielle (automatisation déterministe incluse)', color: '#0E9BD6' },
  GenAI:    { label: 'GenAI',    sub: 'Automatisation générative',                                  color: '#0E9E57' },
  Both:     { label: 'Hybride',  sub: 'Software + GenAI',                                            color: '#E0329F' },
}
const TYPE_ORDER = ['Software', 'GenAI', 'Both']

// Migration ancien modèle → nouveau. Déclenchée si la carte porte encore le champ iaRun
// (les cartes déjà au nouveau format ne l'ont plus → on garde leur type tel quel).
function migrateType (c) {
  if (!('iaRun' in c)) return TYPE_ORDER.includes(c.type) ? c.type : 'Software'
  if (c.type === 'IA') return 'GenAI'                                    // « IA dans le run » → GenAI
  if (c.type === 'Software') return c.iaRun ? 'Both' : 'Software'        // software + IA → Hybride
  if (c.type === 'Automatisation') return c.iaRun ? 'Both' : 'Software'  // déterministe → Software
  return 'Software'
}

// Les 4 notes 1→5, avec leur intitulé d'aide.
const RATINGS = [
  { key: 'douleur',  label: 'Douleur',   hint: 'temps perdu / coût / erreurs' },
  { key: 'impact',   label: 'Impact',    hint: 'valeur si résolu' },
  { key: 'effort',   label: 'Effort',    hint: 'complexité de mise en œuvre' },
  { key: 'confiance',label: 'Confiance', hint: 'faisabilité (clé pour la GenAI)' },
]

const SEQ = [
  { id: 'maintenant', label: 'Maintenant', sub: 'On lance' },
  { id: 'ensuite',    label: 'Ensuite',    sub: 'Prochain palier' },
  { id: 'plustard',   label: 'Plus tard',  sub: 'À revisiter' },
]

// Roadmap : mois en notation absolue = année*12 + index (0 = janvier).
const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
function monthIdx (abs) { return ((abs % 12) + 12) % 12 }
function clampDur (n) { n = Math.round(Number(n)); if (!Number.isFinite(n)) return 2; return Math.max(1, Math.min(36, n)) }

function uid () {
  try { return crypto.randomUUID() } catch (e) { return 'id-' + Date.now() + '-' + Math.round(Math.random() * 1e6) }
}
function clamp (n) { n = Number(n); if (!Number.isFinite(n)) n = 3; return Math.max(1, Math.min(5, Math.round(n))) }

/* ── Architecture de données (reconstituée — labels éditables) ───────────── */
const STACK_KEY = 'cockpit-atelier:stack:v1'
const NODE_W = 152, NODE_H = 54
const KIND_LABEL = { source: 'Source', hub: 'Orchestration', store: 'Stockage', db: 'Base de données', ai: 'Agents IA', app: 'Application' }
const STACK_GROUPS = [
  { id: 'src',  label: 'Sources',              x: 24,  w: 252 },
  { id: 'orch', label: 'Orchestration',        x: 300, w: 196 },
  { id: 'data', label: 'Plateforme data & IA', x: 520, w: 286 },
  { id: 'apps', label: 'Apps & Agents',        x: 830, w: 226 },
]
const STACK_NODES = [
  { id: 'drive',    label: 'Google Drive',        group: 'src',  kind: 'source', content: true,  x: 150, y: 132 },
  { id: 'firebase', label: 'Firebase',            group: 'src',  kind: 'source', content: true,  x: 150, y: 250 },
  { id: 'airtable', label: 'Airtable',            group: 'src',  kind: 'source',                 x: 150, y: 368 },
  { id: 'n8n',      label: 'N8n',                 group: 'orch', kind: 'hub',    hub: true,       x: 398, y: 300 },
  { id: 'datalake', label: 'Data Lake',           group: 'data', kind: 'store',                  x: 663, y: 150 },
  { id: 'supabase', label: 'Supabase · Postgres', group: 'data', kind: 'db',     content: true, hub: true, x: 663, y: 372 },
  { id: 'vector',   label: 'Base vectorielle',    group: 'data', kind: 'store',                  x: 663, y: 512 },
  { id: 'agents',   label: 'Agents IA',           group: 'apps', kind: 'ai',                     x: 943, y: 212 },
  { id: 'apps',     label: '4 apps Nuxt',         group: 'apps', kind: 'app',                    x: 943, y: 398 },
]
const STACK_EDGES = [
  { from: 'drive',    to: 'n8n' },
  { from: 'firebase', to: 'n8n' },
  { from: 'airtable', to: 'n8n' },
  { from: 'supabase', to: 'n8n' },
  { from: 'n8n',      to: 'datalake', label: 'ingestion',    ly: -8 },
  { from: 'datalake', to: 'supabase', label: 'embeddings',   lx: 14, ly: 0 },
  { from: 'supabase', to: 'vector',   label: 'même instance', lx: 18, ly: 0, same: true },
  { from: 'vector',   to: 'agents',   label: 'RAG',          ly: -10 },
  { from: 'datalake', to: 'agents' },
  { from: 'agents',   to: 'apps' },
  { from: 'apps',     to: 'supabase', label: 'opérationnel', ly: 14, bidir: true },
]
const KIND_BY_GROUP = { src: 'source', orch: 'hub', data: 'store', apps: 'app' }

// Contenu pré-chargé — éditable / supprimable, point de départ de l'atelier.
function seedCards () {
  return [
    { id: uid(), titre: 'Production de cours', description: 'Industrialiser la création de supports de formation.', equipe: 'Ops', type: 'GenAI', douleur: 4, impact: 5, effort: 4, confiance: 3, sequence: 'backlog', start: null, duration: 2, sources: ['drive', 'firebase', 'supabase', 'n8n', 'datalake', 'vector', 'agents'], details: 'Objectif : passer de ~3 j à <1 j pour produire un module complet.\n\nEntrées : trame pédagogique, slides existants, transcripts d’ateliers.\nSorties : support stagiaire + guide animateur + quiz.\n\nGarde-fou : relecture humaine obligatoire avant diffusion (ton éditorial, droits sur les visuels).' },
    { id: uid(), titre: 'Génération de propositions commerciales', description: 'Assemblage assisté des propales (socle Software + génération, déjà avancé, encore lent).', equipe: 'Sales', type: 'Both', douleur: 4, impact: 4, effort: 3, confiance: 4, sequence: 'backlog', start: null, duration: 2, sources: ['airtable', 'n8n', 'datalake', 'supabase', 'vector', 'agents', 'apps'], details: 'Socle Software déjà en place (assemblage des propales) + brique générative pour la note d’intention.\n\nDouleur restante : ~30 min de mise en forme manuelle par propale.\nProchaine étape : templating Pollen automatique + génération du résumé exécutif.' },
    { id: uid(), titre: 'Recherche universelle dans les données', description: 'Recherche transverse dans toutes les sources (déjà partiellement en place).', equipe: 'Transverse', type: 'Software', douleur: 3, impact: 3, effort: 2, confiance: 5, sequence: 'backlog', start: null, duration: 2, sources: ['drive', 'firebase', 'airtable', 'datalake', 'supabase', 'vector'], details: 'Recherche transverse Drive + Firebase + Airtable, déjà partiellement en place (index plein-texte).\n\nManque : classement par pertinence et respect des permissions par source.' },
    { id: uid(), titre: 'Hygiène & pratiques IA sur la codebase', description: 'Bonnes pratiques IA pour le dev — quick win.', equipe: 'Tech', type: 'Software', douleur: 3, impact: 4, effort: 2, confiance: 5, sequence: 'backlog', start: null, duration: 2, sources: [], details: 'Quick win équipe Tech.\nConventions de prompts, revues de code assistées, garde-fous (aucun secret dans les prompts).\nFormat : 1 atelier + checklist partagée.' },
    { id: uid(), titre: 'Fraîcheur du Data Lake / synchro sources', description: 'Synchronisation déterministe des sources de données.', equipe: 'Tech', type: 'Software', douleur: 2, impact: 3, effort: 2, confiance: 5, sequence: 'backlog', start: null, duration: 2, sources: ['drive', 'firebase', 'airtable', 'supabase', 'n8n', 'datalake'], details: 'Synchronisation déterministe des sources vers le Data Lake.\nFréquence cible : horaire.\nSupervision : alerte si une source décroche > 2 h.' },
  ]
}

function normalize (c) {
  return {
    id: c.id || uid(),
    titre: typeof c.titre === 'string' ? c.titre : 'Sans titre',
    description: typeof c.description === 'string' ? c.description : '',
    equipe: EQUIPES.includes(c.equipe) ? c.equipe : 'Transverse',
    type: migrateType(c),   // convertit l'ancien modèle (Software/Automatisation/IA + iaRun) si besoin
    douleur: clamp(c.douleur), impact: clamp(c.impact), effort: clamp(c.effort), confiance: clamp(c.confiance),
    sequence: ['backlog', 'maintenant', 'ensuite', 'plustard'].includes(c.sequence) ? c.sequence : 'backlog',
    start: Number.isInteger(c.start) ? c.start : null,   // mois absolu de début sur la roadmap, ou null (non planifié)
    duration: clampDur(c.duration),                       // durée en mois
    sources: Array.isArray(c.sources) ? c.sources.filter(s => typeof s === 'string') : [],  // ids des blocs de la stack requis
    owner: OWNERS.includes(c.owner) ? c.owner : null,   // référent du cas d'usage, ou null si non assigné
    details: typeof c.details === 'string' ? c.details : '',  // description longue (multi-ligne, collable) — éditée dans la modale
  }
}

/* ── État réactif ──────────────────────────────────────────────────────── */
const cards = ref([])
const activeTab = ref('capture')
const tabs = [
  { id: 'capture', label: 'Capture' },
  { id: 'stack', label: 'Stack' },
  { id: 'matrice', label: 'Matrice' },
  { id: 'priorisation', label: 'Priorisation' },
  { id: 'sequencement', label: 'Séquencement' },
]

const filterEquipe = ref('all')
const filterType = ref('all')
const filterOwner = ref('all')   // 'all' | nom d'owner | 'none' (non assignés)

const draft = reactive({ titre: '', description: '', equipe: 'Ops', type: 'Software' })
const titreInput = ref(null)

const showReset = ref(false)
const theme = ref('light')       // 'light' | 'dark' (le <html data-theme> est posé dès le <head>)
const selectedId = ref(null)     // carte sélectionnée dans la matrice
const hoveredId = ref(null)      // bulle survolée
const dragId = ref(null)         // drag & drop séquencement
const dragOver = ref(null)

// Roadmap
const seqMode = ref('kanban')        // 'kanban' (tri rapide) | 'roadmap' (timeline mensuelle)
const horizon = ref(12)              // nombre de mois affichés
const anchor = ref(null)             // mois courant en absolu (calculé client-side dans onMounted)
const selectedRoadmapId = ref(null)  // barre sélectionnée pour l'éditeur

// Stack — nœuds ET arêtes sont dynamiques (ajout/suppression en réunion) et persistés.
const stackNodes = ref(STACK_NODES.map(n => ({ ...n })))
const stackEdges = ref(STACK_EDGES.map(e => ({ ...e })))
const stackSelectedCardId = ref(null)   // cas d'usage sélectionné (mode affectation des sources)
const stackSelectedNodeId = ref(null)   // bloc sélectionné (mode inspection)
const newNode = reactive({ label: '', group: 'src' })   // formulaire « ajouter un bloc »

let loaded = false

onMounted(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    cards.value = Array.isArray(parsed) ? parsed.map(normalize) : seedCards()
  } catch (e) {
    cards.value = seedCards()
  }
  // Ancre = mois courant, calculée ICI (client) et non au niveau module → pas de
  // divergence horloge serveur/client sous SSR. new Date() est sûr dans le navigateur.
  const d = new Date()
  anchor.value = d.getFullYear() * 12 + d.getMonth()
  // Architecture éventuellement modifiée (renommée / blocs ajoutés/supprimés / arêtes).
  try {
    const saved = JSON.parse(localStorage.getItem(STACK_KEY) || 'null')
    if (saved && Array.isArray(saved.nodes)) {
      stackNodes.value = saved.nodes
      if (Array.isArray(saved.edges)) stackEdges.value = saved.edges
    } else if (Array.isArray(saved)) {
      // Ancien format [{id,label}] → ré-applique seulement les libellés sur le seed.
      stackNodes.value = STACK_NODES.map(n => {
        const s = saved.find(x => x.id === n.id)
        return { ...n, label: (s && typeof s.label === 'string') ? s.label : n.label }
      })
    }
  } catch (e) {}
  loaded = true
  // Le <head> a déjà posé data-theme (anti-flash) ; on aligne juste l'état Vue.
  theme.value = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  initSharedMode()   // bascule en board partagé si Supabase est configuré
})

// Persistance : à chaque changement, on réécrit localStorage. Un refresh ne perd rien.
watch(cards, () => {
  if (!loaded) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cards.value)) } catch (e) {}
}, { deep: true })

watch([stackNodes, stackEdges], () => {
  if (!loaded) return
  try { localStorage.setItem(STACK_KEY, JSON.stringify({ nodes: stackNodes.value, edges: stackEdges.value })) } catch (e) {}
}, { deep: true })

/* ── Board partagé en temps réel (Supabase, optionnel) ─────────────────────
   Sans clés → l'app reste 100% locale (localStorage). Avec clés → un document
   JSONB partagé `boards/<boardId>` est synchronisé via Realtime. Garde-fou
   anti-boucle : on tamponne chaque écriture d'un client_id et on ignore l'écho
   de ses propres writes. Le localStorage sert de cache hors-ligne en parallèle. */
const publicCfg = useRuntimeConfig().public
const sharedMode = ref(false)   // Supabase configuré
const online = ref(false)       // souscription temps réel active
let supa = null
let clientId = 'c'
let boardKey = 'default'
let applyingRemote = false
let pushTimer = null

function boardDoc () {
  return { cards: cards.value, stack: { nodes: stackNodes.value, edges: stackEdges.value } }
}
function applyRemote (doc) {
  if (!doc) return
  applyingRemote = true
  if (Array.isArray(doc.cards)) cards.value = doc.cards.map(normalize)
  if (doc.stack && Array.isArray(doc.stack.nodes)) stackNodes.value = doc.stack.nodes
  if (doc.stack && Array.isArray(doc.stack.edges)) stackEdges.value = doc.stack.edges
  nextTick(() => { applyingRemote = false })
}
async function pushBoard () {
  if (!supa) return
  try {
    await supa.from('boards').upsert({
      id: boardKey, data: boardDoc(), last_writer: clientId, updated_at: new Date().toISOString(),
    })
  } catch (e) { /* hors-ligne : localStorage garde la copie, on repoussera au prochain edit */ }
}
function schedulePush () {
  if (!sharedMode.value || applyingRemote) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(pushBoard, 400)
}
async function initSharedMode () {
  if (!publicCfg.supabaseUrl || !publicCfg.supabaseAnonKey) return   // → mode local
  try {
    const { createClient } = await import('@supabase/supabase-js')
    supa = createClient(publicCfg.supabaseUrl, publicCfg.supabaseAnonKey)
    boardKey = publicCfg.boardId || 'default'
    clientId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('c' + Date.now())
    sharedMode.value = true
    // État distant ; s'il n'existe pas encore, on l'amorce avec l'état local.
    const { data } = await supa.from('boards').select('data').eq('id', boardKey).maybeSingle()
    if (data && data.data && Array.isArray(data.data.cards)) applyRemote(data.data)
    else await pushBoard()
    supa.channel('board-' + boardKey)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards', filter: 'id=eq.' + boardKey }, (payload) => {
        const row = payload.new
        if (!row || row.last_writer === clientId) return   // ignore son propre écho
        applyRemote(row.data)
      })
      .subscribe((status) => { online.value = (status === 'SUBSCRIBED') })
  } catch (e) { sharedMode.value = false; online.value = false }
}
// Pousse (débouncé) tout changement local vers le board partagé.
watch([cards, stackNodes, stackEdges], schedulePush, { deep: true })

/* ── Actions ───────────────────────────────────────────────────────────── */
function addCard () {
  const titre = draft.titre.trim()
  if (!titre) { titreInput.value?.focus(); return }
  cards.value.unshift({
    id: uid(),
    titre,
    description: draft.description.trim(),
    equipe: draft.equipe,
    type: draft.type,
    douleur: 3, impact: 3, effort: 3, confiance: 3,
    sequence: 'backlog', start: null, duration: 2, sources: [],
    owner: null,
    details: '',
  })
  draft.titre = ''
  draft.description = ''
  // On garde équipe + type pour enchaîner la saisie rapidement.
  nextTick(() => titreInput.value?.focus())
}

function removeCard (id) {
  cards.value = cards.value.filter(c => c.id !== id)
  if (selectedId.value === id) selectedId.value = null
}

// Sources de données par carte — éditables aussi bien en Capture que dans le Stack.
function addSourceTo (c, id) { if (!id) return; if (!Array.isArray(c.sources)) c.sources = []; if (!c.sources.includes(id)) c.sources.push(id) }
function removeSourceFrom (c, id) { if (Array.isArray(c.sources)) c.sources = c.sources.filter(s => s !== id) }
function availableSources (c) { const have = new Set(c.sources || []); return stackNodes.value.filter(n => !have.has(n.id)) }

/* ── Détails d'un cas d'usage — éditeur focalisé (modale) ──────────────────
   On édite directement `card.details` via v-model : le watch deep persiste
   tout seul (localStorage + push Supabase). La modale n'est qu'une surface
   d'édition confortable pour rédiger / coller un texte long. */
const detailCardId = ref(null)
const detailCard = computed(() => cards.value.find(c => c.id === detailCardId.value) || null)
const detailInput = ref(null)       // ref du <textarea> → autofocus à l'ouverture
const detailCopied = ref(false)     // feedback transitoire du bouton « Copier »
function openDetails (id) {
  detailCardId.value = id
  detailCopied.value = false
  nextTick(() => detailInput.value?.focus())
}
function closeDetails () { detailCardId.value = null }
async function copyDetails () {
  const txt = detailCard.value?.details || ''
  if (!txt.trim()) return
  try {
    await navigator.clipboard.writeText(txt)
    detailCopied.value = true
    setTimeout(() => { detailCopied.value = false }, 1600)
  } catch (e) { /* presse-papier indisponible (http non sécurisé) → on ignore */ }
}
// Aperçu une ligne affiché sur la carte : on aplatit les retours à la ligne.
function detailPreview (text) {
  const t = (text || '').replace(/\s+/g, ' ').trim()
  return t.length > 90 ? t.slice(0, 90) + '…' : t
}

function doReset () {
  cards.value = seedCards()
  stackNodes.value = STACK_NODES.map(n => ({ ...n }))
  stackEdges.value = STACK_EDGES.map(e => ({ ...e }))
  selectedId.value = null
  stackSelectedCardId.value = null
  stackSelectedNodeId.value = null
  filterEquipe.value = 'all'
  filterType.value = 'all'
  filterOwner.value = 'all'
  showReset.value = false
}

function applyTheme (t) { try { document.documentElement.dataset.theme = t } catch (e) {} }
function toggleTheme () {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(theme.value)
  try { localStorage.setItem('cockpit-atelier:theme', theme.value) } catch (e) {}
}

function setSequence (id, seq) {
  const c = cards.value.find(x => x.id === id)
  if (c) c.sequence = seq
}

/* ── Drag & drop (séquencement) ────────────────────────────────────────── */
function onDragStart (id, e) {
  dragId.value = id
  if (e?.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id) } catch (_) {} }
}
function onDrop (seq) {
  if (dragId.value) setSequence(dragId.value, seq)
  dragId.value = null
  dragOver.value = null
}

/* ── Roadmap (timeline mensuelle) ──────────────────────────────────────── */
// Les 12 (ou 6/18) mois affichés, à partir du mois courant.
const timeline = computed(() => {
  if (anchor.value == null) return []
  return Array.from({ length: horizon.value }, (_, i) => {
    const abs = anchor.value + i
    return { i, abs, year: Math.floor(abs / 12), label: MONTHS_FR[monthIdx(abs)], isNow: i === 0 }
  })
})
// Bandeaux d'année (ex. « 2026 » sur juin→déc, « 2027 » sur janv→mai).
const yearBands = computed(() => {
  const bands = []
  for (const t of timeline.value) {
    const last = bands[bands.length - 1]
    if (last && last.year === t.year) last.span++
    else bands.push({ year: t.year, span: 1 })
  }
  return bands
})
const placed = computed(() => cards.value.filter(c => c.start != null)
  .sort((a, b) => (a.start - b.start) || a.titre.localeCompare(b.titre)))
const unplaced = computed(() => cards.value.filter(c => c.start == null))
const selectedRoadmapCard = computed(() => cards.value.find(c => c.id === selectedRoadmapId.value && c.start != null) || null)

// Géométrie des barres en %, donc responsive (indépendant de l'échelle de projection).
function colOf (c) { return c.start - anchor.value }
function barLeft (c) { return (Math.max(0, colOf(c)) / horizon.value) * 100 }
function barWidth (c) {
  const visStart = Math.max(0, colOf(c))
  const visEnd = Math.min(horizon.value, colOf(c) + c.duration)
  return (Math.max(0, visEnd - visStart) / horizon.value) * 100
}
function rangeLabel (c) {
  const sl = MONTHS_FR[monthIdx(c.start)]
  if (c.duration <= 1) return sl
  return sl + ' → ' + MONTHS_FR[monthIdx(c.start + c.duration - 1)]
}

function setHorizon (h) { horizon.value = h }
function placeOnRoadmap (c) { c.start = anchor.value; c.duration = Math.min(2, horizon.value); selectedRoadmapId.value = c.id }
function removeFromRoadmap (c) { c.start = null; if (selectedRoadmapId.value === c.id) selectedRoadmapId.value = null }
function setStart (c, abs) { const col = abs - anchor.value; c.start = abs; c.duration = Math.max(1, Math.min(c.duration, horizon.value - col)) }
function setDuration (c, d) { const col = colOf(c); c.duration = Math.max(1, Math.min(horizon.value - col, Math.round(d))) }
function fillFromKanban () {
  const map = { maintenant: 0, ensuite: 3, plustard: 6 }
  for (const c of cards.value) {
    if (c.start != null || !(c.sequence in map)) continue
    const col = Math.min(map[c.sequence], horizon.value - 1)
    c.start = anchor.value + col
    c.duration = Math.min(2, horizon.value - col)
  }
}

// Drag au pointeur : déplacer (corps) ou redimensionner (poignées gauche/droite).
// Conversion px → mois via la largeur réelle d'une colonne. Clic sans bouger = sélection.
function onBarPointerDown (card, mode, e) {
  e.preventDefault()
  const track = e.currentTarget.closest('.lane-track')
  if (!track) return
  const colW = track.getBoundingClientRect().width / horizon.value
  const startX = e.clientX
  const origCol = colOf(card)
  const origDur = card.duration
  let moved = false
  document.body.classList.add('dragging-bar')
  const move = (ev) => {
    const d = Math.round((ev.clientX - startX) / colW)
    if (Math.abs(ev.clientX - startX) > 3) moved = true
    if (mode === 'move') {
      const ns = Math.max(0, Math.min(horizon.value - card.duration, origCol + d))
      card.start = anchor.value + ns
    } else if (mode === 'right') {
      card.duration = Math.max(1, Math.min(horizon.value - origCol, origDur + d))
    } else if (mode === 'left') {
      const ns = Math.max(0, Math.min(origCol + origDur - 1, origCol + d))
      card.start = anchor.value + ns
      card.duration = (origCol + origDur) - ns
    }
  }
  const up = () => {
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerup', up)
    document.body.classList.remove('dragging-bar')
    if (!moved) selectedRoadmapId.value = selectedRoadmapId.value === card.id ? null : card.id
  }
  document.addEventListener('pointermove', move)
  document.addEventListener('pointerup', up)
}

/* ── Stack (cartographie de l'architecture) ────────────────────────────── */
function nodeById (id) { return stackNodes.value.find(n => n.id === id) }
function nodeLabel (id) { return nodeById(id)?.label || id }

// Anchors : sortie/entrée sur le bord des blocs. Horizontal si colonnes différentes.
function edgePath (e) {
  const a = nodeById(e.from), b = nodeById(e.to)
  if (!a || !b) return ''
  const dx = b.x - a.x, dy = b.y - a.y
  let ax, ay, bx, by
  if (Math.abs(dx) > NODE_W * 0.6) {
    ax = a.x + Math.sign(dx) * NODE_W / 2; ay = a.y
    bx = b.x - Math.sign(dx) * NODE_W / 2; by = b.y
    const c = Math.abs(bx - ax) * 0.45
    return `M ${ax} ${ay} C ${ax + Math.sign(dx) * c} ${ay}, ${bx - Math.sign(dx) * c} ${by}, ${bx} ${by}`
  } else {
    ax = a.x; ay = a.y + Math.sign(dy) * NODE_H / 2
    bx = b.x; by = b.y - Math.sign(dy) * NODE_H / 2
    const c = Math.abs(by - ay) * 0.5
    return `M ${ax} ${ay} C ${ax} ${ay + Math.sign(dy) * c}, ${bx} ${by - Math.sign(dy) * c}, ${bx} ${by}`
  }
}

const stackCard = computed(() => cards.value.find(c => c.id === stackSelectedCardId.value) || null)
const selectedStackNode = computed(() => stackNodes.value.find(n => n.id === stackSelectedNodeId.value) || null)
const highlightColor = computed(() => stackCard.value ? typeColor(stackCard.value.type) : 'var(--accent)')

function nodeActive (id) { return stackCard.value ? (stackCard.value.sources || []).includes(id) : false }
function nodeDependents (id) { return cards.value.filter(c => (c.sources || []).includes(id)) }
function depCount (id) { return nodeDependents(id).length }
function edgeActive (e) {
  if (stackCard.value) return nodeActive(e.from) && nodeActive(e.to)
  if (stackSelectedNodeId.value) return e.from === stackSelectedNodeId.value || e.to === stackSelectedNodeId.value
  return false
}
function toggleSource (id) {
  const c = stackCard.value
  if (!c) return
  if (!Array.isArray(c.sources)) c.sources = []
  const i = c.sources.indexOf(id)
  if (i >= 0) c.sources.splice(i, 1)
  else c.sources.push(id)
}
function onNodeClick (id) {
  if (stackCard.value) toggleSource(id)
  else stackSelectedNodeId.value = stackSelectedNodeId.value === id ? null : id
}
function selectStackCard (id) { stackSelectedCardId.value = id; stackSelectedNodeId.value = null }

// Ajout / suppression / connexion de blocs (faire évoluer l'archi en réunion).
function groupCenterX (gid) { const g = STACK_GROUPS.find(x => x.id === gid); return g ? g.x + g.w / 2 : 540 }
function nextNodeY (gid) {
  const ys = stackNodes.value.filter(n => n.group === gid).map(n => n.y)
  return ys.length ? Math.min(600, Math.max(...ys) + NODE_H + 26) : 120
}
function addNode () {
  const label = newNode.label.trim()
  if (!label) return
  let id = 'n_'; try { id += crypto.randomUUID().slice(0, 8) } catch (e) { id += Date.now() }
  stackNodes.value.push({ id, label, group: newNode.group, kind: KIND_BY_GROUP[newNode.group] || 'store', x: groupCenterX(newNode.group), y: nextNodeY(newNode.group) })
  newNode.label = ''
  stackSelectedNodeId.value = id   // sélection immédiate pour le connecter
}
function removeNode (id) {
  stackNodes.value = stackNodes.value.filter(n => n.id !== id)
  stackEdges.value = stackEdges.value.filter(e => e.from !== id && e.to !== id)
  for (const c of cards.value) { if (Array.isArray(c.sources)) c.sources = c.sources.filter(s => s !== id) }
  if (stackSelectedNodeId.value === id) stackSelectedNodeId.value = null
}
function edgeExists (a, b) { return stackEdges.value.some(e => (e.from === a && e.to === b) || (e.from === b && e.to === a)) }
function toggleEdge (a, b) {
  const i = stackEdges.value.findIndex(e => (e.from === a && e.to === b) || (e.from === b && e.to === a))
  if (i >= 0) stackEdges.value.splice(i, 1)
  else stackEdges.value.push({ from: a, to: b })
}
function edgeLabelPos (e) {
  const a = nodeById(e.from), b = nodeById(e.to)
  if (!a || !b) return { x: -999, y: -999 }
  const dx = b.x - a.x, dy = b.y - a.y
  let ax, ay, bx, by
  if (Math.abs(dx) > NODE_W * 0.6) { ax = a.x + Math.sign(dx) * NODE_W / 2; ay = a.y; bx = b.x - Math.sign(dx) * NODE_W / 2; by = b.y }
  else { ax = a.x; ay = a.y + Math.sign(dy) * NODE_H / 2; bx = b.x; by = b.y - Math.sign(dy) * NODE_H / 2 }
  return { x: (ax + bx) / 2 + (e.lx || 0), y: (ay + by) / 2 + (e.ly != null ? e.ly : -5) }
}

// Points de convergence : blocs dont dépendent le plus de cas d'usage.
const convergence = computed(() => stackNodes.value
  .map(n => ({ id: n.id, label: n.label, count: depCount(n.id) }))
  .filter(n => n.count > 0)
  .sort((a, b) => b.count - a.count)
  .slice(0, 5))

/* ── Dérivés ───────────────────────────────────────────────────────────── */
const filtered = computed(() => cards.value.filter(c =>
  (filterEquipe.value === 'all' || c.equipe === filterEquipe.value) &&
  (filterType.value === 'all' || c.type === filterType.value) &&
  (filterOwner.value === 'all' || (filterOwner.value === 'none' ? !c.owner : c.owner === filterOwner.value))
))

const counts = computed(() => {
  const o = { total: cards.value.length, Software: 0, GenAI: 0, Both: 0 }
  for (const c of cards.value) { if (o[c.type] != null) o[c.type]++ }
  return o
})

// Score de priorisation = (Impact × Douleur) ÷ Effort, pondéré par la Confiance.
function score (c) { return (c.impact * c.douleur) / c.effort * (c.confiance / 5) }

const prioritized = computed(() => {
  const arr = cards.value.map(c => ({ card: c, s: score(c) })).sort((a, b) => b.s - a.s)
  const max = arr.length ? arr[0].s : 1
  return arr.map((x, i) => ({ card: x.card, s: x.s, rank: i + 1, pct: max > 0 ? (x.s / max) * 100 : 0 }))
})

const selectedCard = computed(() => cards.value.find(c => c.id === selectedId.value) || null)

/* ── Géométrie de la matrice (SVG fait main) ───────────────────────────── */
const VB = { w: 1000, h: 660 }
const PAD = { l: 84, r: 44, t: 58, b: 78 }
const plot = computed(() => ({ x: PAD.l, y: PAD.t, w: VB.w - PAD.l - PAD.r, h: VB.h - PAD.t - PAD.b }))
function xEffort (e) { const p = plot.value; return p.x + ((e - 1) / 4) * p.w }
function yImpact (i) { const p = plot.value; return p.y + ((5 - i) / 4) * p.h }
function rDouleur (d) { return 15 + d * 5.2 } // ~20 → 41

// Bulles : position (effort, impact), taille (douleur). Décalage si collision de cellule.
const bubbles = computed(() => {
  const groups = {}
  for (const c of cards.value) {
    const k = c.effort + '-' + c.impact
    ;(groups[k] || (groups[k] = [])).push(c)
  }
  const out = []
  for (const k in groups) {
    const g = groups[k]
    const n = g.length
    g.forEach((c, idx) => {
      let ox = 0, oy = 0
      if (n > 1) {
        const ang = (idx / n) * Math.PI * 2 - Math.PI / 2
        const spread = Math.min(30, 12 + n * 3)
        ox = Math.cos(ang) * spread
        oy = Math.sin(ang) * spread
      }
      out.push({ card: c, x: xEffort(c.effort) + ox, y: yImpact(c.impact) + oy, r: rDouleur(c.douleur) })
    })
  }
  // Grandes bulles derrière, petites devant → tout reste cliquable.
  out.sort((a, b) => b.r - a.r)
  return out
})

const hovered = computed(() => bubbles.value.find(b => b.card.id === hoveredId.value) || null)
const tipBelow = computed(() => hovered.value ? hovered.value.y < 170 : false)

const ticks = [1, 2, 3, 4, 5]

/* ── Helpers de présentation ───────────────────────────────────────────── */
function typeColor (t) { return TYPES[t].color }
function typeLabel (t) { return TYPES[t].label }
function fillStyle (val) { return { '--fill': (((val - 1) / 4) * 100) + '%' } }
function pct (val) { return (((val - 1) / 4) * 100) }
</script>

<template>
  <div class="app">
    <!-- ╔═ EN-TÊTE ═══════════════════════════════════════════════════════╗ -->
    <header class="topbar">
      <div class="brand">
        <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="10" r="6.7" fill="#FFD500" />
          <circle cx="21.8" cy="19.2" r="6.7" fill="#FF4DC2" />
          <circle cx="10.2" cy="19.2" r="6.7" fill="#08BBEF" />
          <circle cx="16" cy="16.4" r="4.7" fill="#50228F" />
        </svg>
        <div class="brand-txt">
          <h1>Cockpit d’atelier</h1>
          <p>Cadrage IA / Tech — capter, qualifier, prioriser</p>
        </div>
      </div>

      <div class="counts">
        <div class="count-total">
          <span class="num">{{ counts.total }}</span>
          <span class="lbl">process</span>
        </div>
        <div class="count-split">
          <span v-for="t in TYPE_ORDER" :key="t" class="count-pill" :style="{ '--c': typeColor(t) }">
            <span class="dot" />
            <span class="pl">{{ typeLabel(t) }}</span>
            <b>{{ counts[t] }}</b>
          </span>
        </div>
      </div>

      <div v-if="sharedMode" class="sync-pill" :class="{ on: online }" :title="online ? 'Board partagé en temps réel' : 'Connexion au board partagé…'">
        <span class="sync-dot" />{{ online ? 'Partagé' : 'Connexion…' }}
      </div>
      <button class="theme-btn" @click="toggleTheme" :title="theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'" :aria-label="theme === 'dark' ? 'Thème clair' : 'Thème sombre'">
        <svg v-if="theme === 'dark'" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.4 19.6l1.6-1.6M18 6l1.6-1.6" /></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path class="moon" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
      </button>
      <button class="btn-ghost danger" @click="showReset = true">Réinitialiser</button>
    </header>

    <!-- ╔═ ONGLETS ═══════════════════════════════════════════════════════╗ -->
    <nav class="tabs">
      <button
        v-for="t in tabs" :key="t.id"
        class="tab" :class="{ active: activeTab === t.id }"
        @click="activeTab = t.id"
      >{{ t.label }}</button>
    </nav>

    <main class="stage">
      <!-- ═══════════════════ VUE 1 · CAPTURE ═══════════════════ -->
      <section v-show="activeTab === 'capture'" class="view">
        <!-- Ajout ultra-rapide -->
        <form class="add" @submit.prevent="addCard">
          <input
            ref="titreInput" v-model="draft.titre" class="add-titre"
            type="text" placeholder="Nouveau process / besoin…  (titre court)"
            autocomplete="off" spellcheck="false"
          />
          <input
            v-model="draft.description" class="add-desc"
            type="text" placeholder="Description courte (optionnel)"
            autocomplete="off"
          />
          <div class="add-row">
            <div class="seg" role="group" aria-label="Équipe">
              <button
                v-for="eq in EQUIPES" :key="eq" type="button"
                class="seg-btn" :class="{ on: draft.equipe === eq }"
                @click="draft.equipe = eq"
              >{{ eq }}</button>
            </div>

            <div class="seg type" role="group" aria-label="Type de réponse">
              <button
                v-for="t in TYPE_ORDER" :key="t" type="button"
                class="seg-btn" :class="{ on: draft.type === t }"
                :style="draft.type === t ? { '--c': typeColor(t) } : {}"
                @click="draft.type = t"
                :title="TYPES[t].sub"
              ><span class="tdot" :style="{ background: typeColor(t) }" />{{ typeLabel(t) }}</button>
            </div>

            <button type="submit" class="btn-primary">Ajouter</button>
          </div>
        </form>

        <!-- Filtres + total -->
        <div class="filters">
          <div class="filter-grp">
            <span class="f-lbl">Équipe</span>
            <div class="chips">
              <button class="chip" :class="{ on: filterEquipe === 'all' }" @click="filterEquipe = 'all'">Toutes</button>
              <button v-for="eq in EQUIPES" :key="eq" class="chip" :class="{ on: filterEquipe === eq }" @click="filterEquipe = eq">{{ eq }}</button>
            </div>
          </div>
          <div class="filter-grp">
            <span class="f-lbl">Type</span>
            <div class="chips">
              <button class="chip" :class="{ on: filterType === 'all' }" @click="filterType = 'all'">Tous</button>
              <button
                v-for="t in TYPE_ORDER" :key="t" class="chip" :class="{ on: filterType === t }"
                :style="filterType === t ? { '--c': typeColor(t) } : {}"
                @click="filterType = t"
              ><span class="tdot" :style="{ background: typeColor(t) }" />{{ typeLabel(t) }}</button>
            </div>
          </div>
          <div class="filter-grp">
            <span class="f-lbl">Owner</span>
            <div class="chips">
              <button class="chip" :class="{ on: filterOwner === 'all' }" @click="filterOwner = 'all'">Tous</button>
              <button
                v-for="o in OWNERS" :key="o" class="chip" :class="{ on: filterOwner === o }"
                @click="filterOwner = o"
              ><span class="ava xs" :style="{ background: ownerColor(o) }">{{ o[0] }}</span>{{ o }}</button>
              <button class="chip" :class="{ on: filterOwner === 'none' }" @click="filterOwner = 'none'">Non assigné</button>
            </div>
          </div>
          <span class="result-count">{{ filtered.length }} / {{ counts.total }}</span>
        </div>

        <!-- Liste éditable -->
        <div v-if="filtered.length" class="cards">
          <article
            v-for="c in filtered" :key="c.id" class="card"
            :style="{ '--c': typeColor(c.type) }"
          >
            <span class="card-stripe" />
            <div class="card-main">
              <div class="card-head">
                <input v-model="c.titre" class="c-titre" type="text" placeholder="Titre" />
                <button
                  class="c-notes" :class="{ has: !!(c.details || '').trim() }"
                  @click="openDetails(c.id)"
                  :title="(c.details || '').trim() ? 'Voir / éditer les détails' : 'Ajouter des détails'"
                  aria-label="Détails du cas d’usage"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" /></svg>
                </button>
                <button class="x" @click="removeCard(c.id)" aria-label="Supprimer">
                  <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" /></svg>
                </button>
              </div>
              <input v-model="c.description" class="c-desc" type="text" placeholder="Description courte…" />
              <button
                v-if="(c.details || '').trim()" type="button" class="c-detail-preview"
                @click="openDetails(c.id)" title="Voir les détails"
              >{{ detailPreview(c.details) }}</button>

              <div class="card-meta">
                <select v-model="c.equipe" class="mini-select">
                  <option v-for="eq in EQUIPES" :key="eq" :value="eq">{{ eq }}</option>
                </select>
                <select v-model="c.type" class="mini-select type" :style="{ '--c': typeColor(c.type) }">
                  <option v-for="t in TYPE_ORDER" :key="t" :value="t">{{ typeLabel(t) }}</option>
                </select>
                <select v-model="c.owner" class="mini-select owner" :class="{ assigned: !!c.owner }" :style="c.owner ? { '--c': ownerColor(c.owner) } : null" title="Owner du cas d'usage">
                  <option :value="null">Owner —</option>
                  <option v-for="o in OWNERS" :key="o" :value="o">{{ o }}</option>
                </select>
              </div>

              <div class="card-sources">
                <span class="cs-lbl">Sources</span>
                <button v-for="id in (c.sources || [])" :key="id" type="button" class="src-chip rm" @click="removeSourceFrom(c, id)" :title="'Retirer ' + nodeLabel(id)">{{ nodeLabel(id) }}<span class="x-mini">✕</span></button>
                <select class="src-add" @change="addSourceTo(c, $event.target.value); $event.target.value = ''" title="Ajouter une source de données">
                  <option value="">+ source</option>
                  <option v-for="n in availableSources(c)" :key="n.id" :value="n.id">{{ n.label }}</option>
                </select>
              </div>

              <div class="ratings">
                <div v-for="r in RATINGS" :key="r.key" class="rating">
                  <div class="rating-top">
                    <span class="r-lbl">{{ r.label }}</span>
                    <span class="r-val">{{ c[r.key] }}</span>
                  </div>
                  <input type="range" min="1" max="5" step="1" v-model.number="c[r.key]" :style="fillStyle(c[r.key])" />
                </div>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="empty">
          <p>Aucun process à afficher.</p>
          <span>Ajustez les filtres ou ajoutez une carte ci-dessus.</span>
        </div>
      </section>

      <!-- ═══════════════════ VUE · STACK ═══════════════════ -->
      <section v-show="activeTab === 'stack'" class="view">
        <div class="stack-head">
          <div>
            <h2>Stack de données</h2>
            <p class="muted">Cartographie reconstituée. Cliquez un <b>cas d’usage</b> pour tracer ses sources, ou un <b>bloc</b> pour voir qui en dépend. Libellés éditables.</p>
          </div>
          <div class="legend">
            <span class="lg"><span class="sw hub-sw" />Point de convergence</span>
            <span class="lg"><span class="sw cours-sw" />Contenu de cours</span>
          </div>
        </div>

        <!-- Sélecteur de cas d'usage -->
        <div class="uc-strip">
          <span class="f-lbl">Cas d’usage</span>
          <div class="chips">
            <button class="chip" :class="{ on: !stackSelectedCardId }" @click="selectStackCard(null)">Exploration</button>
            <button
              v-for="c in cards" :key="c.id" class="chip uc"
              :class="{ on: stackSelectedCardId === c.id }"
              :style="stackSelectedCardId === c.id ? { '--c': typeColor(c.type), borderColor: typeColor(c.type), color: typeColor(c.type) } : {}"
              @click="selectStackCard(c.id)"
            ><span class="tdot" :style="{ background: typeColor(c.type) }" />{{ c.titre }}</button>
          </div>
        </div>

        <div class="stack-wrap">
          <svg class="stackmap" viewBox="0 0 1080 660" preserveAspectRatio="xMidYMid meet">
            <defs>
              <marker id="arw" markerWidth="9" markerHeight="9" refX="7.5" refY="3" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                <path d="M0 0 L7.5 3 L0 6 Z" fill="context-stroke" />
              </marker>
            </defs>

            <!-- Bandes de groupe -->
            <g v-for="g in STACK_GROUPS" :key="g.id">
              <rect class="grp-band" :x="g.x" y="58" :width="g.w" height="566" rx="16" />
              <text class="grp-label" :x="g.x + g.w / 2" y="46">{{ g.label }}</text>
            </g>

            <!-- Arêtes -->
            <path
              v-for="(e, i) in stackEdges" :key="'e' + i"
              class="sedge" :class="{ hi: edgeActive(e), same: e.same }"
              :d="edgePath(e)"
              :style="edgeActive(e) ? { stroke: highlightColor } : {}"
              :marker-end="e.same ? null : 'url(#arw)'"
              :marker-start="e.bidir ? 'url(#arw)' : null"
            />
            <!-- Étiquettes d'arêtes -->
            <template v-for="(e, i) in stackEdges" :key="'el' + i">
              <text
                v-if="e.label" class="sedge-lbl" :class="{ same: e.same, hi: edgeActive(e) }"
                :x="edgeLabelPos(e).x" :y="edgeLabelPos(e).y"
                :style="edgeActive(e) ? { fill: highlightColor } : {}"
              >{{ e.label }}</text>
            </template>

            <!-- Blocs -->
            <g
              v-for="n in stackNodes" :key="n.id"
              class="snode"
              :class="{ active: nodeActive(n.id), sel: stackSelectedNodeId === n.id, hub: n.hub, dim: stackCard && !nodeActive(n.id) }"
              :style="nodeActive(n.id) ? { '--hl': highlightColor } : {}"
              :transform="`translate(${n.x - NODE_W / 2} ${n.y - NODE_H / 2})`"
              @click="onNodeClick(n.id)"
            >
              <rect class="snode-bg" :width="NODE_W" :height="NODE_H" rx="11" />
              <text class="snode-label" :x="NODE_W / 2" :y="NODE_H / 2 - 2">{{ n.label }}</text>
              <text class="snode-kind" :x="NODE_W / 2" :y="NODE_H / 2 + 14">{{ KIND_LABEL[n.kind] }}</text>
              <circle v-if="n.content" class="cours-dot" cx="13" cy="13" r="4" />
              <g v-if="!stackCard && depCount(n.id)" class="ndot-badge" :transform="`translate(${NODE_W - 5} 5)`">
                <circle r="11" />
                <text>{{ depCount(n.id) }}</text>
              </g>
            </g>
          </svg>

          <!-- Panneau latéral -->
          <aside class="stack-panel">
            <template v-if="stackCard">
              <div class="sp-head"><span class="tdot" :style="{ background: typeColor(stackCard.type) }" /><strong>{{ stackCard.titre }}</strong></div>
              <div class="sp-sub">{{ stackCard.equipe }} · {{ typeLabel(stackCard.type) }}</div>
              <p class="sp-hint">Cliquez les blocs dont ce cas a besoin — <b>{{ (stackCard.sources || []).length }}</b> source(s).</p>
              <div class="sp-chips">
                <button v-for="id in (stackCard.sources || [])" :key="id" class="src-chip rm" @click="toggleSource(id)">{{ nodeLabel(id) }}<span class="x-mini">✕</span></button>
                <span v-if="!(stackCard.sources || []).length" class="sp-empty">Aucune source. Cliquez un bloc sur la carte.</span>
              </div>
              <button class="btn-ghost sm sp-close" @click="selectStackCard(null)">Terminer</button>
            </template>

            <template v-else-if="selectedStackNode">
              <div class="sp-head"><strong>Bloc</strong><span v-if="selectedStackNode.hub" class="hub-badge">convergence</span></div>
              <input class="sp-rename" v-model="selectedStackNode.label" spellcheck="false" />
              <div class="sp-sub">{{ KIND_LABEL[selectedStackNode.kind] }}<template v-if="selectedStackNode.content"> · contenu de cours</template></div>
              <p class="sp-hint"><b>{{ depCount(selectedStackNode.id) }}</b> cas d’usage en dépendent :</p>
              <div class="sp-deps">
                <div v-for="c in nodeDependents(selectedStackNode.id)" :key="c.id" class="sp-dep" @click="selectStackCard(c.id)">
                  <span class="tdot" :style="{ background: typeColor(c.type) }" /><span class="sp-dep-t">{{ c.titre }}</span>
                </div>
                <span v-if="!depCount(selectedStackNode.id)" class="sp-empty">Aucun cas d’usage rattaché.</span>
              </div>

              <p class="sp-hint sp-sec">Connexions <span class="sp-sec-hint">(cliquer pour relier / délier)</span></p>
              <div class="sp-chips">
                <template v-for="n in stackNodes" :key="n.id">
                  <button
                    v-if="n.id !== selectedStackNode.id" type="button"
                    class="conn-chip" :class="{ on: edgeExists(selectedStackNode.id, n.id) }"
                    @click="toggleEdge(selectedStackNode.id, n.id)"
                  >{{ n.label }}</button>
                </template>
              </div>

              <div class="sp-actions">
                <button class="btn-ghost sm danger" @click="removeNode(selectedStackNode.id)">Supprimer le bloc</button>
                <button class="btn-ghost sm" @click="stackSelectedNodeId = null">Fermer</button>
              </div>
            </template>

            <template v-else>
              <div class="sp-head"><strong>Points de convergence</strong></div>
              <p class="sp-hint">Les blocs dont dépendent le plus de cas d’usage :</p>
              <div class="sp-deps">
                <div v-for="n in convergence" :key="n.id" class="sp-conv" @click="stackSelectedNodeId = n.id">
                  <span class="conv-count">{{ n.count }}</span><span class="sp-dep-t">{{ n.label }}</span>
                </div>
                <span v-if="!convergence.length" class="sp-empty">Aucune source rattachée pour l’instant.</span>
              </div>

              <div class="sp-add">
                <p class="sp-hint sp-sec">Ajouter un bloc</p>
                <input class="sp-add-input" v-model="newNode.label" placeholder="Nom du bloc…" spellcheck="false" @keydown.enter="addNode" />
                <div class="sp-add-row">
                  <select class="mini-select" v-model="newNode.group">
                    <option v-for="g in STACK_GROUPS" :key="g.id" :value="g.id">{{ g.label }}</option>
                  </select>
                  <button class="btn-dark sm" type="button" @click="addNode">Ajouter</button>
                </div>
              </div>

              <p class="sp-hint dim-hint">Sélectionnez un cas d’usage en haut pour cartographier ses sources, ou cliquez un bloc.</p>
            </template>
          </aside>
        </div>
      </section>

      <!-- ═══════════════════ VUE 2 · MATRICE ═══════════════════ -->
      <section v-show="activeTab === 'matrice'" class="view">
        <div class="matrix-head">
          <div>
            <h2>Impact × Effort</h2>
            <p class="muted">Taille = douleur · couleur = type · cliquez une bulle pour l’ajuster en direct.</p>
          </div>
          <div class="legend">
            <span v-for="t in TYPE_ORDER" :key="t" class="lg"><span class="sw" :style="{ background: typeColor(t) }" />{{ typeLabel(t) }}<i v-if="t === 'Both'" class="lg-sub">(Software + GenAI)</i></span>
          </div>
        </div>

        <div class="matrix-wrap">
          <svg class="matrix" :viewBox="`0 0 ${VB.w} ${VB.h}`" preserveAspectRatio="xMidYMid meet">
            <!-- Quadrants -->
            <rect :x="plot.x" :y="plot.y" :width="plot.w / 2" :height="plot.h / 2" class="q-win" />
            <line :x1="plot.x + plot.w / 2" :y1="plot.y" :x2="plot.x + plot.w / 2" :y2="plot.y + plot.h" class="q-div" />
            <line :x1="plot.x" :y1="plot.y + plot.h / 2" :x2="plot.x + plot.w" :y2="plot.y + plot.h / 2" class="q-div" />

            <!-- Grille -->
            <g class="grid">
              <line v-for="t in ticks" :key="'gx' + t" :x1="xEffort(t)" :y1="plot.y" :x2="xEffort(t)" :y2="plot.y + plot.h" />
              <line v-for="t in ticks" :key="'gy' + t" :x1="plot.x" :y1="yImpact(t)" :x2="plot.x + plot.w" :y2="yImpact(t)" />
            </g>

            <!-- Cadre -->
            <rect :x="plot.x" :y="plot.y" :width="plot.w" :height="plot.h" class="frame" />

            <!-- Étiquettes de quadrant -->
            <text :x="plot.x + 16" :y="plot.y + 30" class="q-lbl start">Quick wins</text>
            <text :x="plot.x + plot.w - 16" :y="plot.y + 30" class="q-lbl end">Gros paris</text>
            <text :x="plot.x + 16" :y="plot.y + plot.h - 18" class="q-lbl start dim">Hygiène / petits gestes</text>
            <text :x="plot.x + plot.w - 16" :y="plot.y + plot.h - 18" class="q-lbl end dim">À challenger</text>

            <!-- Graduations -->
            <g class="ticks">
              <text v-for="t in ticks" :key="'tx' + t" :x="xEffort(t)" :y="plot.y + plot.h + 24" class="tick">{{ t }}</text>
              <text v-for="t in ticks" :key="'ty' + t" :x="plot.x - 18" :y="yImpact(t) + 5" class="tick">{{ t }}</text>
            </g>

            <!-- Axes -->
            <text :x="plot.x + plot.w / 2" :y="VB.h - 22" class="axis">EFFORT&nbsp; ·&nbsp; faible → fort</text>
            <text class="axis" :transform="`translate(26 ${plot.y + plot.h / 2}) rotate(-90)`">IMPACT&nbsp; ·&nbsp; faible → fort</text>

            <!-- Bulles -->
            <g
              v-for="b in bubbles" :key="b.card.id"
              class="bubble"
              :class="{ sel: selectedId === b.card.id, dim: hoveredId && hoveredId !== b.card.id }"
              :style="{ transform: `translate(${b.x}px, ${b.y}px)` }"
              @mouseenter="hoveredId = b.card.id"
              @mouseleave="hoveredId = null"
              @click.stop="selectedId = selectedId === b.card.id ? null : b.card.id"
            >
              <circle v-if="selectedId === b.card.id" class="halo" :r="b.r + 10" :style="{ fill: typeColor(b.card.type) }" />
              <circle class="bub" :r="b.r" :style="{ fill: typeColor(b.card.type) }" />
            </g>
          </svg>

          <!-- Tooltip (overlay HTML, positionné en % → suit le SVG quelle que soit l'échelle) -->
          <div
            v-if="hovered" class="tip" :class="{ below: tipBelow }"
            :style="{ left: (hovered.x / VB.w * 100) + '%', top: (hovered.y / VB.h * 100) + '%' }"
          >
            <div class="tip-head">
              <span class="tdot" :style="{ background: typeColor(hovered.card.type) }" />
              <strong>{{ hovered.card.titre }}</strong>
            </div>
            <div class="tip-meta">{{ hovered.card.equipe }} · {{ typeLabel(hovered.card.type) }}<template v-if="hovered.card.owner"> · {{ hovered.card.owner }}</template></div>
            <div class="tip-grid">
              <span>Douleur <b>{{ hovered.card.douleur }}</b></span>
              <span>Impact <b>{{ hovered.card.impact }}</b></span>
              <span>Effort <b>{{ hovered.card.effort }}</b></span>
              <span>Confiance <b>{{ hovered.card.confiance }}</b></span>
            </div>
          </div>

          <!-- Panneau d'édition live -->
          <Transition name="panel">
            <aside v-if="selectedCard" class="edit-panel" :style="{ '--c': typeColor(selectedCard.type) }">
              <div class="ep-head">
                <span class="tdot" :style="{ background: typeColor(selectedCard.type) }" />
                <input v-model="selectedCard.titre" class="ep-titre" />
                <button class="x" @click="selectedId = null" aria-label="Fermer">
                  <svg viewBox="0 0 14 14"><path d="M3 3l8 8M11 3l-8 8" /></svg>
                </button>
              </div>
              <div class="ep-meta">{{ selectedCard.equipe }} · {{ typeLabel(selectedCard.type) }}<template v-if="selectedCard.owner"> · {{ selectedCard.owner }}</template></div>
              <div class="ratings">
                <div v-for="r in RATINGS" :key="r.key" class="rating">
                  <div class="rating-top"><span class="r-lbl">{{ r.label }}</span><span class="r-val">{{ selectedCard[r.key] }}</span></div>
                  <input type="range" min="1" max="5" step="1" v-model.number="selectedCard[r.key]" :style="fillStyle(selectedCard[r.key])" />
                </div>
              </div>
              <p class="ep-hint">Bougez les curseurs : la bulle se replace en direct.</p>
            </aside>
          </Transition>
        </div>
      </section>

      <!-- ═══════════════════ VUE 3 · PRIORISATION ═══════════════════ -->
      <section v-show="activeTab === 'priorisation'" class="view">
        <div class="prio-head">
          <h2>Priorisation</h2>
          <p class="formula">Score = (Impact × Douleur) ÷ Effort, pondéré par la Confiance (× Confiance / 5)</p>
        </div>
        <div v-if="prioritized.length" class="prio-list">
          <article v-for="row in prioritized" :key="row.card.id" class="prio" :class="{ top: row.rank <= 3 }" :style="{ '--c': typeColor(row.card.type) }">
            <div class="rank">{{ row.rank }}</div>
            <div class="prio-body">
              <div class="prio-titleline">
                <span class="tdot" :style="{ background: typeColor(row.card.type) }" />
                <strong>{{ row.card.titre }}</strong>
                <span class="prio-tags">
                  <span class="tag">{{ row.card.equipe }}</span>
                  <span class="tag" :style="{ '--c': typeColor(row.card.type) }">{{ typeLabel(row.card.type) }}</span>
                  <span v-if="row.card.owner" class="owner-tag" :title="'Owner : ' + row.card.owner"><span class="ava" :style="{ background: ownerColor(row.card.owner) }">{{ row.card.owner[0] }}</span>{{ row.card.owner }}</span>
                </span>
              </div>
              <div class="bar"><span class="bar-fill" :style="{ width: row.pct + '%', background: typeColor(row.card.type) }" /></div>
              <div class="factors">
                <span>D <b>{{ row.card.douleur }}</b></span>
                <span>I <b>{{ row.card.impact }}</b></span>
                <span>E <b>{{ row.card.effort }}</b></span>
                <span>C <b>{{ row.card.confiance }}</b></span>
              </div>
            </div>
            <div class="prio-score"><span class="num">{{ row.s.toFixed(1) }}</span><span class="lbl">score</span></div>
          </article>
        </div>
        <div v-else class="empty"><p>Rien à prioriser pour l’instant.</p></div>
      </section>

      <!-- ═══════════════════ VUE 4 · SÉQUENCEMENT ═══════════════════ -->
      <section v-show="activeTab === 'sequencement'" class="view">
        <div class="seq-head">
          <div class="seq-head-left">
            <h2>Séquencement</h2>
            <p class="muted">{{ seqMode === 'kanban' ? 'Triez vite en Maintenant / Ensuite / Plus tard.' : 'Posez chaque chantier sur les mois — glissez le corps pour décaler, les bords pour la durée, ou saisissez à la main.' }}</p>
          </div>
          <div class="seg mode" role="group" aria-label="Mode de séquencement">
            <button type="button" class="seg-btn" :class="{ on: seqMode === 'kanban' }" @click="seqMode = 'kanban'">Kanban</button>
            <button type="button" class="seg-btn" :class="{ on: seqMode === 'roadmap' }" @click="seqMode = 'roadmap'">Roadmap</button>
          </div>
        </div>

        <!-- ─── KANBAN (tri rapide) ─── -->
        <div v-show="seqMode === 'kanban'">
          <div
            class="backlog" :class="{ over: dragOver === 'backlog' }"
            @dragover.prevent="dragOver = 'backlog'" @dragleave="dragOver = null" @drop="onDrop('backlog')"
          >
            <div class="bl-label">À trier<span class="cnt">{{ cards.filter(c => !c.sequence || c.sequence === 'backlog').length }}</span></div>
            <div class="bl-cards">
              <div
                v-for="c in cards.filter(c => !c.sequence || c.sequence === 'backlog')" :key="c.id"
                class="seq-card" draggable="true" :style="{ '--c': typeColor(c.type) }"
                @dragstart="onDragStart(c.id, $event)" @dragend="dragId = null"
              >
                <span class="sc-title">{{ c.titre }}</span>
                <div class="sc-moves">
                  <button v-for="s in SEQ" :key="s.id" class="mv" @click="setSequence(c.id, s.id)" :title="s.label">{{ s.label[0] }}</button>
                </div>
              </div>
              <span v-if="!cards.some(c => !c.sequence || c.sequence === 'backlog')" class="bl-empty">Tout est séquencé.</span>
            </div>
          </div>

          <div class="columns">
            <div
              v-for="s in SEQ" :key="s.id" class="column" :class="{ over: dragOver === s.id }"
              @dragover.prevent="dragOver = s.id" @dragleave="dragOver = null" @drop="onDrop(s.id)"
            >
              <header class="col-head">
                <div><h3>{{ s.label }}</h3><span class="col-sub">{{ s.sub }}</span></div>
                <span class="col-cnt">{{ cards.filter(c => c.sequence === s.id).length }}</span>
              </header>
              <div class="col-body">
                <article
                  v-for="c in cards.filter(c => c.sequence === s.id)" :key="c.id"
                  class="seq-card big" draggable="true" :style="{ '--c': typeColor(c.type) }"
                  @dragstart="onDragStart(c.id, $event)" @dragend="dragId = null"
                >
                  <span class="card-stripe" />
                  <div class="sc-body">
                    <strong>{{ c.titre }}</strong>
                    <div class="sc-meta">
                      <span class="tag">{{ c.equipe }}</span>
                      <span class="tag" :style="{ '--c': typeColor(c.type) }">{{ typeLabel(c.type) }}</span>
                      <span v-if="c.owner" class="owner-tag" :title="'Owner : ' + c.owner"><span class="ava" :style="{ background: ownerColor(c.owner) }">{{ c.owner[0] }}</span>{{ c.owner }}</span>
                    </div>
                  </div>
                  <div class="sc-moves col">
                    <button v-for="o in SEQ" :key="o.id" class="mv" :class="{ on: o.id === s.id }" @click="setSequence(c.id, o.id)" :title="o.label">{{ o.label[0] }}</button>
                    <button class="mv back" @click="setSequence(c.id, 'backlog')" title="Renvoyer au tri">↩</button>
                  </div>
                </article>
                <div v-if="!cards.some(c => c.sequence === s.id)" class="col-empty">Déposez ici</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ─── ROADMAP (timeline mensuelle) ─── -->
        <div v-show="seqMode === 'roadmap'" class="roadmap">
          <div v-if="anchor == null" class="empty"><p>Chargement…</p></div>
          <template v-else>
            <div class="rm-toolbar">
              <div class="rm-horizon">
                <span class="f-lbl">Horizon</span>
                <div class="seg sm">
                  <button v-for="h in [6, 12, 18]" :key="h" type="button" class="seg-btn" :class="{ on: horizon === h }" @click="setHorizon(h)">{{ h }} mois</button>
                </div>
              </div>
              <button class="btn-ghost sm" @click="fillFromKanban">Pré-remplir depuis le Kanban</button>
            </div>

            <!-- Éditeur de la carte sélectionnée -->
            <Transition name="fade">
              <div v-if="selectedRoadmapCard" class="rm-editor" :style="{ '--c': typeColor(selectedRoadmapCard.type) }">
                <span class="tdot" :style="{ background: typeColor(selectedRoadmapCard.type) }" />
                <strong class="rm-ed-title">{{ selectedRoadmapCard.titre }}</strong>
                <label class="rm-field">Début
                  <select class="mini-select" :value="selectedRoadmapCard.start" @change="setStart(selectedRoadmapCard, +$event.target.value)">
                    <option v-for="t in timeline" :key="t.abs" :value="t.abs">{{ t.label }} {{ t.year }}</option>
                  </select>
                </label>
                <label class="rm-field">Durée
                  <span class="stepper">
                    <button type="button" @click="setDuration(selectedRoadmapCard, selectedRoadmapCard.duration - 1)">−</button>
                    <span class="step-val">{{ selectedRoadmapCard.duration }} <i>mois</i></span>
                    <button type="button" @click="setDuration(selectedRoadmapCard, selectedRoadmapCard.duration + 1)">+</button>
                  </span>
                </label>
                <button class="btn-ghost sm danger" @click="removeFromRoadmap(selectedRoadmapCard)">Retirer</button>
              </div>
            </Transition>

            <!-- Gantt -->
            <div class="gantt">
              <div class="gantt-head">
                <div class="lane-label head"></div>
                <div class="gantt-cols">
                  <div class="year-bands">
                    <div v-for="b in yearBands" :key="b.year" class="year-band" :style="{ flex: b.span }">{{ b.year }}</div>
                  </div>
                  <div class="month-cells">
                    <div v-for="t in timeline" :key="t.abs" class="month-cell" :class="{ now: t.isNow }">
                      <span>{{ t.label }}</span>
                      <em v-if="t.isNow">auj.</em>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="placed.length" class="gantt-body">
                <div v-for="c in placed" :key="c.id" class="gantt-row" :style="{ '--c': typeColor(c.type) }">
                  <div class="lane-label">
                    <span class="tdot" :style="{ background: typeColor(c.type) }" />
                    <span class="ll-title">{{ c.titre }}</span>
                    <span v-if="c.owner" class="ava sm ll-owner" :style="{ background: ownerColor(c.owner) }" :title="'Owner : ' + c.owner">{{ c.owner[0] }}</span>
                    <span class="ll-team">{{ c.equipe }}</span>
                  </div>
                  <div class="lane-track">
                    <div v-for="t in timeline" :key="t.abs" class="track-cell" :class="{ now: t.isNow }" />
                    <div
                      class="bar" :class="{ sel: selectedRoadmapId === c.id }"
                      :style="{ left: barLeft(c) + '%', width: barWidth(c) + '%', background: typeColor(c.type) }"
                      @pointerdown="onBarPointerDown(c, 'move', $event)"
                    >
                      <span class="handle l" @pointerdown.stop="onBarPointerDown(c, 'left', $event)" />
                      <span class="bar-label">{{ rangeLabel(c) }}</span>
                      <span class="handle r" @pointerdown.stop="onBarPointerDown(c, 'right', $event)" />
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="gantt-empty">Aucun chantier planifié. Posez-en un depuis « À planifier », ou cliquez « Pré-remplir depuis le Kanban ».</div>
            </div>

            <!-- À planifier -->
            <div class="backlog rm">
              <div class="bl-label">À planifier<span class="cnt">{{ unplaced.length }}</span></div>
              <div class="bl-cards">
                <div v-for="c in unplaced" :key="c.id" class="seq-card rm" :style="{ '--c': typeColor(c.type) }">
                  <span class="card-stripe" />
                  <span class="sc-title">{{ c.titre }}</span>
                  <button class="mv add" @click="placeOnRoadmap(c)" title="Poser sur la roadmap">+ Roadmap</button>
                </div>
                <span v-if="!unplaced.length" class="bl-empty">Tout est planifié.</span>
              </div>
            </div>
          </template>
        </div>
      </section>
    </main>

    <!-- ╔═ MODALES ═══════════════════════════════════════════════════════╗ -->
    <Transition name="fade">
      <div v-if="showReset" class="overlay" @click.self="showReset = false">
        <div class="modal">
          <h3>Réinitialiser l’atelier ?</h3>
          <p>Toutes les cartes saisies seront <b>remplacées</b> par les 5 exemples de départ. Action irréversible.</p>
          <div class="modal-actions">
            <button class="btn-ghost" @click="showReset = false">Annuler</button>
            <button class="btn-dark" @click="doReset">Réinitialiser</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Éditeur de détails d'un cas d'usage -->
    <Transition name="fade">
      <div v-if="detailCard" class="overlay" @click.self="closeDetails" @keydown.esc="closeDetails">
        <div class="modal modal-details">
          <div class="md-head">
            <span class="tdot" :style="{ background: typeColor(detailCard.type) }" />
            <h3>{{ detailCard.titre || 'Cas d’usage' }}</h3>
            <button class="x" @click="closeDetails" aria-label="Fermer">
              <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" /></svg>
            </button>
          </div>
          <p class="md-sub">Décrivez le cas d’usage en détail — collez vos notes, un email, un cahier des charges. Sauvegarde automatique.</p>
          <textarea
            ref="detailInput"
            v-model="detailCard.details"
            class="md-textarea"
            placeholder="Contexte, objectif, périmètre, données concernées, critères de succès, risques…"
          />
          <div class="modal-actions">
            <span class="md-count">{{ (detailCard.details || '').length }} caractères</span>
            <button class="btn-ghost" :disabled="!(detailCard.details || '').trim()" @click="copyDetails">{{ detailCopied ? 'Copié ✓' : 'Copier' }}</button>
            <button class="btn-dark" @click="closeDetails">Fermer</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style>
/* ── Reset & fondations ─────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }
html, body, #__nuxt { height: 100%; }
body { margin: 0; }

:root {
  color-scheme: light;
  --bg: #FBFAFE;
  --panel: #FFFFFF;
  --surface: #F3F1FA;
  --surface-2: #ECE8F6;
  --ink: #19141F;
  --ink-soft: #4A4459;
  --muted: #6E6780;
  --faint: #A49DB6;
  --line: #E8E4F1;
  --line-soft: #F1EEF8;
  --line-strong: #D7D1E5;
  --track: #E8E4F1;
  --tint-base: #FFFFFF;
  --solid-bg: #19141F;
  --on-accent: #FFFFFF;
  --accent: #50228F;
  --accent-strong: #311461;
  --accent-soft: #EFEAFD;
  --pop: #FF4DC2;
  --danger: #C0241B;
  --danger-soft: #FDECEA;
  --danger-line: #F3C9C5;
  --ok: #0E7A5F;
  --ok-soft: #E4F6EF;
  --ok-line: #BCE6D6;
  --ok-dot: #12A150;
  --ok-glow: rgba(18, 161, 80, .18);
  --shadow-sm: 0 1px 2px rgba(34, 18, 56, .05), 0 1px 3px rgba(34, 18, 56, .06);
  --shadow-md: 0 6px 18px rgba(34, 18, 56, .08), 0 2px 6px rgba(34, 18, 56, .05);
  --shadow-lg: 0 20px 52px rgba(34, 18, 56, .18);
  --radius: 14px;
  --font: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #141019;
  --panel: #1C1726;
  --surface: #251F33;
  --surface-2: #2E2740;
  --ink: #F3F0F9;
  --ink-soft: #C7C0D6;
  --muted: #9A93AB;
  --faint: #6E6780;
  --line: #322B43;
  --line-soft: #241E30;
  --line-strong: #423A56;
  --track: #3A3350;
  --tint-base: #1C1726;
  --solid-bg: #37314C;
  --on-accent: #FFFFFF;
  --accent: #C0A4F2;
  --accent-strong: #DCCBFB;
  --accent-soft: #2A2140;
  --pop: #FF6FD0;
  --danger: #FF8A82;
  --danger-soft: #361715;
  --danger-line: #58241F;
  --ok: #46D6A6;
  --ok-soft: #15302A;
  --ok-line: #245044;
  --ok-dot: #2BD27E;
  --ok-glow: rgba(43, 210, 126, .22);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, .4), 0 1px 3px rgba(0, 0, 0, .3);
  --shadow-md: 0 6px 18px rgba(0, 0, 0, .45), 0 2px 6px rgba(0, 0, 0, .3);
  --shadow-lg: 0 20px 52px rgba(0, 0, 0, .55);
}

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-size: 15px;
  line-height: 1.45;
}

button, input, select { font-family: inherit; font-size: inherit; color: inherit; }
h1, h2, h3 { margin: 0; font-weight: 650; letter-spacing: -0.02em; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }

.app { max-width: 1280px; margin: 0 auto; padding: 0 28px 64px; }

/* ── En-tête ────────────────────────────────────────────────────────────── */
.topbar {
  display: flex; align-items: center; gap: 28px;
  padding: 22px 4px 18px;
}
.brand { display: flex; align-items: center; gap: 13px; }
.logo { width: 31px; height: 31px; flex: none; }
.logo circle { mix-blend-mode: multiply; }
:root[data-theme="dark"] .logo circle { mix-blend-mode: screen; }
.brand-txt h1 { font-size: 19px; }
.brand-txt p { margin: 1px 0 0; font-size: 12.5px; color: var(--muted); }

.counts { margin-left: auto; display: flex; align-items: center; gap: 20px; }
.count-total { display: flex; align-items: baseline; gap: 6px; }
.count-total .num { font-size: 26px; font-weight: 680; letter-spacing: -0.03em; }
.count-total .lbl { font-size: 12.5px; color: var(--muted); }
.count-split { display: flex; gap: 7px; }
.count-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 999px;
  background: color-mix(in srgb, var(--c) 8%, var(--tint-base));
  border: 1px solid color-mix(in srgb, var(--c) 18%, var(--tint-base));
  font-size: 12.5px; color: var(--ink-soft);
}
.count-pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
.count-pill b { color: var(--ink); }
.count-pill .pl { color: var(--muted); }

.sync-pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 540; color: var(--accent-strong); background: var(--accent-soft); border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--tint-base)); white-space: nowrap; }
.sync-pill.on { color: var(--ok); background: var(--ok-soft); border-color: var(--ok-line); }
.sync-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.sync-pill.on .sync-dot { background: var(--ok-dot); box-shadow: 0 0 0 3px var(--ok-glow); animation: syncpulse 2s ease-in-out infinite; }
@keyframes syncpulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }

.theme-btn { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--line); background: transparent; color: var(--ink-soft); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: background .16s ease, color .16s ease, border-color .16s ease; flex: none; }
.theme-btn:hover { background: var(--surface); color: var(--accent); border-color: var(--line-strong); }
.theme-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.theme-btn .moon { fill: currentColor; stroke: none; }

/* ── Boutons génériques ─────────────────────────────────────────────────── */
.btn-primary, .btn-dark, .btn-ghost {
  border: none; border-radius: 10px; padding: 10px 18px;
  font-weight: 560; cursor: pointer; transition: all .16s ease;
}
.btn-primary { background: var(--solid-bg); color: #fff; box-shadow: var(--shadow-sm); }
.btn-primary:hover { filter: brightness(1.14); transform: translateY(-1px); }
.btn-dark { background: var(--solid-bg); color: #fff; }
.btn-dark:hover { filter: brightness(1.14); }
.btn-ghost { background: transparent; border: 1px solid var(--line); color: var(--ink-soft); }
.btn-ghost:hover { background: var(--panel); border-color: var(--line-strong); }
.btn-ghost.danger:hover { color: var(--danger); border-color: var(--danger-line); background: var(--danger-soft); }

/* ── Onglets ────────────────────────────────────────────────────────────── */
.tabs {
  display: flex; gap: 4px; padding: 4px;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; width: fit-content; margin-bottom: 26px;
}
.tab {
  border: none; background: transparent; cursor: pointer;
  padding: 8px 18px; border-radius: 9px; font-weight: 550; color: var(--muted);
  transition: all .16s ease;
}
.tab:hover { color: var(--ink); }
.tab.active { background: var(--panel); color: var(--accent); box-shadow: var(--shadow-sm); }

.view { animation: viewIn .28s ease; }
@keyframes viewIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* ── CAPTURE · formulaire d'ajout ───────────────────────────────────────── */
.add {
  background: var(--panel); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 18px; box-shadow: var(--shadow-sm);
  margin-bottom: 18px;
}
.add-titre {
  width: 100%; border: none; background: transparent;
  font-size: 20px; font-weight: 600; letter-spacing: -0.02em; padding: 4px 2px;
}
.add-titre::placeholder { color: var(--faint); font-weight: 600; }
.add-desc {
  width: 100%; border: none; background: transparent;
  font-size: 14px; color: var(--ink-soft); padding: 2px 2px 10px;
  border-bottom: 1px solid var(--line-soft); margin-bottom: 14px;
}
.add-desc::placeholder { color: var(--faint); }
.add-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

.seg { display: inline-flex; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 3px; gap: 2px; }
.seg-btn {
  border: none; background: transparent; cursor: pointer;
  padding: 7px 12px; border-radius: 7px; font-size: 13px; font-weight: 520; color: var(--muted);
  display: inline-flex; align-items: center; gap: 7px; transition: all .14s ease;
}
.seg-btn:hover { color: var(--ink); }
.seg-btn.on { background: var(--panel); color: var(--ink); box-shadow: var(--shadow-sm); }
.seg.type .seg-btn.on { color: var(--c); }
.tdot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }

.add-row .btn-primary { margin-left: auto; }

/* ── CAPTURE · filtres ──────────────────────────────────────────────────── */
.filters { display: flex; align-items: center; gap: 26px; padding: 4px 4px 16px; flex-wrap: wrap; }
.filter-grp { display: flex; align-items: center; gap: 10px; }
.f-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--faint); font-weight: 600; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  border: 1px solid var(--line); background: var(--panel); cursor: pointer;
  padding: 6px 12px; border-radius: 999px; font-size: 13px; color: var(--muted);
  display: inline-flex; align-items: center; gap: 6px; transition: all .14s ease;
}
.chip:hover { color: var(--ink); border-color: var(--line-strong); }
.chip.on { background: var(--solid-bg); color: #fff; border-color: var(--ink); }
.chip.on .tdot { box-shadow: 0 0 0 2px rgba(255,255,255,.25); }
.result-count { margin-left: auto; font-size: 13px; color: var(--faint); font-variant-numeric: tabular-nums; }

/* ── CAPTURE · cartes ───────────────────────────────────────────────────── */
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 14px; }
.card {
  position: relative; background: var(--panel); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow-sm); overflow: hidden;
  transition: box-shadow .18s ease, transform .18s ease;
}
.card:hover { box-shadow: var(--shadow-md); }
.card-stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--c); }
.card-main { padding: 16px 18px 18px; }
.card-head { display: flex; align-items: flex-start; gap: 10px; }
.c-titre { flex: 1; border: none; background: transparent; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; padding: 0; }
.c-titre::placeholder { color: var(--faint); }
.x {
  border: none; background: transparent; cursor: pointer; color: var(--faint);
  width: 26px; height: 26px; border-radius: 7px; flex: none; display: inline-flex; align-items: center; justify-content: center;
  transition: all .14s ease;
}
.x svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
.x:hover { background: var(--danger-soft); color: var(--danger); }
.c-desc { width: 100%; border: none; background: transparent; font-size: 13.5px; color: var(--muted); padding: 4px 0 12px; }
.c-desc::placeholder { color: var(--faint); }

/* Bouton « notes » dans l'en-tête de carte — calqué sur .x, mais en accent quand des détails existent. */
.c-notes {
  border: none; background: transparent; cursor: pointer; color: var(--faint);
  width: 26px; height: 26px; border-radius: 7px; flex: none; display: inline-flex; align-items: center; justify-content: center;
  transition: all .14s ease;
}
.c-notes svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
.c-notes:hover { background: var(--accent-soft); color: var(--accent); }
.c-notes.has { color: var(--accent); }
/* Aperçu une ligne des détails, cliquable → ouvre la modale. Tronqué proprement. */
.c-detail-preview {
  display: block; width: 100%; text-align: left; cursor: pointer;
  border: none; border-left: 2px solid color-mix(in srgb, var(--accent) 35%, var(--line));
  background: transparent; font-family: inherit;
  margin: 0 0 12px; padding: 1px 0 1px 10px;
  font-size: 12.5px; line-height: 1.5; color: var(--muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: color .14s ease, border-color .14s ease;
}
.c-detail-preview:hover { color: var(--ink-soft); border-left-color: var(--accent); }

.card-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--line-soft); margin-bottom: 14px; }
.mini-select {
  appearance: none; -webkit-appearance: none;
  border: 1px solid var(--line); background: var(--panel) ; border-radius: 8px;
  padding: 6px 26px 6px 11px; font-size: 13px; font-weight: 500; cursor: pointer; color: var(--ink-soft);
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 3.5L5 6.5L8 3.5' stroke='%2371717A' fill='none' stroke-width='1.4' stroke-linecap='round'/></svg>");
  background-repeat: no-repeat; background-position: right 9px center;
}
.mini-select:hover { border-color: var(--line-strong); }
.mini-select.type { color: var(--c); font-weight: 550; border-color: color-mix(in srgb, var(--c) 30%, var(--tint-base)); }
.mini-select.owner.assigned { color: var(--c); font-weight: 550; border-color: color-mix(in srgb, var(--c) 30%, var(--tint-base)); }

/* Owner — pastille d'identité (initiale sur fond coloré) réutilisée dans toutes les vues. */
.ava { width: 16px; height: 16px; border-radius: 50%; display: inline-grid; place-items: center; color: #fff; font-size: 9.5px; font-weight: 700; line-height: 1; flex: none; }
.ava.sm { width: 14px; height: 14px; font-size: 8.5px; }
.ava.xs { width: 13px; height: 13px; font-size: 8px; }
.owner-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); font-weight: 540; }
.ll-owner { margin-left: auto; }

/* Ratings / sliders */
.ratings { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 22px; }
.rating-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 7px; }
.r-lbl { font-size: 12px; font-weight: 560; color: var(--ink-soft); }
.r-val { font-size: 13px; font-weight: 680; color: var(--ink); font-variant-numeric: tabular-nums; }

input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 16px; background: transparent; cursor: pointer; display: block; }
input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: linear-gradient(to right, var(--ink) 0 var(--fill, 50%), var(--track) var(--fill, 50%) 100%); }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 15px; height: 15px; margin-top: -5.5px; border-radius: 50%; background: #fff; border: 1.5px solid var(--ink); box-shadow: var(--shadow-sm); transition: border-color .14s ease, transform .14s ease; }
input[type=range]:hover::-webkit-slider-thumb { border-color: var(--accent-strong); transform: scale(1.12); }
input[type=range]::-moz-range-track { height: 4px; border-radius: 999px; background: var(--track); }
input[type=range]::-moz-range-progress { height: 4px; border-radius: 999px; background: var(--solid-bg); }
input[type=range]::-moz-range-thumb { width: 15px; height: 15px; border-radius: 50%; background: #fff; border: 1.5px solid var(--ink); box-shadow: var(--shadow-sm); }

.empty { text-align: center; padding: 70px 20px; color: var(--muted); }
.empty p { font-size: 16px; font-weight: 550; margin: 0 0 6px; color: var(--ink-soft); }
.empty span { font-size: 13.5px; color: var(--faint); }

/* ── MATRICE ────────────────────────────────────────────────────────────── */
.matrix-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 14px; flex-wrap: wrap; }
.matrix-head h2 { font-size: 18px; }
.muted { color: var(--muted); font-size: 13px; margin: 4px 0 0; }
.legend { display: flex; gap: 16px; flex-wrap: wrap; }
.lg { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--ink-soft); }
.lg .sw { width: 11px; height: 11px; border-radius: 50%; }
.lg-sub { font-style: normal; color: var(--faint); margin-left: 3px; }

.matrix-wrap { position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-sm); padding: 8px; }
.matrix { width: 100%; height: auto; display: block; }

.q-win { fill: color-mix(in srgb, var(--accent) 7%, var(--tint-base)); }
.q-div { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 5; }
.grid line { stroke: var(--line-soft); stroke-width: 1; }
.frame { fill: none; stroke: var(--line); stroke-width: 1.2; }
.q-lbl { font-size: 13px; font-weight: 640; letter-spacing: 0.02em; fill: var(--ink-soft); text-transform: uppercase; }
.q-lbl.dim { fill: var(--faint); font-weight: 580; }
.q-lbl.start { text-anchor: start; }
.q-lbl.end { text-anchor: end; }
.ticks .tick { font-size: 12px; fill: var(--faint); text-anchor: middle; font-variant-numeric: tabular-nums; }
.axis { font-size: 11.5px; fill: var(--muted); text-anchor: middle; letter-spacing: 0.1em; font-weight: 600; }

.bubble { cursor: pointer; transition: transform .55s cubic-bezier(.22, .61, .36, 1); }
.bubble .bub { transition: r .4s ease, fill .3s ease, opacity .2s ease; transform-box: fill-box; transform-origin: center; animation: pop .42s cubic-bezier(.34,1.56,.64,1) both; }
.bubble .bub { fill-opacity: .82; stroke: rgba(255,255,255,.85); stroke-width: 2; }
.bubble:hover .bub { fill-opacity: .95; }
.bubble.dim .bub { opacity: .35; }
.bubble.sel .bub { fill-opacity: 1; }
.halo { fill-opacity: .14; }
@keyframes pop { from { transform: scale(.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }

/* Tooltip */
.tip {
  position: absolute; transform: translate(-50%, calc(-100% - 16px));
  background: var(--solid-bg); color: #fff; border-radius: 11px; padding: 11px 13px;
  box-shadow: var(--shadow-lg); pointer-events: none; z-index: 5; width: max-content; max-width: 240px;
  animation: tipIn .14s ease;
}
.tip.below { transform: translate(-50%, 16px); }
@keyframes tipIn { from { opacity: 0; } to { opacity: 1; } }
.tip-head { display: flex; align-items: center; gap: 7px; font-size: 13.5px; }
.tip-head strong { font-weight: 600; }
.tip-meta { font-size: 11.5px; color: rgba(255,255,255,.6); margin: 3px 0 8px; }
.tip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; font-size: 12px; color: rgba(255,255,255,.7); }
.tip-grid b { color: #fff; font-weight: 650; }

/* Panneau d'édition */
.edit-panel {
  position: absolute; top: 14px; right: 14px; width: 290px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
  box-shadow: var(--shadow-lg); padding: 16px; z-index: 6;
}
.ep-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.ep-titre { flex: 1; border: none; background: transparent; font-size: 15px; font-weight: 620; padding: 0; }
.ep-meta { font-size: 12px; color: var(--muted); margin-bottom: 14px; padding-left: 16px; }
.edit-panel .ratings { grid-template-columns: 1fr; gap: 13px; }
.ep-hint { font-size: 11.5px; color: var(--faint); margin: 14px 0 0; font-style: italic; }
.panel-enter-active, .panel-leave-active { transition: opacity .2s ease, transform .2s ease; }
.panel-enter-from, .panel-leave-to { opacity: 0; transform: translateX(12px); }

/* ── PRIORISATION ───────────────────────────────────────────────────────── */
.prio-head { margin-bottom: 18px; }
.prio-head h2 { font-size: 18px; }
.formula { margin: 6px 0 0; font-size: 13px; color: var(--muted); }
.prio-list { display: flex; flex-direction: column; gap: 10px; }
.prio {
  display: flex; align-items: center; gap: 16px; background: var(--panel);
  border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; box-shadow: var(--shadow-sm);
  transition: box-shadow .18s ease;
}
.prio:hover { box-shadow: var(--shadow-md); }
.prio.top { border-color: color-mix(in srgb, var(--accent) 40%, var(--tint-base)); background: linear-gradient(90deg, var(--accent-soft) 0%, var(--panel) 60%); }
.rank { font-size: 17px; font-weight: 700; color: var(--faint); width: 26px; text-align: center; font-variant-numeric: tabular-nums; }
.prio.top .rank { color: var(--accent-strong); }
.prio-body { flex: 1; min-width: 0; }
.prio-titleline { display: flex; align-items: center; gap: 9px; margin-bottom: 9px; flex-wrap: wrap; }
.prio-titleline strong { font-size: 15px; font-weight: 600; }
.prio-tags { display: inline-flex; gap: 6px; }
.tag { font-size: 11px; padding: 2px 9px; border-radius: 999px; background: var(--surface); color: var(--muted); font-weight: 540; }
.tag[style] { background: color-mix(in srgb, var(--c) 11%, var(--tint-base)); color: var(--c); }
.bar { height: 6px; background: var(--line-soft); border-radius: 999px; overflow: hidden; margin-bottom: 8px; }
.bar-fill { display: block; height: 100%; border-radius: 999px; transition: width .5s cubic-bezier(.22,.61,.36,1); }
.factors { display: flex; gap: 16px; font-size: 12px; color: var(--muted); }
.factors b { color: var(--ink); font-weight: 650; }
.prio-score { text-align: right; }
.prio-score .num { display: block; font-size: 22px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.prio-score .lbl { font-size: 11px; color: var(--faint); text-transform: uppercase; letter-spacing: 0.06em; }

/* ── SÉQUENCEMENT ───────────────────────────────────────────────────────── */
.seq-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
.seq-head h2 { font-size: 18px; }
.seg.mode { align-self: center; }
.backlog { background: var(--panel); border: 1px dashed var(--line); border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; transition: border-color .15s, background .15s; }
.backlog.over { border-color: var(--accent); background: var(--accent-soft); }
.bl-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--faint); font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.bl-label .cnt { background: var(--surface); color: var(--muted); border-radius: 999px; padding: 1px 8px; font-size: 11px; }
.bl-cards { display: flex; gap: 8px; flex-wrap: wrap; }
.bl-empty { font-size: 13px; color: var(--faint); padding: 4px; }

.seq-card {
  position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 8px 10px; display: flex; align-items: center; gap: 10px; cursor: grab; box-shadow: var(--shadow-sm);
  transition: box-shadow .15s, transform .15s;
}
.seq-card:active { cursor: grabbing; }
.seq-card:hover { box-shadow: var(--shadow-md); }
.seq-card .sc-title { font-size: 13px; font-weight: 540; }
.sc-moves { display: inline-flex; gap: 3px; }
.sc-moves.col { flex-direction: column; }
.mv { width: 22px; height: 22px; border: 1px solid var(--line); background: var(--panel); border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600; color: var(--muted); transition: all .13s; }
.mv:hover { border-color: var(--ink); color: var(--ink); }
.mv.on { background: var(--solid-bg); color: #fff; border-color: var(--ink); }
.mv.back { color: var(--faint); }

.columns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.column { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 6px; min-height: 320px; transition: border-color .15s, background .15s; }
.column.over { border-color: var(--accent); background: var(--accent-soft); }
.col-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 12px 12px; }
.col-head h3 { font-size: 15px; }
.col-sub { font-size: 12px; color: var(--muted); }
.col-cnt { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; font-size: 13px; font-weight: 650; }
.col-body { display: flex; flex-direction: column; gap: 8px; padding: 4px; min-height: 60px; }
.seq-card.big { align-items: flex-start; padding: 12px 12px 12px 16px; overflow: hidden; }
.seq-card.big .card-stripe { width: 3px; }
.sc-body { flex: 1; min-width: 0; }
.sc-body strong { font-size: 13.5px; font-weight: 600; display: block; margin-bottom: 7px; }
.sc-meta { display: flex; gap: 5px; flex-wrap: wrap; }
.col-empty { text-align: center; color: var(--faint); font-size: 12.5px; padding: 26px 0; border: 1px dashed var(--line); border-radius: 10px; }

/* ── Modales ────────────────────────────────────────────────────────────── */
.overlay { position: fixed; inset: 0; background: rgba(23, 23, 27, .42); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.modal { background: var(--panel); border-radius: 16px; box-shadow: var(--shadow-lg); padding: 28px; max-width: 440px; width: 100%; }
.modal h3 { font-size: 18px; margin-bottom: 10px; }
.modal h3 i { color: var(--accent-strong); font-style: italic; }
.modal p { font-size: 14px; color: var(--ink-soft); line-height: 1.55; margin: 0 0 8px; }
.info-line b { color: var(--ink); }
.modal-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 22px; }

/* ── Modale de détails (éditeur focalisé) ─────────────────────────────────── */
.modal-details { max-width: 600px; }
.md-head { display: flex; align-items: center; gap: 9px; margin-bottom: 6px; }
.md-head h3 { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-head .x { flex: none; }
.md-head .x:hover { background: var(--surface-2); color: var(--ink); }   /* close neutre (pas rouge) */
.md-sub { font-size: 13px; color: var(--muted); margin: 0 0 14px; line-height: 1.5; }
.md-textarea {
  width: 100%; min-height: 240px; max-height: 56vh; resize: vertical; display: block;
  border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink);
  padding: 14px 16px; font-family: inherit; font-size: 14px; line-height: 1.65;
  transition: border-color .14s ease, background .14s ease;
}
.md-textarea::placeholder { color: var(--faint); }
.md-textarea:focus { outline: none; border-color: var(--accent); background: var(--panel); }
.md-count { font-size: 12px; color: var(--faint); margin-right: auto; font-variant-numeric: tabular-nums; }
.btn-ghost:disabled { opacity: .45; cursor: default; }
.btn-ghost:disabled:hover { background: transparent; border-color: var(--line); }
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ── ROADMAP / GANTT ────────────────────────────────────────────────────── */
.rm-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
.rm-horizon { display: flex; align-items: center; gap: 12px; }
.seg.sm .seg-btn { padding: 6px 11px; font-size: 12.5px; }
.btn-ghost.sm { padding: 8px 14px; font-size: 13px; border-radius: 10px; }
.btn-ghost.sm.danger:hover { color: var(--danger); border-color: var(--danger-line); background: var(--danger-soft); }

.rm-editor { display: flex; align-items: center; gap: 18px; background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--c); border-radius: 12px; padding: 12px 18px; margin-bottom: 16px; box-shadow: var(--shadow-sm); flex-wrap: wrap; }
.rm-ed-title { font-size: 14.5px; font-weight: 620; margin-right: auto; }
.rm-field { display: flex; align-items: center; gap: 9px; font-size: 12.5px; color: var(--muted); font-weight: 500; }
.stepper { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--line); border-radius: 9px; padding: 2px; background: var(--panel); }
.stepper button { width: 28px; height: 26px; border: none; background: transparent; border-radius: 7px; cursor: pointer; font-size: 16px; color: var(--ink-soft); line-height: 1; }
.stepper button:hover { background: var(--surface); color: var(--ink); }
.step-val { font-size: 13px; font-weight: 600; padding: 0 6px; min-width: 58px; text-align: center; color: var(--ink); }
.step-val i { color: var(--muted); font-weight: 400; font-style: normal; }

.gantt { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow-sm); overflow: hidden; }
.gantt-head { display: flex; border-bottom: 1px solid var(--line); }
.lane-label { width: 230px; flex: none; padding: 0 16px; display: flex; align-items: center; gap: 9px; border-right: 1px solid var(--line); }
.gantt-head .lane-label.head { min-height: 56px; }
.gantt-cols { flex: 1; min-width: 0; }
.year-bands { display: flex; border-bottom: 1px solid var(--line-soft); }
.year-band { text-align: center; font-size: 11px; font-weight: 680; letter-spacing: 0.1em; color: var(--muted); padding: 6px 0; border-right: 1px solid var(--line-soft); min-width: 0; }
.year-band:last-child { border-right: none; }
.month-cells { display: flex; }
.month-cell { flex: 1; min-width: 0; text-align: center; padding: 8px 0; font-size: 11.5px; color: var(--muted); border-right: 1px solid var(--line-soft); display: flex; flex-direction: column; align-items: center; gap: 1px; }
.month-cell:last-child { border-right: none; }
.month-cell.now { background: var(--accent-soft); color: var(--accent-strong); font-weight: 650; }
.month-cell em { font-size: 9px; font-style: normal; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent-strong); }

.gantt-row { display: flex; align-items: stretch; border-bottom: 1px solid var(--line-soft); }
.gantt-row:last-child { border-bottom: none; }
.gantt-row .lane-label { min-height: 52px; }
.ll-title { font-size: 13px; font-weight: 540; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ll-team { margin-left: auto; font-size: 10.5px; color: var(--faint); flex: none; padding-left: 8px; }
.lane-track { flex: 1; min-width: 0; position: relative; display: flex; }
.track-cell { flex: 1; min-width: 0; border-right: 1px solid var(--line-soft); }
.track-cell:last-child { border-right: none; }
.track-cell.now { background: color-mix(in srgb, var(--accent) 5%, transparent); }

.bar { position: absolute; top: 50%; transform: translateY(-50%); height: 30px; border-radius: 9px; cursor: grab; display: flex; align-items: center; box-shadow: var(--shadow-sm); opacity: .9; touch-action: none; user-select: none; transition: left .2s cubic-bezier(.22,.61,.36,1), width .2s cubic-bezier(.22,.61,.36,1), box-shadow .15s, opacity .15s; }
.bar:hover { opacity: 1; box-shadow: var(--shadow-md); }
.bar:active { cursor: grabbing; }
.bar.sel { outline: 2px solid var(--ink); outline-offset: 2px; opacity: 1; z-index: 2; }
.bar-label { color: #fff; font-size: 11.5px; font-weight: 600; padding: 0 6px; margin: 0 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; text-shadow: 0 1px 1px rgba(0,0,0,.18); }
.handle { width: 10px; align-self: stretch; flex: none; cursor: ew-resize; border-radius: 9px; position: relative; }
.handle::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 2px; height: 12px; border-radius: 2px; background: rgba(255,255,255,0); transition: background .15s; }
.bar:hover .handle::after { background: rgba(255,255,255,.55); }
.dragging-bar { cursor: ew-resize; }
.dragging-bar .bar { transition: none !important; }

.gantt-empty { padding: 44px 20px; text-align: center; color: var(--faint); font-size: 13.5px; }

.backlog.rm { margin-top: 16px; margin-bottom: 0; }
.seq-card.rm { position: relative; overflow: hidden; padding-left: 14px; }
.mv.add { width: auto; padding: 0 11px; height: 26px; font-size: 11.5px; font-weight: 600; color: var(--accent-strong); border-color: color-mix(in srgb, var(--accent) 35%, var(--tint-base)); }
.mv.add:hover { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-strong); }

/* ── STACK ─────────────────────────────────────────────────────────────── */
.stack-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 14px; flex-wrap: wrap; }
.stack-head h2 { font-size: 18px; }
.hub-sw { background: transparent; border: 2px solid var(--accent); }
.cours-sw { background: var(--accent); }

.uc-strip { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.uc-strip .chips { gap: 6px; }
.uc-strip .chip.uc { max-width: 270px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uc-strip .chip.uc.on { background: #fff; font-weight: 560; }

.stack-wrap { display: flex; gap: 16px; align-items: stretch; }
.stackmap { flex: 1; min-width: 0; height: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow-sm); }

.grp-band { fill: var(--surface); stroke: var(--line-soft); stroke-width: 1; }
.grp-label { fill: var(--faint); font-size: 12px; font-weight: 680; letter-spacing: 0.1em; text-transform: uppercase; text-anchor: middle; }

.sedge { fill: none; stroke: var(--line-strong); stroke-width: 1.6; transition: stroke .2s ease, stroke-width .2s ease; }
.sedge.hi { stroke-width: 2.6; }
.sedge.same { stroke-dasharray: 4 5; stroke: var(--line-strong); }
.sedge-lbl { fill: var(--muted); font-size: 10px; font-weight: 500; text-anchor: middle; paint-order: stroke; stroke: var(--panel); stroke-width: 3.5px; stroke-linejoin: round; pointer-events: none; }
.sedge-lbl.same { fill: var(--faint); font-style: italic; }
.sedge-lbl.hi { font-weight: 600; }

.snode { cursor: pointer; }
.snode-bg { fill: var(--panel); stroke: var(--line); stroke-width: 1.4; transition: fill .18s ease, stroke .18s ease; }
.snode:hover .snode-bg { stroke: var(--line-strong); }
.snode.hub .snode-bg { stroke: var(--accent); stroke-width: 2; }
.snode.active .snode-bg { fill: color-mix(in srgb, var(--hl) 12%, var(--tint-base)); stroke: var(--hl); stroke-width: 2.2; }
.snode.sel .snode-bg { stroke: var(--ink); stroke-width: 2.2; }
.snode.dim { opacity: .38; }
.snode-label { text-anchor: middle; font-size: 13px; font-weight: 600; fill: var(--solid-bg); }
.snode-kind { text-anchor: middle; font-size: 9.5px; font-weight: 500; fill: var(--faint); text-transform: uppercase; letter-spacing: 0.04em; }
.cours-dot { fill: var(--accent); stroke: #fff; stroke-width: 1.5; }
.ndot-badge circle { fill: var(--solid-bg); }
.ndot-badge text { fill: #fff; font-size: 11px; font-weight: 700; text-anchor: middle; dominant-baseline: central; }

.stack-panel { width: 300px; flex: none; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow-sm); padding: 18px; display: flex; flex-direction: column; }
.sp-head { display: flex; align-items: center; gap: 8px; }
.sp-head strong { font-size: 15px; font-weight: 620; }
.hub-badge { margin-left: auto; font-size: 10px; font-weight: 600; color: var(--accent-strong); background: var(--accent-soft); padding: 2px 8px; border-radius: 999px; }
.sp-sub { font-size: 12px; color: var(--muted); margin: 4px 0 12px; }
.sp-rename { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; font-size: 14px; font-weight: 600; margin: 6px 0 8px; }
.sp-rename:focus { border-color: var(--accent); outline: none; }
.sp-hint { font-size: 12.5px; color: var(--ink-soft); margin: 0 0 10px; }
.sp-hint.dim-hint { color: var(--faint); margin-top: 14px; }
.sp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.src-chip { background: var(--surface); border-radius: 7px; padding: 3px 9px; font-size: 11.5px; color: var(--ink-soft); border: none; }
.src-chip.rm { cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.src-chip.rm:hover { background: var(--danger-soft); color: var(--danger); }
.x-mini { font-size: 9px; opacity: .6; }
.sp-empty { font-size: 12px; color: var(--faint); }
.sp-deps { display: flex; flex-direction: column; gap: 6px; }
.sp-dep, .sp-conv { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 9px; cursor: pointer; font-size: 12.5px; transition: background .14s ease; }
.sp-dep:hover, .sp-conv:hover { background: var(--surface); }
.sp-dep-t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-count { width: 22px; height: 22px; flex: none; display: inline-flex; align-items: center; justify-content: center; background: var(--solid-bg); color: #fff; border-radius: 7px; font-size: 12px; font-weight: 700; }
.sp-close { margin-top: 14px; align-self: flex-start; }
.sp-sec { margin-top: 18px; font-weight: 600; color: var(--ink-soft); border-top: 1px solid var(--line-soft); padding-top: 14px; }
.sp-sec-hint { font-weight: 400; color: var(--faint); font-size: 11px; }
.conn-chip { border: 1px solid var(--line); background: var(--panel); border-radius: 999px; padding: 4px 10px; font-size: 11.5px; color: var(--muted); cursor: pointer; transition: all .14s ease; }
.conn-chip:hover { border-color: var(--line-strong); color: var(--ink); }
.conn-chip.on { background: var(--solid-bg); color: #fff; border-color: var(--ink); }
.sp-actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
.sp-add { margin-top: 2px; }
.sp-add-input { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 13px; margin-bottom: 8px; }
.sp-add-input:focus { border-color: var(--accent); outline: none; }
.sp-add-row { display: flex; gap: 8px; }
.sp-add-row .mini-select { flex: 1; }
.btn-primary.sm, .btn-dark.sm { padding: 8px 14px; font-size: 13px; border-radius: 9px; }

.card-sources { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding-bottom: 14px; margin-top: -2px; }
.cs-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--faint); font-weight: 600; }
.src-add { appearance: none; -webkit-appearance: none; border: 1px dashed var(--line-strong); background: transparent; border-radius: 7px; padding: 3px 10px; font-size: 11.5px; font-weight: 540; color: var(--muted); cursor: pointer; font-family: inherit; transition: border-color .14s ease, color .14s ease; }
.src-add:hover { border-color: var(--accent); color: var(--accent); }
.src-add:focus-visible { outline: none; border-color: var(--accent); color: var(--accent); }

@media (max-width: 880px) {
  .columns { grid-template-columns: 1fr; }
  .ratings { grid-template-columns: 1fr; }
  .counts { width: 100%; order: 3; margin-left: 0; }
  .lane-label { width: 150px; padding: 0 10px; }
  .ll-team { display: none; }
  .stack-wrap { flex-direction: column; }
  .stack-panel { width: auto; }
}

/* ── Mobile / iPhone ───────────────────────────────────────────────────── */
@media (max-width: 680px) {
  .app { padding: 0 12px calc(40px + env(safe-area-inset-bottom)); }

  /* En-tête : compact, les compteurs passent sur une 2e ligne */
  .topbar { gap: 10px 12px; padding: 14px 2px 10px; flex-wrap: wrap; }
  .brand-txt h1 { font-size: 17px; }
  .brand-txt p { display: none; }
  .counts { order: 5; width: 100%; gap: 10px; flex-wrap: wrap; margin-left: 0; }
  .count-total .num { font-size: 21px; }
  .count-split { flex-wrap: wrap; }
  .topbar .btn-ghost.danger { padding: 9px 12px; font-size: 13px; }

  /* Onglets : défilement horizontal, jamais coupés */
  .tabs { width: 100%; overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { white-space: nowrap; flex: none; }

  /* Capture : formulaire empilé */
  .add { padding: 14px; }
  .add-titre { font-size: 17px; }
  .add-row { gap: 8px; }
  .add-row .seg { flex: 1 1 100%; overflow-x: auto; scrollbar-width: none; }
  .add-row .seg::-webkit-scrollbar { display: none; }
  .add-row .btn-primary { margin-left: 0; flex: 1 1 100%; }
  .cards { grid-template-columns: 1fr; }
  .filters { gap: 12px; }
  .filter-grp { flex: 1 1 100%; }
  .result-count { margin-left: 0; }

  /* Matrice : panneau d'édition en bottom-sheet */
  .edit-panel { position: fixed; left: 10px; right: 10px; bottom: 10px; top: auto; width: auto; z-index: 40; max-height: 58vh; overflow-y: auto; }
  .panel-enter-from, .panel-leave-to { transform: translateY(18px); opacity: 0; }
  .matrix-head { gap: 10px; }
  .legend { gap: 10px 14px; }

  /* Priorisation : la ligne s'enroule proprement */
  .prio { flex-wrap: wrap; gap: 10px 14px; }
  .prio-body { flex: 1 1 100%; order: 3; }
  .prio-score { margin-left: auto; }

  /* Stack : sélecteur et chips défilent */
  .uc-strip .chips { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; scrollbar-width: none; }
  .uc-strip .chips::-webkit-scrollbar { display: none; }
  .lane-label { width: 116px; padding: 0 8px; }
  .gantt-head .lane-label.head { min-height: 48px; }

  /* Roadmap : barres un peu plus hautes pour le tactile */
  .bar { height: 34px; }
  .mv { width: 26px; height: 26px; }

  /* Modales : presque pleine largeur */
  .modal { padding: 22px 18px; border-radius: 14px; }
}

</style>
