import { platform } from '../platform/index.js'
import { config } from '../store/config.js'

const PETS_PATH_PARTS = ['Content', 'ArtRes', 'AnimSequence', 'Pets']
const CONF_SUBPATH    = ['Content', 'ScriptC', 'Data', 'Bin', 'BinDataCompressed']

// ── Config cache ───────────────────────────────────────────────────────────────

// folder_name → { id, editorName, icon }
let _modelConfByFolder  = null
// model_conf_id → { id, name, jlSmallRes, unitTypes }  — lowest petbase id per model_conf
let _petbaseByModelConf = null
// flat array of { unitType, name, color, icon }
let _petTypes           = null
// Set of petbase ids present in the handbook
let _handbookIds        = null

export function invalidatePetConfCache() {
  _modelConfByFolder  = null
  _petbaseByModelConf = null
  _petTypes           = null
  _handbookIds        = null
}

async function _loadConf(filename) {
  const root = config.paths.configFiles
  if (!root) return {}
  try {
    const text = await platform.readFile(platform.joinPath(root, ...CONF_SUBPATH, filename), 'utf-8')
    return JSON.parse(text).RocoDataRows ?? {}
  } catch {
    return {}
  }
}

// ── SKILL_COLOR_CONF ──────────────────────────────────────────────────────────

// Normalize game color values (hex string, bare hex, decimal int) to #RRGGBB CSS.
function _normalizeColor(raw) {
  if (typeof raw === 'number') {
    return '#' + (raw & 0xFFFFFF).toString(16).padStart(6, '0')
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (/^#[0-9a-f]{6}$/i.test(s)) return s
    if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(0, 7)   // strip alpha
    if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s
    if (/^[0-9a-f]{8}$/i.test(s)) return '#' + s.slice(0, 6)
  }
  return null
}

export async function loadPetTypes() {
  if (_petTypes !== null) return _petTypes
  const rows = await _loadConf('SKILL_COLOR_CONF.json')
  _petTypes = Object.values(rows)
    .filter(e => e.color && e.JL_background)
    .map(e => ({
      unitType: e.unit_type,
      name:     e.name,
      color:    _normalizeColor(e.color),
      icon:     e.JL_background,
    }))
    .filter(t => t.color !== null)
    .sort((a, b) => a.unitType - b.unitType)
  return _petTypes
}

// ── MODEL_CONF ────────────────────────────────────────────────────────────────

// Extract the first path segment after "/Pets/" from a blueprint path string.
function _petFolder(path) {
  const m = path?.match(/\/Pets\/([^/]+)\//)
  return m ? m[1] : null
}

async function _loadModelConfByFolder() {
  if (_modelConfByFolder !== null) return _modelConfByFolder
  const rows = await _loadConf('MODEL_CONF.json')
  const map = new Map()
  for (const entry of Object.values(rows)) {
    const folder = _petFolder(entry.path)
    if (!folder || map.has(folder)) continue
    map.set(folder, {
      id:         entry.id,
      editorName: entry.editor_name ?? null,
      icon:       entry.icon ?? null,
    })
  }
  return (_modelConfByFolder = map)
}

// ── PETBASE_CONF ──────────────────────────────────────────────────────────────

async function _loadPetbaseByModelConf() {
  if (_petbaseByModelConf !== null) return _petbaseByModelConf
  const rows = await _loadConf('PETBASE_CONF.json')
  const map = new Map()
  for (const entry of Object.values(rows)) {
    const key = entry.model_conf
    if (!key) continue
    // Keep only the entry with the lowest pet id per model_conf (= base form)
    const cur = map.get(key)
    if (!cur || entry.id < cur.id) {
      map.set(key, {
        id:         entry.id,
        name:       entry.name ?? null,
        jlSmallRes: entry.JL_small_res ?? null,
        unitTypes:  Array.isArray(entry.unit_type) ? entry.unit_type : [],
      })
    }
  }
  return (_petbaseByModelConf = map)
}

// ── PET_HANDBOOK_CONF ─────────────────────────────────────────────────────────

async function _loadHandbookIds() {
  if (_handbookIds !== null) return _handbookIds
  const rows = await _loadConf('PET_HANDBOOK.json')
  _handbookIds = new Set()
  for (const entry of Object.values(rows)) {
    for (const group of entry.include_petbase_id ?? []) {
      for (const id of group.petbase_id ?? []) _handbookIds.add(id)
    }
  }
  return _handbookIds
}

// ── Main scan ──────────────────────────────────────────────────────────────────

export async function scanPetAssets({ onProgress } = {}) {
  const modelsRoot = config.paths.models
  if (!modelsRoot) throw new Error('模型路径未配置')

  const petsBase = platform.joinPath(modelsRoot, ...PETS_PATH_PARTS)
  const queue = []

  let topDirs
  try { topDirs = await platform.readDir(petsBase) } catch { return [] }

  for (const { name: topName, isDir } of topDirs) {
    if (!isDir) continue
    const topPath = platform.joinPath(petsBase, topName)
    let topEntries
    try { topEntries = await platform.readDir(topPath) } catch { continue }

    const hasModel = topEntries.some(e => !e.isDir && /\.(glb|gltf)$/i.test(e.name))
    if (hasModel) {
      queue.push({ folderName: topName, folderPath: topPath, entries: topEntries })
    } else {
      for (const { name: subName, isDir: subIsDir } of topEntries) {
        if (!subIsDir) continue
        const subPath = platform.joinPath(topPath, subName)
        let subEntries
        try { subEntries = await platform.readDir(subPath) } catch { continue }
        const hasAssets = subEntries.some(e =>
          (!e.isDir && /\.(glb|gltf)$/i.test(e.name)) ||
          (e.isDir && (e.name.toLowerCase() === 'mat' || e.name.toLowerCase() === 'tex'))
        )
        if (hasAssets) {
          queue.push({ folderName: subName, folderPath: subPath, entries: subEntries })
        }
      }
    }
  }

  const [modelConfByFolder, petbaseByModelConf, handbookIds] = await Promise.all([
    _loadModelConfByFolder(),
    _loadPetbaseByModelConf(),
    _loadHandbookIds(),
  ])

  const total = queue.length
  const items = []

  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i]
    // Detect Yise subfolder (alternative color form with different textures).
    const yiseDirEntry = entry.entries.find(e => e.isDir && /^yise$/i.test(e.name))
    if (yiseDirEntry) {
      try {
        entry.yisePath    = platform.joinPath(entry.folderPath, yiseDirEntry.name)
        entry.yiseEntries = await platform.readDir(entry.yisePath)
        // Peek into Yise/Tex to record the real By_D filename (may differ from base pet name)
        const yiseTexDir = entry.yiseEntries.find(e => e.isDir && e.name.toLowerCase() === 'tex')
        if (yiseTexDir) {
          const texFiles = await platform.readDir(platform.joinPath(entry.yisePath, yiseTexDir.name))
          entry.yiseByTexFile = texFiles.find(e => !e.isDir && /_By_D\.(png|tga)$/i.test(e.name))?.name ?? null
        }
      } catch { /* ignore */ }
    }
    const item = _buildPetItem(entry, modelConfByFolder, petbaseByModelConf)
    if (item) {
      item.isInHandbook = handbookIds.size > 0 && item.petId !== null
        ? handbookIds.has(item.petId) : null
      items.push(item)
    }
    if ((i + 1) % 20 === 0 || i + 1 === total) {
      onProgress?.({ done: i + 1, total })
    }
  }

  items.sort((a, b) => {
    if (a.petId !== null && b.petId !== null) return a.petId - b.petId
    if (a.petId !== null) return -1
    if (b.petId !== null) return 1
    return a.folderName.localeCompare(b.folderName)
  })
  return _attachYiseVariants(items)
}

// ── Item builder ───────────────────────────────────────────────────────────────

function _buildPetItem({ folderName, folderPath, entries, yisePath, yiseEntries, yiseByTexFile }, modelConfByFolder, petbaseByModelConf) {
  const modelEntry  = entries.find(e => !e.isDir && /\.(glb|gltf)$/i.test(e.name))
  const matDirEntry = entries.find(e => e.isDir && e.name.toLowerCase() === 'mat')
  const texDirEntry = entries.find(e => e.isDir && e.name.toLowerCase() === 'tex')

  const modelConf = modelConfByFolder.get(folderName) ?? null
  const petbase   = modelConf ? petbaseByModelConf.get(modelConf.id) ?? null : null

  let yise = null
  if (yisePath) {
    const ym = yiseEntries?.find(e => !e.isDir && /\.(glb|gltf)$/i.test(e.name))
    const yt = yiseEntries?.find(e => e.isDir && e.name.toLowerCase() === 'tex')
    const ya = yiseEntries?.find(e => e.isDir && e.name.toLowerCase() === 'mat')
    yise = {
      folderPath:    yisePath,
      modelFile:     ym?.name ?? null,
      modelBaseName: ym ? ym.name.replace(/\.(glb|gltf)$/i, '') : null,
      texDirName:    yt?.name ?? null,
      byTexFile:     yiseByTexFile ?? null,
      assets: { model: !!ym, tex: !!yt, mat: !!ya },
    }
  }

  return {
    folderName,
    folderPath,
    name:         petbase?.name ?? modelConf?.editorName ?? folderName,
    petId:        petbase?.id ?? null,
    modelConfId:  modelConf?.id ?? null,
    unitTypes:    petbase?.unitTypes ?? [],
    jlSmallRes:   petbase?.jlSmallRes ?? null,
    icon:         modelConf?.icon ?? null,
    modelFile:     modelEntry?.name ?? null,
    modelBaseName: modelEntry ? modelEntry.name.replace(/\.(glb|gltf)$/i, '') : null,
    texDirName:    texDirEntry?.name ?? null,
    assets: {
      model: !!modelEntry,
      tex:   !!texDirEntry,
      mat:   !!matDirEntry,
    },
    yise,
  }
}

// ── Yise variants ──────────────────────────────────────────────────────────────

function _attachYiseVariants(items) {
  const byFolder = new Map(items.map(item => [item.folderName, item]))
  const yiseNames = new Set()
  for (const item of items) {
    const m = item.folderName.match(/^(.+?)_?Yise$/i)
    if (!m) continue
    const base = byFolder.get(m[1])
    if (!base) continue
    base.yise = {
      folderPath:    item.folderPath,
      modelFile:     item.modelFile,
      modelBaseName: item.modelBaseName,
      texDirName:    item.texDirName,
      assets:        item.assets,
    }
    yiseNames.add(item.folderName)
  }
  return items.filter(item => !yiseNames.has(item.folderName))
}
