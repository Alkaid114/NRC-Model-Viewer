<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { config, hiddenConfig } from '../store/config.js'
import { petStore, rescanPets } from '../store/petStore.js'
import { platform } from '../platform/index.js'
import { resolveGameTextureUrl } from '../assets/assetPaths.js'
import ModelViewer from '../components/ModelViewer.vue'

// ── Layout constants ──────────────────────────────────────────────────────────

const PANE_MIN          = 280
const DIVIDER_SIZE      = 4
const CARD_MIN_MIN      = 80
const CARD_MIN_MAX      = 160
const CARD_MIN_COLUMNS  = 2
const CARD_GRID_GAP     = 7
const CARD_FOOTER_HEIGHT = 44

function clampCardMin(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(CARD_MIN_MIN, Math.min(CARD_MIN_MAX, n)) : 120
}

function readPx(v) { const n = parseFloat(v); return isFinite(n) ? n : 0 }

// ── Persistent layout init ────────────────────────────────────────────────────

const _initLayout = { leftWidth: 320, cardMin: 120, ...(config.ui.layout?.sprite ?? {}) }

const layoutRoot = ref(null)
const itemGrid   = ref(null)
const layoutWidth          = ref(0)
const itemGridContentWidth = ref(0)
const leftWidth = ref(Math.max(PANE_MIN, _initLayout.leftWidth))
const cardMin   = ref(clampCardMin(_initLayout.cardMin))

let layoutRO = null
let gridRO   = null

function persistLayout() {
  if (!config.ui.layout) config.ui.layout = {}
  config.ui.layout.sprite = { leftWidth: leftWidth.value, cardMin: cardMin.value }
}

function setCardMin(v) { cardMin.value = clampCardMin(v); persistLayout() }

// ── Computed sizes ────────────────────────────────────────────────────────────

const maxLeftWidth = computed(() => {
  if (layoutWidth.value <= 0) return leftWidth.value
  return Math.max(PANE_MIN, layoutWidth.value - DIVIDER_SIZE - PANE_MIN)
})

const effectiveLeftWidth = computed(() =>
  Math.max(PANE_MIN, Math.min(leftWidth.value, maxLeftWidth.value))
)

const cardMinMax = computed(() => {
  const available = Math.floor(itemGridContentWidth.value)
  if (available <= 0) return CARD_MIN_MAX
  const twoColMax = Math.floor(
    (available - CARD_GRID_GAP * (CARD_MIN_COLUMNS - 1)) / CARD_MIN_COLUMNS
  )
  return Math.max(CARD_MIN_MIN, Math.min(CARD_MIN_MAX, twoColMax))
})

const effectiveCardMin = computed(() => Math.min(cardMin.value, cardMinMax.value))

const actualCardWidth = computed(() => {
  const w = itemGridContentWidth.value
  if (w <= 0) return effectiveCardMin.value
  const cols = Math.max(1, Math.floor((w + CARD_GRID_GAP) / (effectiveCardMin.value + CARD_GRID_GAP)))
  return (w - CARD_GRID_GAP * (cols - 1)) / cols
})

const cardMinRangeStyle = computed(() => {
  const span = Math.max(1, cardMinMax.value - CARD_MIN_MIN)
  const pct  = ((effectiveCardMin.value - CARD_MIN_MIN) / span) * 100
  return { backgroundSize: `${pct}% 100%` }
})

// ── Lifecycle / observers ─────────────────────────────────────────────────────

onMounted(() => {
  if (layoutRoot.value) {
    layoutWidth.value = layoutRoot.value.clientWidth
    layoutRO = new ResizeObserver(([e]) => { layoutWidth.value = e.contentRect.width })
    layoutRO.observe(layoutRoot.value)
  }
})

onUnmounted(() => { layoutRO?.disconnect(); gridRO?.disconnect(); detach() })

// itemGrid renders only after scanned; watch the ref directly.
watch(itemGrid, el => {
  gridRO?.disconnect(); gridRO = null
  if (!el) { itemGridContentWidth.value = 0; return }
  const s = window.getComputedStyle(el)
  itemGridContentWidth.value = el.clientWidth - readPx(s.paddingLeft) - readPx(s.paddingRight)
  gridRO = new ResizeObserver(([e]) => { itemGridContentWidth.value = e.contentRect.width })
  gridRO.observe(el)
})

// Apply layout when changed externally (e.g. settings panel).
watch(() => config.ui.layout?.sprite, layout => {
  if (!layout) return
  leftWidth.value = Math.max(PANE_MIN, layout.leftWidth ?? leftWidth.value)
  cardMin.value   = clampCardMin(layout.cardMin ?? cardMin.value)
}, { deep: true })

// ── Drag ──────────────────────────────────────────────────────────────────────

const dragging = ref(false)
let drag = null

function startDrag(e) {
  e.preventDefault()
  dragging.value = true
  drag = { startX: e.clientX, startW: effectiveLeftWidth.value }
  attach()
}

function onMove(e) {
  if (!drag) return
  leftWidth.value = Math.max(PANE_MIN, Math.min(maxLeftWidth.value, drag.startW + e.clientX - drag.startX))
}

function onUp() { dragging.value = false; drag = null; detach(); persistLayout() }
function attach() { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp) }
function detach() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }

// ── Type filter ───────────────────────────────────────────────────────────────

const activeTypes = ref(new Set())

function toggleType(unitType) {
  const next = new Set(activeTypes.value)
  next.has(unitType) ? next.delete(unitType) : next.add(unitType)
  activeTypes.value = next
}

function clearTypes() { activeTypes.value = new Set() }

// Only expose types that appear in scanned items (hides unused types).
const availableTypes = computed(() => {
  if (!petStore.scanned || petStore.types.length === 0) return []
  const present = new Set(petStore.items.flatMap(i => i.unitTypes))
  return petStore.types.filter(t => present.has(t.unitType))
})

// unitType → type config
const typeMap = computed(() => {
  const m = new Map()
  for (const t of petStore.types) m.set(t.unitType, t)
  return m
})

function itemTypeInfos(item) {
  return item.unitTypes.map(ut => typeMap.value.get(ut)).filter(Boolean)
}

function primaryTypeColor(item) {
  return itemTypeInfos(item)[0]?.color ?? null
}

// ── Items & selection ─────────────────────────────────────────────────────────

const searchText   = ref('')
const selectedItem = ref(null)

const displayedItems = computed(() => {
  if (!petStore.scanned) return []
  let items = petStore.items

  if (!hiddenConfig.spriteShowNonHandbook) {
    items = items.filter(i => i.isInHandbook !== false)
  }

  if (activeTypes.value.size > 0) {
    items = items.filter(i => i.unitTypes.some(t => activeTypes.value.has(t)))
  }

  const q = searchText.value.trim().toLowerCase()
  if (q) {
    items = items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.folderName.toLowerCase().includes(q) ||
      (i.petId !== null && String(i.petId).includes(q))
    )
  }

  return items
})

const scanProgressPct = computed(() => {
  const { done, total } = petStore.progress
  return total > 0 ? Math.round(done / total * 100) : 0
})

const yiseMode = ref(new Set())

function toggleYise(item) {
  const next = new Set(yiseMode.value)
  next.has(item.folderPath) ? next.delete(item.folderPath) : next.add(item.folderPath)
  yiseMode.value = next
}

function selectItem(item) {
  if (!item.assets.model && !item.yise?.assets?.model) return
  selectedItem.value = selectedItem.value === item ? null : item
}

watch(() => petStore.items, () => { selectedItem.value = null; yiseMode.value = new Set() })

// ── Asset dir opener ──────────────────────────────────────────────────────────

function openAssetDir(item, tag) {
  const subdir = tag === 'tex' ? (item.texDirName ?? 'Tex')
               : tag === 'mat' ? 'Mat'
               : null
  platform.openPath(subdir ? platform.joinPath(item.folderPath, subdir) : item.folderPath)
}

// ── Model preview ─────────────────────────────────────────────────────────────

const previewModelUrls = computed(() => {
  const item = selectedItem.value
  if (!item) return []
  const isYiseActive = yiseMode.value.has(item.folderPath) && !!item.yise
  const useYiseModel = isYiseActive && item.yise.assets?.model
  const folder = useYiseModel ? item.yise.folderPath : item.folderPath
  const file   = useYiseModel ? item.yise.modelFile   : item.modelFile
  if (!folder || !file) return []
  // Texture folder: prefer yise Tex when yise is active and yise has its own Tex dir
  const useYiseTex = isYiseActive && item.yise.assets?.tex
  const texFolder  = useYiseTex ? item.yise.folderPath : item.folderPath
  const texDir     = useYiseTex ? (item.yise.texDirName ?? 'Tex') : (item.texDirName ?? 'Tex')
  const hasTex     = useYiseTex ? item.yise.assets.tex : item.assets.tex
  // baseTexFolderUrl always points to the base pet Tex (Es/Mh don't change in Yise)
  const baseTexFolderUrl = item.assets.tex
    ? platform.fileUrl(platform.joinPath(item.folderPath, item.texDirName ?? 'Tex'))
    : null
  // byTexUrl: explicit URL of the Yise By_D texture (filename may differ from base pet name)
  const byTexUrl = (useYiseTex && item.yise.byTexFile)
    ? platform.fileUrl(platform.joinPath(item.yise.folderPath, item.yise.texDirName ?? 'Tex', item.yise.byTexFile))
    : null
  return [{
    key: 'pet',
    url: platform.fileUrl(platform.joinPath(folder, file)),
    texFolderUrl: hasTex ? platform.fileUrl(platform.joinPath(texFolder, texDir)) : null,
    baseTexFolderUrl,
    byTexUrl,
  }]
})

// ── Card thumbnail ────────────────────────────────────────────────────────────

function cardThumbUrl(item) {
  return resolveGameTextureUrl(item.jlSmallRes) ?? resolveGameTextureUrl(item.icon)
}

const isConfigured = computed(() => Boolean(config.paths.models))

// ── Model viewer ref & export ─────────────────────────────────────────────────

const modelViewerRef = ref(null)

function _toWinPath(url) {
  if (!url) return null
  let p = url
  if (p.startsWith('nrcfile:///')) p = p.slice('nrcfile:///'.length)
  else if (p.startsWith('nrcfile://')) p = p.slice('nrcfile://'.length)
  return decodeURIComponent(p).replace(/\//g, '\\')
}

function _petRoot(winPath) {
  const m = winPath?.match(/^(.*\\Pets)\\/i)
  return m ? m[1] : null
}

function _rel(winPath, root) {
  if (!winPath || !root) return winPath
  const prefix = root.endsWith('\\') ? root : root + '\\'
  return winPath.startsWith(prefix) ? winPath.slice(prefix.length) : winPath
}

function _getExt(path) {
  if (!path) return ''
  const dot = path.lastIndexOf('.')
  const sep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return dot > sep ? path.slice(dot) : ''
}

function _stripExt(path) {
  if (!path) return path
  const dot = path.lastIndexOf('.')
  const sep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return dot > sep ? path.slice(0, dot) : path
}

// Derive mat path from texture path: FolderName\[Yise\]Tex\... → FolderName\Mat\matName.ext
function _petMatPath(texRelPath, matName, matExt) {
  const m = texRelPath?.match(/^(.*?)\\(?:Yise\\)?Tex\\[^\\]+$/)
  return m ? `${m[1]}\\Mat\\${matName}${matExt}` : `Mat\\${matName}${matExt}`
}

const showExportDialog = ref(false)
const exportModelExt   = ref('')
const exportTexExt     = ref('')
const exportMatExt     = ref('')

const MODEL_EXT_OPTS = ['默认', '.gltf', '.glb', '.psk', '.uemodel']
const TEX_EXT_OPTS   = ['默认', '.png', '.tga']
const MAT_EXT_OPTS   = ['默认', '.json', '.props.txt']

function openExportDialog() { showExportDialog.value = true }

function doExport() {
  showExportDialog.value = false
  const item = selectedItem.value
  if (!item) return
  const isYise   = yiseMode.value.has(item.folderPath) && !!item.yise
  const resolved = modelViewerRef.value?.resolvedMaterials ?? {}
  const mats     = resolved['pet'] ?? {}
  const entry    = previewModelUrls.value[0]
  if (!entry) return
  const modelWin = _toWinPath(entry.url)
  const petsRoot = _petRoot(modelWin)

  // Derive effective extensions: user override → actual file ext → fallback
  const effectiveModelExt = exportModelExt.value || _getExt(modelWin) || '.glb'
  const firstTexWin = _toWinPath(Object.values(mats).find(m => m?.url)?.url)
  const effectiveTexExt = exportTexExt.value || _getExt(firstTexWin) || '.png'
  const effectiveMatExt = exportMatExt.value || '.json'

  const materials = {}
  for (const [matName, info] of Object.entries(mats)) {
    if (!info) {
      materials[matName] = { mat: `${item.folderName}\\Mat\\${matName}`, texture: null }
      continue
    }
    if (info.fallbackColor) {
      materials[matName] = { mat: `${item.folderName}\\Mat\\${matName}`, color: info.fallbackColor }
      continue
    }
    const texRelRaw = _rel(_toWinPath(info.url), petsRoot)
    materials[matName] = { mat: _petMatPath(texRelRaw, matName, ''), texture: _stripExt(texRelRaw) }
  }
  const data = {
    petsRoot:   petsRoot ?? '',
    folderName: item.folderName,
    yise:       isYise,
    modelExt:   effectiveModelExt,
    textureExt: effectiveTexExt,
    matExt:     effectiveMatExt,
    model:      _stripExt(_rel(modelWin, petsRoot)),
    materials,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = `nrc_pet_${item.folderName}_${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}
</script>

<template>
  <div class="view sprite-view" :class="{ 'no-select': dragging }">

    <!-- ── Unconfigured ───────────────────────────────────────────── -->
    <div v-if="!isConfigured" class="view-empty">
      <svg class="view-empty__icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.3H22l-6.2 4.5 2.4 7.3L12 17.1 5.8 21.1l2.4-7.3L2 9.3h7.6L12 2Z"/>
      </svg>
      <p class="view-empty__title">宠物模型预览</p>
      <p class="view-empty__desc">请先在设置中配置模型路径</p>
    </div>

    <!-- ── Main Layout ───────────────────────────────────────────── -->
    <div v-else ref="layoutRoot" class="sprite-layout">

      <!-- Left pane: list -->
      <div class="pane-left" :style="{ width: effectiveLeftWidth + 'px' }">

        <!-- Header -->
        <div class="panel-head">
          <span>精灵选择区</span>
          <span v-if="petStore.scanned" class="item-count">{{ displayedItems.length }} / {{ petStore.items.length }}</span>
        </div>

        <!-- Toolbar -->
        <div class="toolbar">
          <div class="search-wrap">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input class="search-input" type="text" placeholder="搜索…" v-model="searchText" />
          </div>

          <!-- Card size slider -->
          <div class="card-size-control" title="Card size">
            <svg class="card-size-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="4" y="4" width="6" height="6" rx="1"/>
              <rect x="14" y="4" width="6" height="6" rx="1"/>
              <rect x="4" y="14" width="6" height="6" rx="1"/>
              <rect x="14" y="14" width="6" height="6" rx="1"/>
            </svg>
            <input
              type="range"
              class="card-size-range"
              :min="CARD_MIN_MIN"
              :max="cardMinMax"
              :value="effectiveCardMin"
              :style="cardMinRangeStyle"
              @input="setCardMin($event.target.value)"
            />
          </div>

          <button
            class="head-action-btn scan-btn"
            :class="{ scanning: petStore.scanning }"
            :disabled="petStore.scanning"
            :title="petStore.scanning ? `扫描中 ${scanProgressPct}%` : '扫描宠物资产'"
            @click="rescanPets"
          >
            <span v-if="petStore.scanning">{{ scanProgressPct }}%</span>
            <span v-else>扫描</span>
          </button>
        </div>

        <!-- Type filter bar -->
        <div v-if="availableTypes.length > 0" class="type-filter">
          <button
            class="type-pill"
            :class="{ active: activeTypes.size === 0 }"
            @click="clearTypes"
          >全部</button>
          <button
            v-for="type in availableTypes"
            :key="type.unitType"
            class="type-pill"
            :class="{ active: activeTypes.has(type.unitType) }"
            :style="activeTypes.has(type.unitType)
            ? { borderColor: type.color, background: type.color + '26', color: type.color }
            : { borderColor: type.color + '66' }"
            @click="toggleType(type.unitType)"
          >
            <span
              v-if="resolveGameTextureUrl(type.icon)"
              class="type-pill-icon-wrap"
              :style="{ background: type.color }"
            >
              <img
                class="type-pill-icon"
                :src="resolveGameTextureUrl(type.icon)"
                @error="e => e.target.parentElement.style.display = 'none'"
              />
            </span>
            <span>{{ type.name }}</span>
          </button>
        </div>

        <!-- States -->
        <div v-if="!petStore.scanned && !petStore.scanning" class="scan-empty view-empty">
          <svg class="view-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
            <path d="M11 8v6M8 11h6"/>
          </svg>
          <p class="view-empty__title">尚未扫描</p>
          <p class="view-empty__desc">点击工具栏"扫描"按钮加载宠物资产</p>
        </div>

        <div v-else-if="petStore.scanning" class="scan-empty view-empty">
          <div class="scan-progress-ring"></div>
          <p class="view-empty__title">扫描中…</p>
          <p class="view-empty__desc">{{ petStore.progress.done }} / {{ petStore.progress.total }}</p>
        </div>

        <div v-else-if="petStore.error" class="scan-empty view-empty">
          <p class="view-empty__title">扫描失败</p>
          <p class="view-empty__desc">{{ petStore.error }}</p>
          <button class="head-action-btn" style="margin-top:10px" @click="rescanPets">重试</button>
        </div>

        <!-- Card grid -->
        <div
          v-else
          ref="itemGrid"
          class="item-grid scrollable"
          :style="{
            '--item-card-min':    effectiveCardMin + 'px',
            '--item-card-width':  actualCardWidth + 'px',
            '--item-card-footer': CARD_FOOTER_HEIGHT + 'px',
          }"
        >
          <div v-if="displayedItems.length === 0" class="grid-empty">暂无匹配资产</div>
          <div
            v-for="item in displayedItems"
            :key="item.folderPath"
            class="item-card"
            :class="{
              selected:     selectedItem === item,
              unselectable: !item.assets.model && !item.yise?.assets?.model,
            }"
            :style="primaryTypeColor(item) ? { '--card-type-color': primaryTypeColor(item) } : {}"
            @click="selectItem(item)"
          >
            <div class="card-thumb">
              <!-- Type color strip -->
              <div v-if="primaryTypeColor(item)" class="type-strip"></div>

              <img
                v-if="cardThumbUrl(item)"
                class="card-thumb-img"
                :src="cardThumbUrl(item)"
                @error="e => e.target.style.display = 'none'"
              />

              <!-- Asset tags -->
              <div v-if="hiddenConfig.spriteShowAssetTags" class="asset-tags">
                <template v-for="[tag, label] in [['model','Model'],['tex','Tex'],['mat','Mat']]" :key="tag">
                  <button
                    v-if="item.assets[tag] || !hiddenConfig.spriteHideMissingAssets"
                    class="asset-tag"
                    :class="{ 'asset-tag--missing': !item.assets[tag] }"
                    @click.stop="item.assets[tag] ? openAssetDir(item, tag) : null"
                  >{{ label }}</button>
                </template>
              </div>

              <!-- Type icon badges (bottom-left) -->
              <div v-if="itemTypeInfos(item).length > 0" class="type-badges">
                <div
                  v-for="t in itemTypeInfos(item)"
                  :key="t.unitType"
                  class="type-badge"
                  :style="{ background: t.color }"
                  :title="t.name"
                >
                  <img
                    v-if="resolveGameTextureUrl(t.icon)"
                    class="type-badge-img"
                    :src="resolveGameTextureUrl(t.icon)"
                    @error="e => e.target.style.display = 'none'"
                  />
                </div>
              </div>

              <!-- Yise toggle (bottom-right) -->
              <button
                v-if="item.yise"
                class="yise-toggle"
                :class="{ active: yiseMode.has(item.folderPath) }"
                :title="yiseMode.has(item.folderPath) ? '切换回普通色' : '切换为异色'"
                @click.stop="toggleYise(item)"
              >异</button>
            </div>
            <div class="card-footer">
              <p class="card-name" :title="item.folderName">{{ item.name }}</p>
              <p class="card-id">{{ item.modelBaseName ?? (item.petId !== null ? '#' + item.petId : item.folderName) }}</p>
            </div>
          </div>
        </div>

      </div>

      <!-- Vertical drag divider -->
      <div
        class="divider"
        :class="{ active: dragging }"
        @mousedown="startDrag"
      ></div>

      <!-- Right pane: 3D preview -->
      <div class="pane-right">
        <div class="panel-head">
          <span>模型预览区</span>
          <div class="head-end">
            <span v-if="selectedItem" class="item-count">{{ selectedItem.name }}</span>
            <button v-if="previewModelUrls.length" class="head-action-btn" @click="openExportDialog">导出配置</button>
          </div>
        </div>
        <ModelViewer ref="modelViewerRef" :model-urls="previewModelUrls" watermark="5huY1n6" />
      </div>

    </div>

    <!-- ── Export config dialog ──────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showExportDialog" class="export-backdrop" @click.self="showExportDialog = false">
        <div class="export-dialog">
          <h3 class="export-dialog-title">导出配置</h3>

          <div class="export-row">
            <span class="export-row-label">模型后缀</span>
            <div class="export-pills">
              <button
                v-for="opt in MODEL_EXT_OPTS" :key="opt"
                class="export-pill"
                :class="{ active: exportModelExt === (opt === '默认' ? '' : opt) }"
                @click="exportModelExt = opt === '默认' ? '' : opt"
              >{{ opt }}</button>
            </div>
          </div>

          <div class="export-row">
            <span class="export-row-label">贴图后缀</span>
            <div class="export-pills">
              <button
                v-for="opt in TEX_EXT_OPTS" :key="opt"
                class="export-pill"
                :class="{ active: exportTexExt === (opt === '默认' ? '' : opt) }"
                @click="exportTexExt = opt === '默认' ? '' : opt"
              >{{ opt }}</button>
            </div>
          </div>

          <div class="export-row">
            <span class="export-row-label">材质后缀</span>
            <div class="export-pills">
              <button
                v-for="opt in MAT_EXT_OPTS" :key="opt"
                class="export-pill"
                :class="{ active: exportMatExt === (opt === '默认' ? '' : opt) }"
                @click="exportMatExt = opt === '默认' ? '' : opt"
              >{{ opt }}</button>
            </div>
          </div>

          <div class="export-dialog-actions">
            <button class="export-cancel-btn" @click="showExportDialog = false">取消</button>
            <button class="export-confirm-btn" @click="doExport">导出</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sprite-view { background: var(--bg-base); }
.no-select { user-select: none; }
.no-select .divider { cursor: ew-resize; }

/* ── Layout ─────────────────────────────────────────────────── */
.sprite-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.pane-left {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.pane-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* ── Drag divider ───────────────────────────────────────────── */
.divider {
  width: 4px;
  flex-shrink: 0;
  background: var(--border-subtle);
  cursor: ew-resize;
  position: relative;
  z-index: 10;
  transition: background var(--t);
}
.divider::before {
  content: '';
  position: absolute;
  top: 0; bottom: 0; left: -5px; right: -5px;
}
.divider::after {
  content: '';
  position: absolute;
  top: 0; bottom: 0; left: 1px;
  width: 2px;
  background: var(--accent);
  opacity: 0;
  border-radius: 2px;
  transition: opacity var(--t);
}
.divider:hover::after,
.divider.active::after { opacity: 1; }

/* ── Panel header ───────────────────────────────────────────── */
.panel-head {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  gap: 8px;
}

.item-count {
  font-size: 10px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* ── Toolbar ────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  flex-shrink: 0;
}

.search-wrap {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 8px;
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding-left: 28px;
  font-size: 12px;
  height: 28px;
  background: var(--bg-active);
  border: 1px solid transparent;
}
.search-input:focus { border-color: var(--accent); box-shadow: none; }

/* ── Card size control ──────────────────────────────────────── */
.card-size-control {
  width: 108px;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
  padding: 0 8px;
  border-radius: var(--r-sm);
  background: var(--bg-active);
}

.card-size-icon {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.card-size-range { min-width: 0; }

/* ── Action button ──────────────────────────────────────────── */
.head-action-btn {
  font-size: 11px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: var(--r-sm);
  background: var(--bg-active);
  border: 1px solid var(--border-subtle);
  transition: all var(--t);
}
.head-action-btn:hover { background: var(--bg-hover); border-color: var(--border); color: var(--text-primary); }

.scan-btn {
  flex-shrink: 0;
  height: 28px;
  min-width: 52px;
  text-align: center;
}
.scan-btn.scanning { color: var(--accent-hover); }

/* ── Scan states ────────────────────────────────────────────── */
.scan-empty {
  flex: 1;
  margin: 8px;
  border-radius: var(--r-md);
  border: 1px dashed var(--border-subtle);
}

.scan-progress-ring {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid var(--border-subtle);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
  margin-bottom: 8px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Item Grid ──────────────────────────────────────────────── */
.item-grid {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--item-card-min, 120px)), 1fr));
  grid-auto-rows: calc(var(--item-card-width, 120px) + var(--item-card-footer, 44px));
  gap: 7px;
  align-content: start;
}

.grid-empty {
  grid-column: 1 / -1;
  padding: 32px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

/* ── Item Card ──────────────────────────────────────────────── */
.item-card {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, var(--item-card-width, 120px)) var(--item-card-footer, 44px);
  border-radius: var(--r-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  cursor: pointer;
  transition: transform var(--t), box-shadow var(--t), border-color var(--t);
}
.item-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  border-color: var(--border);
}
[data-theme="light"] .item-card:hover { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1); }

.item-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent) inset;
}
.item-card.selected:hover {
  border-color: var(--accent);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2), 0 0 0 2px var(--accent) inset;
}
[data-theme="light"] .item-card.selected:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1), 0 0 0 2px var(--accent) inset;
}

.item-card.unselectable {
  opacity: 0.45;
  cursor: not-allowed;
}
.item-card.unselectable:hover {
  transform: none;
  box-shadow: none;
  border-color: var(--border-subtle);
}

/* ── Card thumbnail ─────────────────────────────────────────── */
.card-thumb {
  width: 100%;
  height: 100%;
  position: relative;
  background: #1e2028;
  overflow: hidden;
}
[data-theme="light"] .card-thumb { background: #e8eaf0; }

.card-thumb-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

/* ── Asset tags ─────────────────────────────────────────────── */
.asset-tags {
  position: absolute;
  top: 5px;
  right: 5px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.asset-tag {
  font-size: 9px;
  font-family: var(--font-mono);
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1.6;
  backdrop-filter: blur(6px);
  background: rgba(0, 0, 0, 0.42);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
}
.asset-tag:hover { background: rgba(255, 255, 255, 0.22); }
.asset-tag--missing { text-decoration: line-through; opacity: 0.45; cursor: not-allowed; }
.asset-tag--missing:hover { background: rgba(0, 0, 0, 0.42); }

[data-theme="light"] .asset-tag {
  background: rgba(0, 0, 0, 0.25);
  color: rgba(0, 0, 0, 0.7);
}
[data-theme="light"] .asset-tag:hover { background: rgba(0, 0, 0, 0.45); color: #fff; }

/* ── Type filter bar ────────────────────────────────────────── */
.type-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  flex-shrink: 0;
}

.type-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 5px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-active);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  transition: background var(--t), border-color var(--t), color var(--t);
}
.type-pill:first-child { padding: 2px 10px; }
.type-pill:hover { background: var(--bg-hover); border-color: var(--border); color: var(--text-primary); }

.type-pill.active { font-weight: 600; }
.type-pill:first-child.active {
  background: var(--accent-muted);
  color: var(--accent-hover);
  border-color: var(--accent-border);
}

.type-pill-icon-wrap {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.type-pill-icon {
  width: 13px;
  height: 13px;
  object-fit: contain;
  flex-shrink: 0;
}

/* ── Type strip & badges on cards ───────────────────────────── */
.type-strip {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--card-type-color, transparent);
  z-index: 2;
}

.type-badges {
  position: absolute;
  bottom: 5px; left: 5px;
  display: flex;
  gap: 3px;
  z-index: 3;
}

.type-badge {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.25);
  overflow: hidden;
  flex-shrink: 0;
}

.type-badge-img {
  width: 14px;
  height: 14px;
  object-fit: contain;
}

/* ── Yise toggle ────────────────────────────────────────────────── */
.yise-toggle {
  position: absolute;
  bottom: 5px;
  right: 5px;
  font-size: 9px;
  font-weight: 600;
  font-family: var(--font-mono);
  padding: 1px 5px;
  border-radius: 3px;
  backdrop-filter: blur(6px);
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  z-index: 4;
  transition: background var(--t), border-color var(--t), color var(--t);
}
.yise-toggle:hover { background: rgba(255, 255, 255, 0.2); color: #fff; }
.yise-toggle.active {
  background: rgba(160, 90, 255, 0.3);
  border-color: rgba(180, 120, 255, 0.65);
  color: rgb(210, 170, 255);
}

/* ── Card footer ────────────────────────────────────────────── */
.card-footer {
  padding: 5px 8px 6px;
  border-top: 1px solid var(--border-subtle);
  overflow: hidden;
}

.card-name {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.card-id {
  display: block;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

/* ── Panel head end slot ────────────────────────────────────── */
.head-end {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

/* ── Export dialog ──────────────────────────────────────────── */
.export-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.export-dialog {
  width: 400px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 22px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.export-dialog-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.export-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.export-row-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  width: 56px;
  flex-shrink: 0;
}

.export-pills { display: flex; flex-wrap: wrap; gap: 5px; }

.export-pill {
  padding: 3px 9px;
  border-radius: 10px;
  font-size: 12px;
  font-family: var(--font-mono);
  background: var(--bg-active);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--t), color var(--t), border-color var(--t);
}
.export-pill:hover { background: var(--bg-hover); color: var(--text-primary); }
.export-pill.active {
  background: var(--accent-muted);
  border-color: var(--accent-border);
  color: var(--accent-hover);
}

.export-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 2px;
}

.export-cancel-btn {
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--r-sm);
  background: var(--bg-active);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}
.export-cancel-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.export-confirm-btn {
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--r-sm);
  background: var(--accent-muted);
  border: 1px solid var(--accent-border);
  color: var(--accent-hover);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}
.export-confirm-btn:hover { background: var(--accent); color: #fff; }
</style>
