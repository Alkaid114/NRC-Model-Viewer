import { platform } from '../platform/index.js'
import { config } from '../store/config.js'

// Avatar root relative to modelsRoot
const PC_PATH_PARTS = ['Content', 'ArtRes', 'AnimSequence', 'Human', 'PC']

// FASHION_ITEM_CONF.json path relative to the NRC export root (configFiles)
const CONF_SUBPATH = ['Content', 'ScriptC', 'Data', 'Bin', 'BinDataCompressed']
const SCAN_GENDERS = ['PC1', 'PC2', 'PC3']

// Types where multiple Mat IDs in one folder represent colour variants of the
// same style (hair colours, eyebrow colours, etc.).  For all other types,
// each Mat ID is an independent fashion item and gets its own card.
const SALON_TYPES = new Set(['Hr', 'Hr_Ht', 'Br', 'Et', 'Es', 'Mp', 'By'])

// ── Config cache ──────────────────────────────────────────────────────────────

let _fashionConf = null
let _suitsConf   = null
let _salonConf   = null   // Map<avatarIdStr, SalonEntry[]>

export function invalidateConfCache() {
  _fashionConf = null
  _suitsConf   = null
  _salonConf   = null
}

// Reads a conf JSON file and returns its RocoDataRows object, or {} on any failure.
async function _loadConfFile(filename) {
  const root = config.paths.configFiles
  if (!root) return {}
  try {
    const text = await platform.readFile(platform.joinPath(root, ...CONF_SUBPATH, filename), 'utf-8')
    return JSON.parse(text).RocoDataRows ?? {}
  } catch {
    return {}
  }
}

async function loadFashionConf() {
  if (_fashionConf !== null) return _fashionConf
  return (_fashionConf = await _loadConfFile('FASHION_ITEM_CONF.json'))
}

// Returns Map<avatarIdStr, SalonEntry[]>, sorted by texture_id within each group.
async function loadSalonConf() {
  if (_salonConf !== null) return _salonConf
  const rows = await _loadConfFile('SALON_ITEM_CONF.json')
  const map = new Map()
  for (const entry of Object.values(rows)) {
    if (!entry.avatar_id) continue
    const key = String(entry.avatar_id)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(entry)
  }
  for (const entries of map.values()) {
    entries.sort((a, b) => (a.texture_id ?? 0) - (b.texture_id ?? 0))
  }
  return (_salonConf = map)
}

async function loadSuitsConf() {
  if (_suitsConf !== null) return _suitsConf
  return (_suitsConf = await _loadConfFile('FASHION_SUITS_CONF.json'))
}

// ── Closet tab conf ───────────────────────────────────────────────────────────

// Returns a map of tab id (string) → icon filename stem (e.g. 'img_toushi_png')
export async function loadClosetTabIcons() {
  const rows = await _loadConfFile('CLOSET_TAB_CONF.json')
  const result = {}
  for (const [id, row] of Object.entries(rows)) {
    const icon = row.icon ?? ''
    const slash = icon.lastIndexOf('/')
    if (slash < 0) continue
    const after = icon.slice(slash + 1)
    const dot = after.indexOf('.')
    result[id] = dot >= 0 ? after.slice(0, dot) : after.replace(/'$/, '')
  }
  return result
}

// ── Suits entry ───────────────────────────────────────────────────────────────

export async function loadSuits() {
  const conf = await loadSuitsConf()
  return Object.values(conf).map(s => ({
    id:         String(s.id),
    name:       s.name ?? String(s.id),
    gender:     s.gender === 1 ? 'PC1' : s.gender === 2 ? 'PC2' : 'PC3',
    gradeName:  s.grade_name ?? null,
    suitGrade:  s.suit_grade ?? 0,
    flavorText: s.flavor_text ?? null,
    icon:       s.suits_icon ?? null,
    iconBig:    s.suits_icon_big ?? null,
    itemIds:    (s.item_id ?? []).map(String),
  }))
}

// ── Main scan entry ───────────────────────────────────────────────────────────

/**
 * Scan all costume model folders under modelsRoot and return an array of item
 * objects enriched with FASHION_ITEM_CONF metadata.
 *
 * @param {{ onProgress?: (p: {done:number, total:number}) => void }} [opts]
 * @returns {Promise<CostumeItem[]>}
 */
export async function scanCostumeAssets({ onProgress } = {}) {
  const modelsRoot = config.paths.models
  if (!modelsRoot) throw new Error('模型路径未配置')

  const [conf, salonConf] = await Promise.all([loadFashionConf(), loadSalonConf()])
  const pcBase = platform.joinPath(modelsRoot, ...PC_PATH_PARTS)

  // ── Phase 1: collect all item folder descriptors ──────────────────────────
  const queue = []

  for (const gender of SCAN_GENDERS) {
    const avatarPath = platform.joinPath(pcBase, gender, 'Avatar')
    let typeDirs
    try { typeDirs = await platform.readDir(avatarPath) } catch { continue }

    for (const { name: type, isDir } of typeDirs) {
      if (!isDir) continue
      const typePath = platform.joinPath(avatarPath, type)
      let itemDirs
      try { itemDirs = await platform.readDir(typePath) } catch { continue }

      for (const { name: itemId, isDir: d } of itemDirs) {
        if (!d) continue
        queue.push({ gender, type, itemId, path: platform.joinPath(typePath, itemId) })
      }
    }
  }

  // ── Phase 2: scan each item folder ───────────────────────────────────────
  const total = queue.length
  const items = []

  for (let i = 0; i < queue.length; i++) {
    const result = await _scanItem(queue[i], conf, salonConf)
    items.push(...result)
    if ((i + 1) % 10 === 0 || i + 1 === total) {
      onProgress?.({ done: i + 1, total })
    }
  }

  // ── Phase 3: inject config-only items (skin / pupil / decal) ─────────────
  items.push(..._configOnlyItems(salonConf))

  return items
}

// ── Config-only virtual items ─────────────────────────────────────────────────

// Types whose selectable list comes directly from SALON_ITEM_CONF without any
// filesystem model folder (each gets a unique card per avatar_id):
//   'Sk'  skin color    – SALON_ITEM_CONF entries with no `type` field  (30xxxxxx)
//   'Pu'  pupil / iris  – SALON_ITEM_CONF type 4                        (34xxxxxx)
//   'Dc'  face decal    – SALON_ITEM_CONF type 5                        (15/25xxxxxx)
function _configOnlyItems(salonConf) {
  const items = []
  for (const [avatarId, entries] of salonConf.entries()) {
    const first = entries[0]
    if (!first) continue

    const salonType = first.type
    let type = null
    if (salonType == null && String(avatarId).startsWith('30')) {
      type = 'Sk'
    } else if (salonType === 4) {
      type = 'Pu'
    } else if (salonType === 5) {
      type = 'Dc'
    } else {
      continue  // types 1/2/3 come from filesystem scan
    }

    const gNum = first.gender ?? 3
    const gender = gNum === 1 ? 'PC1' : gNum === 2 ? 'PC2' : 'PC3'

    items.push({
      gender, type,
      folderPath: null, modelFile: null, modelBaseName: null,
      id: avatarId,
      name: first.name ?? avatarId,
      typeName: null,
      quality: first.item_quality ?? 0,
      suitId: null,
      icon: first.icon ?? null,
      isSuit: false,
      hasConf: true,
      assets: { model: false, tex: false, mat: false },
      variants: entries.map(e => ({
        id: String(e.id),
        name: e.name,
        colourIds: Array.isArray(e.colour_id) ? e.colour_id : [],
        icon: e.icon ?? null,
      })),
    })
  }
  return items
}

// ── Folder → avatar_id conversion ────────────────────────────────────────────

// Salon item folders use texture-variant IDs (e.g. 20100001) that differ from
// SALON_ITEM_CONF avatar_ids (e.g. 21000001).  The 8-digit folder ID encodes:
//   G  TT  GGG  VV
//   1   2   3    2   (digit widths)
// where G=gender, TT=type code, GGG=3-digit style group, VV=variant (01 for the
// "first" folder in a group).  The avatar_id encodes G + X + GGG + BBB where X is
// the SALON_ITEM_CONF type digit and BBB is type-specific:
//   TT "01" (Hr)  → X=1, BBB = (GGGnum+1).padStart(3,'0')
//   TT "03" (Br)  → X=2, BBB = "001"
//   TT "04" (Et)  → X=3, BBB = "000"
function _folderToAvatarId(itemId) {
  const s = String(itemId)
  if (s.length !== 8) return null
  const g   = s[0]          // gender prefix digit
  const tt  = s.slice(1, 3) // 2-char type code
  const ggg = s.slice(3, 6) // 3-char style group
  switch (tt) {
    case '01': return g + '1' + ggg + String(parseInt(ggg, 10) + 1).padStart(3, '0')
    case '03': return g + '2' + ggg + '001'
    case '04': return g + '3' + ggg + '000'
    default:   return null
  }
}

// ── Item folder scan ──────────────────────────────────────────────────────────

// Returns an array of items (may be >1 for fashion types with colour variants).
async function _scanItem({ gender, type, itemId, path }, conf, salonConf) {
  let entries
  try { entries = await platform.readDir(path) } catch { return [] }

  const modelEntry = entries.find(e =>
    !e.isDir && new RegExp(`^SKM_${gender}_${type}_${itemId}\\.(glb|gltf)$`, 'i').test(e.name)
  ) ?? entries.find(e => !e.isDir && /\.(glb|gltf)$/i.test(e.name))
  const hatModelEntry = type === 'Hr'
    ? entries.find(e => !e.isDir && new RegExp(`^SKM_${gender}_Hr_Ht_${itemId}\\.(glb|gltf)$`, 'i').test(e.name))
    : null
  const matDirEntry = entries.find(e => e.isDir && e.name.toLowerCase() === 'mat')
  const texDirEntry = entries.find(e => e.isDir && e.name.toLowerCase() === 'tex')

  // Skip folders with none of the three asset types.
  if (!modelEntry && !matDirEntry && !texDirEntry) return []

  // Collect IDs that have a base material file — probe .json (FModel) first,
  // then .props.txt (UEViewer) so the detected format drives both ID extraction
  // and texture parsing.
  const matDirPath  = matDirEntry ? platform.joinPath(path, matDirEntry.name) : null
  const matJsonRe   = new RegExp(`^MI_PC[123]_${type}_(\\d{5,})(?:_Outline)?\\.json$`, 'i')
  const matPropsRe  = new RegExp(`^MI_PC[123]_${type}_(\\d{5,})(?:_Outline)?\\.props\\.txt$`, 'i')
  const matJsonIds  = await _idsFromDir(matDirPath, matJsonRe)
  const useProps    = matJsonIds.size === 0
  const matPropsIds = useProps ? await _idsFromDir(matDirPath, matPropsRe) : new Set()
  const matIds      = useProps ? matPropsIds : matJsonIds
  const matFileExt  = matJsonIds.size > 0 ? '.json' : matPropsIds.size > 0 ? '.props.txt' : null
  const baseTextureByMatId = useProps
    ? await _baseTexturesFromUEViewerProps(matDirPath, matPropsRe)
    : await _baseTexturesFromFModelJson(matDirPath, matJsonRe)

  // Collect IDs that have at least one texture file for this type: T_…_<type>_<id>_….ext
  const texRe = new RegExp(`_${type}_(\\d{5,})_`)
  const texIds = await _idsFromDir(
    texDirEntry ? platform.joinPath(path, texDirEntry.name) : null, texRe
  )

  // For Cup folders: detect jumpsuits by checking whether the same ID also has
  // a Ps (pants/skirt) component in Mat or Tex.
  let psIds = new Set()
  if (type === 'Cup') {
    const psMatJsonRe = new RegExp(`^MI_${gender}_Ps_(\\d{5,})\\.json$`)
    const psMatPropsRe = new RegExp(`^MI_${gender}_Ps_(\\d{5,})\\.props\\.txt$`)
    const psTexRe = new RegExp(`_Ps_(\\d{5,})_`)
    const psMatJsonIds  = await _idsFromDir(matDirPath, psMatJsonRe)
    const psMatPropsIds = psMatJsonIds.size === 0 ? await _idsFromDir(matDirPath, psMatPropsRe) : new Set()
    const psTexIds = await _idsFromDir(texDirEntry ? platform.joinPath(path, texDirEntry.name) : null, psTexRe)
    psIds = new Set([...psMatJsonIds, ...psMatPropsIds, ...psTexIds])
  }

  // Union of Mat and Tex IDs — "任有其一就算一个物品"; fall back to the folder's own ID.
  const allIds = new Set([...matIds, ...texIds])
  const variantIds = allIds.size > 0 ? [...allIds].sort() : [itemId]

  const base = {
    gender, type, folderPath: path,
    assetId: itemId,
    texDirName: texDirEntry?.name ?? null,
    baseTextureByMatId,
    matFileExt,
    modelFile: modelEntry?.name ?? null,
    modelBaseName: modelEntry ? modelEntry.name.replace(/\.(glb|gltf)$/i, '') : null,
    hatModelFile: hatModelEntry?.name ?? null,
    hatModelBaseName: hatModelEntry ? hatModelEntry.name.replace(/\.(glb|gltf)$/i, '') : null,
  }

  if (SALON_TYPES.has(type)) {
    // Salon items: look up from SALON_ITEM_CONF by avatar_id.
    // Folder IDs use texture-variant IDs (20100001) not avatar_ids (21000001);
    // _folderToAvatarId converts algorithmically.  Fall back to direct itemId
    // for types whose folder name already equals the avatar_id (skin, pupil, etc.).
    const candidates = [
      _folderToAvatarId(itemId),
      itemId,
    ]
    let salonEntries = []
    let avatarId = itemId
    for (const cand of candidates) {
      if (!cand) continue
      const found = salonConf?.get(cand)
      if (found?.length) { salonEntries = found; avatarId = cand; break }
    }

    // Fall back to fashionConf if SALON_ITEM_CONF has no entry.
    const baseEntry = salonEntries[0] ?? null
    const fbConf = baseEntry ? null : conf[itemId]

    return [{
      ...base,
      id: avatarId,
      name: baseEntry?.name ?? fbConf?.name ?? avatarId,
      typeName: fbConf?.type_name ?? null,
      quality: baseEntry?.item_quality ?? fbConf?.item_quality ?? 0,
      suitId: fbConf?.suits_id ?? null,
      icon: baseEntry?.icon ?? fbConf?.icon ?? null,
      isSuit: false,
      hasConf: salonEntries.length > 0 || !!fbConf,
      assets: {
        model: !!modelEntry,
        tex: texIds.size > 0,
        mat: matIds.size > 0,
      },
          variants: salonEntries.length > 0
        ? salonEntries.map(e => ({
            id: String(e.id),
            textureId: e.texture_id != null ? String(e.texture_id) : null,
            name: e.name,
            colourIds: Array.isArray(e.colour_id) ? e.colour_id : [],
            icon: e.icon ?? null,
          }))
        : [{ id: avatarId, name: null, colourIds: [], icon: null }],
    }]
  } else {
    // Fashion: each variant Mat ID → independent card
    return variantIds.map(id => {
      const c = conf[id]
      return {
        ...base,
        id,
        name: c?.name ?? id,
        typeName: c?.type_name ?? null,
        quality: c?.item_quality ?? 0,
        suitId: c?.suits_id ?? null,
        icon: c?.icon ?? null,
        isSuit: psIds.has(id),
        hasConf: !!c,
        assets: {
          model: !!modelEntry,
          tex: texIds.has(id),
          mat: matIds.has(id),
        },
        variants: [{ id, name: c?.name ?? null }],
      }
    })
  }
}

// ── Directory ID scan helper ──────────────────────────────────────────────────

// Reads dirPath and extracts the set of IDs matched by re's first capture group.
// Returns an empty Set on error or when dirPath is null.
async function _idsFromDir(dirPath, re) {
  if (!dirPath) return new Set()
  try {
    const entries = await platform.readDir(dirPath)
    const ids = new Set()
    for (const { name } of entries) {
      const m = name.match(re)
      if (m) ids.add(m[1])
    }
    return ids
  } catch {
    return new Set()
  }
}

// FModel：从 Mat/ 目录的 MI_*.json 里读 BaseTex → ObjectPath，
// 返回 { matId → 相对 png 路径 }
async function _baseTexturesFromFModelJson(dirPath, re) {
  const result = {}
  if (!dirPath) return result
  try {
    const entries = await platform.readDir(dirPath)
    for (const { name, isDir } of entries) {
      if (isDir) continue
      const m = name.match(re)
      if (!m) continue
      try {
        const text = await platform.readFile(platform.joinPath(dirPath, name), 'utf-8')
        const data = JSON.parse(text)
        const props = Array.isArray(data) ? data[0]?.Properties : data?.Properties
        const texParams = props?.TextureParameterValues ?? []
        const base = texParams.find(p => p?.ParameterInfo?.Name === 'BaseTex')
        const objectPath = base?.ParameterValue?.ObjectPath
        const texMatch = objectPath?.match(/NRC\/(Content\/.+?)\.\d+$/)
        if (texMatch) {
          const rel = texMatch[1].replace(/\//g, '\\') + '.png'
          result[m[1]] = rel

          const materialName = Array.isArray(data) ? data[0]?.Name : data?.Name
          const nameId = materialName?.match(/_(\d{5,})$/)?.[1]
          if (nameId) result[nameId] = rel
        }
      } catch {
        // 部分导出文件使用精简 schema 或文件缺失，跳过即可
      }
    }
  } catch {}
  return result
}

// UEViewer：从 props.txt 读材质贴图信息。
// TODO：确认 UEViewer 导出的 props.txt 实际格式后实现。
async function _baseTexturesFromUEViewerProps(_dirPath, _re) {
  return {}
}

async function _baseTexturesFromDir(dirPath, re) {
  return config.modelExporter === 'ueviewer'
    ? _baseTexturesFromUEViewerProps(dirPath, re)
    : _baseTexturesFromFModelJson(dirPath, re)
}
