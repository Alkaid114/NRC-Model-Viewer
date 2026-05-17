import { platform } from '../platform/index.js'
import { config } from '../store/config.js'

export function assetsRoot() {
  return config.paths.uiAssets || config.paths.configFiles || null
}

export function resolveGameTextureUrl(rawRef) {
  if (!rawRef) return null
  const root = assetsRoot()
  if (!root) return null
  const m = rawRef.match(/Texture2D'\s*(\/Game\/.+?)\.\w+'\s*$/)
  const gamePath = m ? m[1] : rawRef
  const rel = gamePath.replace(/^\/?Game\//, 'Content/')
  return platform.fileUrl(platform.joinPath(root, rel) + '.png')
}

export function frameUrl(name) {
  const root = assetsRoot()
  if (!root) return null
  return platform.fileUrl(
    platform.joinPath(root, 'Content', 'NewRoco', 'Modules', 'System', 'Appearance', 'Raw', 'Frames', name + '.png')
  )
}

export function modelTextureUrl(item, texType, texId) {
  if (!item?.folderPath) return null
  return platform.fileUrl(
    platform.joinPath(item.folderPath, item.texDirName ?? 'Tex', `T_${item.gender}_${texType}_${texId}_D.png`)
  )
}

export function baseTextureUrl(item, matId) {
  const rel = item?.baseTextureByMatId?.[matId]
  if (!rel) return null
  return platform.fileUrl(platform.joinPath(config.paths.models, rel))
}

export function avatarRootPath() {
  return platform.joinPath(
    config.paths.models,
    'Content', 'ArtRes', 'AnimSequence', 'Human', 'PC'
  )
}

export function avatarRootTextureUrl(folder, fileName) {
  return platform.fileUrl(platform.joinPath(avatarRootPath(), folder, 'Tex', fileName))
}

export function skinTextureUrl(gender, skinMaterialId, skinTextureId) {
  return platform.fileUrl(
    platform.joinPath(
      config.paths.models,
      'Content', 'ArtRes', 'AnimSequence', 'Human', 'PC',
      gender, 'Avatar', 'By', skinMaterialId,
      'Tex', `T_${gender}_By_${skinTextureId}_D.png`
    )
  )
}

export function modelFileUrl(item, modelFile) {
  if (!item?.folderPath || !modelFile) return null
  return platform.fileUrl(platform.joinPath(item.folderPath, modelFile))
}
