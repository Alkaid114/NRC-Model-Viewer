<script setup>
import { ref, reactive, watch, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MATERIAL_FOLDERS } from '../assets/costumeRules.js'

const props = defineProps({
  modelUrls: { type: Array, default: () => [] },
})

const canvasEl  = ref(null)
const isLoading = ref(false)
const hasModels = ref(false)
const _resolvedMaterials = reactive({})

let renderer, scene, camera, controls, animId
const loader     = new GLTFLoader()
const texLoader  = new THREE.TextureLoader()
// key (slot ID or URL fallback) → { model: Object3D, url: string }
const slotMap = new Map()
const HEAD_BONE_NAME = 'Bip001-Head'

function _entryUrl(entry) {
  return typeof entry === 'string' ? entry : entry?.url
}

function _entryTextureSignature(entry) {
  if (typeof entry === 'string') return ''
  return JSON.stringify({
    texDirName: entry?.texDirName ?? null,
    textureByMaterialName: entry?.textureByMaterialName ?? null,
    attachToBone: entry?.attachToBone ?? null,
  })
}

// Derive the D-texture URL from the model URL by parsing the filename.
// SKM_PC2_Cup_20703901.glb → .../Tex/T_PC2_Cup_20703901_D.png
function _fallbackDTexUrl(modelUrl) {
  const slash    = modelUrl.lastIndexOf('/')
  const folder   = modelUrl.slice(0, slash)
  const filename = modelUrl.slice(slash + 1)
  const m = filename.match(/^SKM_(PC[123])_(.+)_(\d+)\./i)
  if (!m) return null
  return `${folder}/Tex/T_${m[1]}_${m[2]}_${m[3]}_D.png`
}

function _parseModelUrl(modelUrl) {
  const raw = modelUrl ?? ''
  const m = raw.match(/^(.*\/(PC[123])\/Avatar)\/([^/]+)\/([^/]+)\/[^/]+$/i)
  if (!m) return null
  return {
    avatarRootUrl: m[1],
    gender: m[2],
    type: m[3],
    id: m[4],
    folderUrl: `${m[1]}/${m[2]}/Avatar/${m[3]}/${m[4]}`,
  }
}

function _parseMaterialSlot(materialName) {
  const parts = (materialName || '').split('_').filter(Boolean)
  const idIndex = parts.findLastIndex(part => /^[0-9]{5,}$/.test(part))
  if (idIndex <= 0) return null

  const id = parts[idIndex]
  const gender = parts.find(part => /^PC[123]$/i.test(part))?.toUpperCase() ?? null
  let type = null
  for (let i = idIndex - 1; i >= 0; i--) {
    if (MATERIAL_FOLDERS.has(parts[i])) {
      type = parts[i]
      break
    }
  }
  return type ? { type, id, gender } : null
}

function _textureCandidatesForMaterial(mat, entry) {
  const byName = entry?.textureByMaterialName ?? {}
  const exact = byName[mat?.name]
  const fallback = byName.default ?? byName['*']

  const modelInfo = _parseModelUrl(_entryUrl(entry))
  const slot = _parseMaterialSlot(mat?.name)
  if (!modelInfo || !slot) return [exact, fallback].filter(Boolean)

  // By 材质槽（服装内露出的皮肤）：By/<服装ID>/ 目录不存在，候选 URL 生成无意义。
  // 若显式映射已命中（exact/fallback），走正常路径；否则直接用 byTexUrl 兜底。
  if (!exact && !fallback && slot.type === 'By' && entry?.byTexUrl) {
    return [entry.byTexUrl]
  }

  const textureGender = slot.gender ?? modelInfo.gender
  const modelLocalTex = slot.type === modelInfo.type
    ? `${modelInfo.folderUrl}/${entry?.texDirName ?? 'Tex'}/T_${textureGender}_${slot.type}_${slot.id}_D.png`
    : null
  const modelFolderTex = slot.type === modelInfo.type && slot.id !== modelInfo.id
    ? `${modelInfo.folderUrl}/${entry?.texDirName ?? 'Tex'}/T_${textureGender}_${slot.type}_${modelInfo.id}_D.png`
    : null
  const slotFolderTex = `${modelInfo.avatarRootUrl}/${slot.type}/${slot.id}/Tex/T_${textureGender}_${slot.type}_${slot.id}_D.png`

  return [...new Set([exact, fallback, modelLocalTex, modelFolderTex, slotFolderTex].filter(Boolean))]
}

function _normalizeTextureCandidate(candidate) {
  return typeof candidate === 'string' ? { url: candidate } : candidate
}

async function _loadTexture(url) {
  if (!url) return null
  return new Promise(resolve => {
    texLoader.load(url, tex => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.flipY = false
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      resolve(tex)
    }, undefined, () => resolve(null))
  })
}

async function _loadTextureCandidate(candidate, cache) {
  const options = _normalizeTextureCandidate(candidate)
  if (!options?.url) return null
  if (!cache.has(options.url)) cache.set(options.url, _loadTexture(options.url))
  const texture = await cache.get(options.url)
  if (!texture) return null

  const result = { texture, options: { ...options } }
  const overlay = _normalizeTextureCandidate(options.overlay)
  if (overlay?.url) {
    if (!cache.has(overlay.url)) cache.set(overlay.url, _loadTexture(overlay.url))
    result.options.overlayTexture = await cache.get(overlay.url)
  }
  return result
}

async function _loadFirstTexture(candidates, cache) {
  let fallbackColor = null
  for (const candidate of candidates) {
    const options = _normalizeTextureCandidate(candidate)
    fallbackColor ??= options?.fallbackColor ?? null
    const tex = await _loadTextureCandidate(candidate, cache)
    if (tex) return tex
  }
  return fallbackColor ? { color: fallbackColor } : null
}

function _applyPhysicsDefaults(mat) {
  mat.metalness = 0; mat.metalnessMap = null
  mat.roughness = 1; mat.roughnessMap = null
}

// Fix embedded-material issues: FModel bakes baseColorFactor=black and sets metalness
// on exported GLBs. Without scene.environment, metalness > 0 → pitch-black specular.
function _normalizeMat(mat) {
  if (!mat) return
  let dirty = false
  if (mat.map && mat.map.colorSpace !== THREE.SRGBColorSpace) {
    mat.map.colorSpace = THREE.SRGBColorSpace
    mat.map.needsUpdate = true
    dirty = true
  }
  if (mat.color && (mat.color.r !== 1 || mat.color.g !== 1 || mat.color.b !== 1)) {
    mat.color.set(1, 1, 1)
    dirty = true
  }
  const hadPhysics = mat.metalness !== 0 || mat.metalnessMap || mat.roughness !== 1 || mat.roughnessMap
  _applyPhysicsDefaults(mat)
  if (hadPhysics) dirty = true
  if (dirty) mat.needsUpdate = true
}

function _addShaderPatch(material, key, patch) {
  const previous = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey
  material.onBeforeCompile = shader => {
    previous?.(shader)
    patch(shader)
  }
  material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ''}|${key}`
}

function _patchUvRepeatShader(material, uvRepeat) {
  if (!uvRepeat) return
  const [u, v] = uvRepeat
  _addShaderPatch(material, `nrc-uv-repeat-${u}-${v}`, shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec2 nrcRepeatedMapUv = fract(vMapUv * vec2(${u.toFixed(6)}, ${v.toFixed(6)}));
        vec4 sampledDiffuseColor = texture2D(map, nrcRepeatedMapUv);
        #ifdef DECODE_VIDEO_TEXTURE
          sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
        #endif
        diffuseColor *= vec4(sampledDiffuseColor.rgb, 1.0);
      #endif`
    )
  })
}

function _patchOverlayTextureShader(material, overlayTexture) {
  if (!overlayTexture) return
  _addShaderPatch(material, 'nrc-overlay-texture', shader => {
    shader.uniforms.nrcOverlayMap = { value: overlayTexture }
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `uniform sampler2D nrcOverlayMap;

      void main() {`
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      vec4 nrcOverlayColor = texture2D(nrcOverlayMap, vMapUv);
      diffuseColor.rgb = mix(diffuseColor.rgb, nrcOverlayColor.rgb, nrcOverlayColor.a);`
    )
  })
}

function _patchMat(mat, textureInfo) {
  if (!mat) return mat
  if (!textureInfo?.texture && !textureInfo?.color) {
    _normalizeMat(mat)
    return mat
  }
  const next = mat.clone()
  next.map          = textureInfo.texture ?? null
  next.color?.set(textureInfo.texture ? 0xffffff : textureInfo.color)
  next.vertexColors = false
  next.transparent  = false
  next.opacity      = 1
  next.alphaMap     = null
  next.alphaTest    = 0
  next.depthWrite   = true
  _applyPhysicsDefaults(next)
  _patchUvRepeatShader(next, textureInfo.options?.uvRepeat)
  _patchOverlayTextureShader(next, textureInfo.options?.overlayTexture)
  next.needsUpdate  = true
  return next
}

async function _applyTextures(model, entry) {
  const textureCache = new Map()
  const materialToTexture = new Map()
  const materials = new Set()
  const resolution = {}

  model.traverse(node => {
    if (!node.isMesh && !node.isSkinnedMesh) return
    const mats = Array.isArray(node.material) ? node.material : [node.material]
    mats.filter(Boolean).forEach(mat => materials.add(mat))
  })

  await Promise.all([...materials].map(async mat => {
    let urls = _textureCandidatesForMaterial(mat, entry)
    if (!urls.length && typeof entry === 'string') urls = [_fallbackDTexUrl(entry)].filter(Boolean)
    const textureInfo = await _loadFirstTexture(urls, textureCache)
    if (textureInfo) {
      materialToTexture.set(mat, textureInfo)
      if (textureInfo.texture) {
        const rec = { url: textureInfo.options?.url ?? null }
        const overlayUrl = _normalizeTextureCandidate(textureInfo.options?.overlay)?.url ?? null
        if (overlayUrl) rec.overlayUrl = overlayUrl
        resolution[mat.name] = rec
      } else if (textureInfo.color) {
        resolution[mat.name] = { fallbackColor: textureInfo.color }
      }
    } else if (urls.length) {
      console.warn('[ModelViewer] texture not found:', mat?.name, urls)
      resolution[mat.name] = null
    }
  }))

  model.traverse(node => {
    if (!node.isMesh && !node.isSkinnedMesh) return
    const patch = mat => {
      const textureInfo = materialToTexture.get(mat) ?? null
      return _patchMat(mat, textureInfo)
    }
    node.material = Array.isArray(node.material)
      ? node.material.map(patch)
      : patch(node.material)
  })

  return resolution
}

function initThree() {
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl.value, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x18191e)

  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50000)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  scene.add(new THREE.AmbientLight(0xffffff, 1.2))
  const key = new THREE.DirectionalLight(0xfff4e0, 2.0)
  key.position.set(2, 5, 3)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xaabbff, 0.5)
  fill.position.set(-3, 2, -2)
  scene.add(fill)

  animate()
}

function animate() {
  animId = requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}

function onResize() {
  if (!renderer || !canvasEl.value) return
  const { clientWidth: w, clientHeight: h } = canvasEl.value
  if (w === 0 || h === 0) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function disposeObject(obj) {
  obj.traverse(node => {
    node.geometry?.dispose()
    const mats = node.material
      ? (Array.isArray(node.material) ? node.material : [node.material])
      : []
    for (const m of mats) {
      for (const v of Object.values(m)) {
        if (v?.isTexture) v.dispose()
      }
      m.dispose()
    }
  })
}

function _detachModel(model) {
  model?.parent?.remove(model)
}

function _findBoneByName(root, boneName) {
  let found = null
  root.traverse(node => {
    if (!found && node.isBone && node.name === boneName) found = node
  })
  return found
}

function _findAttachBone(boneName) {
  for (const { model, attachToBone } of slotMap.values()) {
    if (attachToBone === boneName) continue  // skip models that themselves need attaching
    const bone = _findBoneByName(model, boneName)
    if (bone) return bone
  }
  return null  // no full-skeleton model loaded yet; caller falls back to scene root
}

function _mountAttachedModels() {
  const headBone = _findAttachBone(HEAD_BONE_NAME)
  for (const { model, attachToBone } of slotMap.values()) {
    if (attachToBone !== HEAD_BONE_NAME) continue
    if (headBone) {
      if (model.parent !== headBone) headBone.add(model)
    } else if (model.parent !== scene) {
      scene.add(model)
    }
  }
}

function _syncResolvedMaterials() {
  for (const key of Object.keys(_resolvedMaterials)) delete _resolvedMaterials[key]
  for (const [key, { materials }] of slotMap) {
    if (materials) _resolvedMaterials[key] = materials
  }
  hasModels.value = slotMap.size > 0
}

function clearModels() {
  for (const { model } of slotMap.values()) { _detachModel(model); disposeObject(model) }
  slotMap.clear()
  for (const key of Object.keys(_resolvedMaterials)) delete _resolvedMaterials[key]
  hasModels.value = false
}

function _boundingInfo() {
  const box = new THREE.Box3()
  for (const { model } of slotMap.values()) box.expandByObject(model)
  if (box.isEmpty()) return null
  const center = box.getCenter(new THREE.Vector3())
  const size   = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const dist   = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.5
  return { center, size, dist }
}

// Initial fit: slight 3/4 angle so the character looks natural on first load.
function fitCamera() {
  if (slotMap.size === 0) return
  const info = _boundingInfo()
  if (!info) return
  const { center, size, dist } = info
  camera.position.set(center.x + dist * 0.3, center.y + size.y * 0.05, center.z + dist)
  controls.target.copy(center)
  controls.update()
}

// Reset button: pure front view, camera directly in front of the model.
function resetView() {
  if (slotMap.size === 0) return
  const info = _boundingInfo()
  if (!info) return
  const { center, dist } = info
  camera.position.set(center.x, center.y, center.z + dist)
  controls.target.copy(center)
  controls.update()
}

async function _loadOne(entry) {
  const url = _entryUrl(entry)
  if (!url) throw new Error('Missing model URL')
  const model = await new Promise((resolve, reject) =>
    loader.load(url, gltf => resolve(gltf.scene), undefined, reject)
  )
  const materials = await _applyTextures(model, entry)
  return { model, materials }
}

async function updateModels(entries) {
  if (!entries?.length) { clearModels(); return }

  const wasEmpty = slotMap.size === 0
  const entryByKey = new Map(entries.map(e => [e.key ?? _entryUrl(e), e]))

  // Remove slots that disappeared or whose URL changed.
  for (const [key, { model, url, textureSig }] of slotMap) {
    const next = entryByKey.get(key)
    if (!next || _entryUrl(next) !== url || _entryTextureSignature(next) !== textureSig) {
      _detachModel(model)
      disposeObject(model)
      slotMap.delete(key)
    }
  }

  const toLoad = entries.filter(e => !slotMap.has(e.key ?? _entryUrl(e)))
  if (!toLoad.length) {
    _mountAttachedModels()
    _syncResolvedMaterials()
    return
  }

  isLoading.value = wasEmpty
  try {
    const results = await Promise.allSettled(
      toLoad.map(async e => {
        const { model, materials } = await _loadOne(e)
        return {
          key: e.key ?? _entryUrl(e),
          url: _entryUrl(e),
          textureSig: _entryTextureSignature(e),
          attachToBone: e.attachToBone ?? null,
          model,
          materials,
        }
      })
    )
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { key, url, textureSig, attachToBone, model, materials } = r.value
        scene.add(model)
        slotMap.set(key, { model, url, textureSig, attachToBone, materials })
      } else {
        console.warn('[ModelViewer] load failed:', r.reason)
      }
    }
    _mountAttachedModels()
    _syncResolvedMaterials()
    if (wasEmpty) fitCamera()
  } finally {
    if (wasEmpty) isLoading.value = false
  }
}

watch(() => props.modelUrls, updateModels, { deep: true })

let ro
onMounted(() => {
  initThree()
  onResize()
  ro = new ResizeObserver(onResize)
  ro.observe(canvasEl.value.parentElement)
  if (props.modelUrls.length) updateModels(props.modelUrls)
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
  ro?.disconnect()
  clearModels()
  controls?.dispose()
  renderer?.dispose()
})

defineExpose({ resolvedMaterials: _resolvedMaterials })
</script>

<template>
  <div class="model-viewer">
    <canvas ref="canvasEl" class="model-canvas" />
    <div v-if="isLoading" class="model-overlay">
      <span class="model-loading-text">加载中…</span>
    </div>
    <div v-else-if="!modelUrls.length" class="model-overlay view-empty">
      <p class="view-empty__title">暂无模型</p>
      <p class="view-empty__desc">从选择区选择服装以预览</p>
    </div>
    <button v-if="hasModels && !isLoading" class="viewer-btn viewer-btn--reset" title="还原视角" @click="resetView">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.model-viewer {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.model-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.model-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: var(--text-secondary);
}
.model-loading-text { font-size: 0.875rem; }

.viewer-btn {
  position: absolute;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-sm);
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  backdrop-filter: blur(6px);
}
.viewer-btn:hover {
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
}
.viewer-btn svg { width: 16px; height: 16px; }

.viewer-btn--reset { bottom: 12px; right: 12px; }
</style>
