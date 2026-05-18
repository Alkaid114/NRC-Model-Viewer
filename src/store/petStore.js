import { reactive, watch } from 'vue'
import { scanPetAssets, loadPetTypes, invalidatePetConfCache } from '../scanner/petScanner.js'
import { config } from './config.js'

export const petStore = reactive({
  items:    [],
  types:    [],   // { unitType, name, color, icon }[]
  scanning: false,
  progress: { done: 0, total: 0 },
  error:    null,
  scanned:  false,
})

function _resetStore() {
  invalidatePetConfCache()
  petStore.items    = []
  petStore.types    = []
  petStore.scanning = false
  petStore.scanned  = false
  petStore.error    = null
  petStore.progress = { done: 0, total: 0 }
}

watch(
  () => [config.paths.configFiles, config.paths.models],
  () => { if (petStore.scanned || petStore.error) _resetStore() }
)

export async function rescanPets() {
  if (petStore.scanning) return
  _resetStore()
  petStore.scanning = true
  try {
    const [itemsR, typesR] = await Promise.allSettled([
      scanPetAssets({ onProgress: p => { petStore.progress = p } }),
      loadPetTypes(),
    ])
    if (itemsR.status === 'rejected') throw itemsR.reason
    petStore.items  = itemsR.value
    petStore.types  = typesR.status === 'fulfilled' ? typesR.value : []
    petStore.scanned = true
  } catch (e) {
    petStore.error = e.message ?? String(e)
  } finally {
    petStore.scanning = false
  }
}
