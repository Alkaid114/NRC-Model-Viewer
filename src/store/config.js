import { reactive, ref, watch, watchEffect } from 'vue'
import { platform } from '../platform/index.js'

export const config = reactive({
  paths: {
    configFiles: '',
    uiAssets: '',
    models: '',
  },
  modelExporter: 'fmodel',
  ui: {
    theme: 'dark',
    layout: {
      costume: null,  // { leftWidth, rightSplit } — persisted by CostumeView
    },
  },
})

export const hiddenConfig = reactive({
  devMode: false,
  showAssetTags: false,
  hideMissingAssets: false,
  texFallback: false,
  showUnconfedItems: false,
  spriteShowAssetTags: false,
  spriteHideMissingAssets: true,
  spriteTexFallback: false,
  spriteShowNonHandbook: false,
})

// ── Persistence ───────────────────────────────────────────────────────────────
// _ready prevents saving before initConfig finishes loading.

const _ready = ref(false)
let saveTimer = null
let hiddenSaveTimer = null

// config is saved after every change (watchEffect tracks all nested reads).
watchEffect(() => {
  const snap = JSON.parse(JSON.stringify(config))
  if (!_ready.value) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => platform.saveConfig(snap), 400)
})

// hiddenConfig is saved only when the user explicitly changes something —
// watch() (unlike watchEffect) does not fire on mount, so the file is never
// created on first launch if the user never opens the hidden settings.
watch(hiddenConfig, snap => {
  if (!_ready.value) return
  clearTimeout(hiddenSaveTimer)
  hiddenSaveTimer = setTimeout(() => platform.saveHiddenConfig(JSON.parse(JSON.stringify(snap))), 400)
}, { deep: true })

// Toggle DevTools whenever devMode changes.
watch(() => hiddenConfig.devMode, enabled => platform.setDevTools(enabled))

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initConfig() {
  const [saved, savedHidden] = await Promise.all([
    platform.loadConfig(),
    platform.loadHiddenConfig(),
  ])
  if (saved)       _merge(config,       saved)
  if (savedHidden) _merge(hiddenConfig, savedHidden)
  _ready.value = true   // arm the watcher — next change (or this very tick) saves
}

// Deep-merge only keys that already exist in the target to prevent schema drift.
function _merge(target, source) {
  if (!source || typeof source !== 'object') return
  for (const key of Object.keys(target)) {
    if (!(key in source)) continue
    if (typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])) {
      _merge(target[key], source[key])
    } else {
      target[key] = source[key]
    }
  }
}
