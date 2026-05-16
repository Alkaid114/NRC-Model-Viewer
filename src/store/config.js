import { reactive, ref, watchEffect } from 'vue'
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
  showAssetPaths: false,
})

// ── Persistence ───────────────────────────────────────────────────────────────
// Use watchEffect so Vue tracks ALL nested reactive reads automatically.
// _ready prevents saving the default values before initConfig finishes loading.

const _ready = ref(false)
let saveTimer = null

watchEffect(() => {
  // Deep-read both objects so Vue tracks every nested property.
  const snap       = JSON.parse(JSON.stringify(config))
  const snapHidden = JSON.parse(JSON.stringify(hiddenConfig))

  if (!_ready.value) return   // don't save before load completes

  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    platform.saveConfig(snap)
    platform.saveHiddenConfig(snapHidden)
  }, 400)
})

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
