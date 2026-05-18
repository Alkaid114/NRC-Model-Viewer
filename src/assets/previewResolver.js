import {
  DEFAULT_MODEL_BASES,
} from './costumeRules.js'
import {
  avatarRootPath,
  avatarRootTextureUrl,
  baseTextureUrl,
  modelFileUrl,
  modelTextureUrl,
  skinTextureUrl,
} from './assetPaths.js'
import { platform } from '../platform/index.js'

function _genderPrefix(gender) { return gender === 'PC1' ? '1' : '2' }

const DEFAULT_BROW_COLOR = '4F2317FF'
const BROW_COLOR_TEXTURE_ID = {
  '563027FF': '4F2317FF',
  '3E3F40FF': '261A1EFF',
  '93A6ABFF': '9F91A1FF',
  '9D7447FF': 'AC6931FF',
  '671D2AFF': '8F291AFF',
}
const SKIN_ET_TEXTURE_ID = {
  PC1: { '30000001': '10400001', '30000002': '10400002', '30000003': '10400003', '30000007': '10400007' },
  PC2: { '30000001': '20400001', '30000002': '20400002', '30000003': '20400003', '30000007': '20400007' },
}

export function textureIdFor(item, activeVariant) {
  const variant = activeVariant(item)
  if (variant?.textureId != null && item.assetId) {
    const suffix = String(variant.textureId).padStart(2, '0')
    return item.assetId.slice(0, -suffix.length) + suffix
  }
  return variant?.id ?? item.id
}

export function defaultItemFor(slotId, gender, items) {
  const baseName = DEFAULT_MODEL_BASES[gender]?.[slotId]
  if (!baseName) return null
  if (slotId === 'sk') {
    return items.find(i => i.type === 'Sk' && i.id === baseName) ?? null
  }
  if (slotId === 'pu') {
    return items.find(i => i.type === 'Pu' && i.id === baseName) ?? null
  }
  return items.find(i => i.modelBaseName === baseName) ?? null
}

export function previewEntryFor(item, context) {
  const {
    activeVariant,
    gender,
    outfit,
    items,
  } = context

  const modelId = _modelId(item, outfit)
  const texId = textureIdFor(item, activeVariant)
  const textureByMaterialName = {}

  const mainTex = baseTextureUrl(item, texId) ?? modelTextureUrl(item, item.type, texId)
  if (mainTex) textureByMaterialName[`MI_${item.gender}_${item.type}_${modelId}`] = mainTex
  for (const matId of Object.keys(item.baseTextureByMatId ?? {})) {
    const matTex = baseTextureUrl(item, matId)
    const matName = `MI_${item.gender}_${item.type}_${matId}`
    if (matTex && !textureByMaterialName[matName]) textureByMaterialName[matName] = matTex
  }

  const skinTex = _usesBodySkinMaterial(item) ? _skinTextureUrl(gender, outfit.sk) : null
  if (skinTex) textureByMaterialName[`MI_${item.gender}_By_${_skinMaterialId(gender)}`] = skinTex

  if (item.type === 'Br') {
    const browTex = _browTextureUrl(outfit, activeVariant)
    textureByMaterialName.MI_PC_Br = browTex
    textureByMaterialName[`MI_${item.gender}_Br`] = browTex
  }

  if (item.type === 'Es') {
    const pupilTex = _pupilTextureUrl(gender, outfit)
    const esEntry = { url: pupilTex, uvRepeat: [2, 1] }
    textureByMaterialName.MI_PC_Es_A_LR = esEntry
    textureByMaterialName[`MI_${item.gender}_Es_A_LR`] = esEntry
  }

  if (item.type === 'Cup' && item.isSuit) {
    // 连体服的 Cup 和 Ps 材质共用同一套变体 ID，直接复用 Cup 的 texId 查 Ps 贴图路径。
    const psTex = modelTextureUrl(item, 'Ps', texId)
    if (psTex) textureByMaterialName[`MI_${item.gender}_Ps_${modelId}`] = psTex
  }

  if (item.type === 'Et') {
    const etItem = outfit.et ?? defaultItemFor('et', gender, items)
    const etTex = etItem
      ? (baseTextureUrl(etItem, textureIdFor(etItem, activeVariant)) ?? _skinEtTextureUrl(gender, outfit.sk, items))
      : null
    const decalTex = _faceDecalTextureUrl(gender, outfit)
    if (etItem && etTex) {
      const etMat = `MI_${item.gender}_Et_${_modelId(etItem, outfit)}`
      textureByMaterialName[etMat] = decalTex
        ? { url: etTex, overlay: { url: decalTex } }
        : etTex
    }
  }

  if (item.type === 'Fe') {
    const etTex = _skinEtTextureUrl(gender, outfit.sk, items)
    const decalTex = _faceDecalTextureUrl(gender, outfit)
    if (etTex) {
      textureByMaterialName[`MI_${item.gender}_Et_${_defaultEtMaterialId(gender)}`] = decalTex
        ? { url: etTex, overlay: { url: decalTex } }
        : etTex
    }
  }

  return {
    url: modelFileUrl(item, _previewModel(item, outfit).file),
    texDirName: item.texDirName ?? 'Tex',
    textureByMaterialName,
    attachToBone: _attachToBoneFor(item),
    byTexUrl: skinTex,
  }
}

function _previewModel(item, outfit) {
  const useHat = item.type === 'Hr' && outfit.ht
  return {
    file:     useHat && item.hatModelFile     ? item.hatModelFile     : item.modelFile,
    baseName: useHat && item.hatModelBaseName ? item.hatModelBaseName : item.modelBaseName,
  }
}

function _modelId(item, outfit) {
  const { baseName } = _previewModel(item, outfit)
  const fromFile = baseName?.match(/_(\d{5,})$/)?.[1]
  return fromFile ?? item.assetId ?? item.id
}

function _skinTextureId(gender, skinItem) {
  const skinId = String(skinItem?.id ?? DEFAULT_MODEL_BASES[gender]?.sk ?? '30000001')
  return _genderPrefix(gender) + skinId.slice(1)
}

function _skinEtTextureId(gender, skinItem) {
  const skinId = String(skinItem?.id ?? DEFAULT_MODEL_BASES[gender]?.sk ?? '30000001')
  return SKIN_ET_TEXTURE_ID[gender]?.[skinId] ?? _defaultEtMaterialId(gender)
}

function _defaultEtMaterialId(gender) {
  return DEFAULT_MODEL_BASES[gender]?.et?.match(/_(\d+)$/)?.[1]
}

function _skinEtTextureUrl(gender, skinItem, items) {
  const baseEtItem = defaultItemFor('et', gender, items)
  const texId = _skinEtTextureId(gender, skinItem)
  if (!baseEtItem || !texId) return null
  return modelTextureUrl(baseEtItem, 'Et', texId)
}

function _skinMaterialId(gender) {
  return `${_genderPrefix(gender)}0000001`
}

function _skinTextureUrl(gender, skinItem) {
  return skinTextureUrl(gender, _skinMaterialId(gender), _skinTextureId(gender, skinItem))
}

function _normalizeBrowColor(color) {
  const raw = String(color || DEFAULT_BROW_COLOR).replace(/^#/, '').toUpperCase()
  return BROW_COLOR_TEXTURE_ID[raw] ?? raw
}

function _browTextureUrl(outfit, activeVariant) {
  const color = outfit.br ? activeVariant(outfit.br)?.colourIds?.[0] : null
  const colorId = _normalizeBrowColor(color)
  return {
    url: avatarRootTextureUrl('PC_Br', `T_PC1_Br_${colorId}_D.png`),
    fallbackColor: `#${String(color || colorId).replace(/^#/, '').slice(0, 6)}`,
  }
}

function _pupilTextureUrl(gender, outfit) {
  const pupilId = outfit.pu?.id ?? DEFAULT_MODEL_BASES[gender]?.pu ?? '34000001'
  return avatarRootTextureUrl('PC_Es', `T_PC_Es_${pupilId}.png`)
}

function _faceDecalTextureUrl(gender, outfit) {
  const decalId = outfit.dc?.id
  if (!decalId) return null
  const base = gender === 'PC1' ? 15000000 : 25000000
  const suffixNumber = Number(decalId) - base
  if (!Number.isFinite(suffixNumber) || suffixNumber <= 0) return null
  const suffix = String(suffixNumber).padStart(2, '0')
  return platform.fileUrl(
    platform.joinPath(avatarRootPath(), gender, 'Avatar', 'Mp', `T_${gender}_Mp_${suffix}.png`)
  )
}

function _usesBodySkinMaterial(item) {
  return ['Cup', 'Ps', 'So', 'Se', 'Ge', 'Er', 'Hi', 'Ht', 'Fi', 'Bg', 'Bi'].includes(item?.type)
}

function _attachToBoneFor(item) {
  return ['Fi', 'Hi'].includes(item?.type) ? 'Bip001-Head' : null
}
