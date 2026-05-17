import { reactive, watch } from 'vue'
import { scanCostumeAssets, loadSuits, loadClosetTabIcons, invalidateConfCache } from '../scanner/costumeScanner.js'
import { config } from './config.js'

export const costumeStore = reactive({
  items:          [],
  suits:          [],
  closetTabIcons: {},   // tab id (string) → frame filename stem
  matFileExt:     null, // '.json' | '.props.txt' | null — detected from scanned mat files
  scanning: false,
  progress: { done: 0, total: 0 },
  error:    null,
  scanned:  false,
})

function _resetStore() {
  invalidateConfCache()
  costumeStore.items          = []
  costumeStore.suits          = []
  costumeStore.closetTabIcons = {}
  costumeStore.matFileExt     = null
  costumeStore.scanning       = false
  costumeStore.scanned        = false
  costumeStore.error          = null
  costumeStore.progress       = { done: 0, total: 0 }
}

// Unload all scanned content whenever any root path changes.
watch(
  () => [config.paths.configFiles, config.paths.uiAssets, config.paths.models],
  () => { if (costumeStore.scanned || costumeStore.error) _resetStore() }
)

export async function rescanCostumes() {
  if (costumeStore.scanning) return
  _resetStore()
  costumeStore.scanning = true
  try {
    const [itemsR, suitsR, iconsR] = await Promise.allSettled([
      scanCostumeAssets({ onProgress: p => { costumeStore.progress = p } }),
      loadSuits(),
      loadClosetTabIcons(),
    ])
    if (itemsR.status === 'rejected') throw itemsR.reason
    costumeStore.items          = itemsR.value
    costumeStore.matFileExt     = itemsR.value.find(i => i.matFileExt)?.matFileExt ?? null
    costumeStore.suits          = suitsR.status  === 'fulfilled' ? suitsR.value  : []
    costumeStore.closetTabIcons = iconsR.status  === 'fulfilled' ? iconsR.value  : {}
    costumeStore.scanned = true
  } catch (e) {
    costumeStore.error = e.message ?? String(e)
  } finally {
    costumeStore.scanning = false
  }
}
