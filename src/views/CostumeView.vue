<script setup>
import { computed, nextTick, reactive, ref, onMounted, onUnmounted, watch } from 'vue'
import { config, hiddenConfig } from '../store/config.js'
import { costumeStore, rescanCostumes } from '../store/costumeStore.js'
import { platform } from '../platform/index.js'
import ModelViewer from '../components/ModelViewer.vue'
import {
  DEFAULT_MODEL_BASES,
  L1_TAB_FILTERS as RULE_L1_TAB_FILTERS,
  REQUIRED_SLOTS,
  SUB_TAB_FILTERS as RULE_SUB_TAB_FILTERS,
  TYPE_COLORS as RULE_TYPE_COLORS,
  TYPE_TO_SLOT,
} from '../assets/costumeRules.js'
import {
  baseTextureUrl,
  frameUrl,
  modelTextureUrl,
  resolveGameTextureUrl,
} from '../assets/assetPaths.js'
import {
  defaultItemFor,
  previewEntryFor,
  textureIdFor,
} from '../assets/previewResolver.js'

// ── Layout Persistence ────────────────────────────────────────────────────────

const CARD_MIN_MIN = 80
const CARD_MIN_MAX = 160
const CARD_MIN_COLUMNS = 2
const CARD_GRID_GAP = 7
const CARD_FOOTER_HEIGHT = 44
const OUTFIT_SLOT_MIN = 120
const OUTFIT_SLOT_GAP = 5
const OUTFIT_SLOT_HEIGHT_RATIO = 0.37
const PANE_MIN = 320       // right pane min AND default left pane min
const SIDEBAR_W = 60       // .closet-sidebar width (border-right included via box-sizing)
const DIVIDER_SIZE = 4
const RIGHT_PANE_MIN_HEIGHT = 120
const RIGHT_SPLIT_FALLBACK_MIN = 15
const RIGHT_SPLIT_FALLBACK_MAX = 85
const DEFAULT = { leftWidth: 320, rightSplit: 42, cardMin: 120 }

function clampCardMin(value) {
  const next = Number(value)
  if (!Number.isFinite(next)) return DEFAULT.cardMin
  return Math.max(CARD_MIN_MIN, Math.min(CARD_MIN_MAX, next))
}

function clampRightSplit(value, totalHeight = 0) {
  const next = Number(value)
  const fallback = Number.isFinite(next) ? next : DEFAULT.rightSplit
  if (totalHeight > RIGHT_PANE_MIN_HEIGHT * 2 + DIVIDER_SIZE) {
    const min = (RIGHT_PANE_MIN_HEIGHT / totalHeight) * 100
    const max = ((totalHeight - DIVIDER_SIZE - RIGHT_PANE_MIN_HEIGHT) / totalHeight) * 100
    return Math.max(min, Math.min(max, fallback))
  }
  return Math.max(RIGHT_SPLIT_FALLBACK_MIN, Math.min(RIGHT_SPLIT_FALLBACK_MAX, fallback))
}

const _initLayout = { ...DEFAULT, ...(config.ui.layout?.costume ?? {}) }
const leftWidth  = ref(Math.max(PANE_MIN, _initLayout.leftWidth))
const rightSplit = ref(clampRightSplit(_initLayout.rightSplit))
const cardMin    = ref(clampCardMin(_initLayout.cardMin))
const layoutRoot = ref(null)
const itemGrid = ref(null)
const outfitSlots = ref(null)
const subTabBar = ref(null)          // measured for dynamic pane minimum
const subTabBarNaturalW = ref(0)     // natural (unconstrained) width of sub-tab bar
const layoutWidth = ref(0)
const itemGridContentWidth = ref(0)
const outfitSlotsContentWidth = ref(0)

let layoutResizeObserver = null
let gridResizeObserver = null
let outfitResizeObserver = null

// Dynamic left-pane minimum: natural sub-tab bar width + sidebar, or PANE_MIN when no sub-tabs.
const dynamicPaneMin = computed(() =>
  subTabBarNaturalW.value > 0
    ? Math.max(PANE_MIN, SIDEBAR_W + subTabBarNaturalW.value)
    : PANE_MIN
)

const maxLeftWidth = computed(() => {
  if (layoutWidth.value <= 0) return leftWidth.value
  return Math.max(dynamicPaneMin.value, layoutWidth.value - DIVIDER_SIZE - PANE_MIN)
})

const effectiveLeftWidth = computed(() => {
  return Math.max(dynamicPaneMin.value, Math.min(leftWidth.value, maxLeftWidth.value))
})

const cardMinMax = computed(() => {
  const available = Math.floor(itemGridContentWidth.value)
  if (available <= 0) return CARD_MIN_MAX
  const twoColumnMax = Math.floor(
    (available - CARD_GRID_GAP * (CARD_MIN_COLUMNS - 1)) / CARD_MIN_COLUMNS
  )
  return Math.max(CARD_MIN_MIN, Math.min(CARD_MIN_MAX, twoColumnMax))
})

const effectiveCardMin = computed(() => Math.min(cardMin.value, cardMinMax.value))

const actualCardWidth = computed(() => {
  const contentWidth = itemGridContentWidth.value
  if (contentWidth <= 0) return effectiveCardMin.value
  const columns = Math.max(1, Math.floor((contentWidth + CARD_GRID_GAP) / (effectiveCardMin.value + CARD_GRID_GAP)))
  return (contentWidth - CARD_GRID_GAP * (columns - 1)) / columns
})

const actualOutfitSlotWidth = computed(() => {
  const contentWidth = outfitSlotsContentWidth.value
  if (contentWidth <= 0) return OUTFIT_SLOT_MIN
  const columns = Math.max(1, Math.floor((contentWidth + OUTFIT_SLOT_GAP) / (OUTFIT_SLOT_MIN + OUTFIT_SLOT_GAP)))
  return (contentWidth - OUTFIT_SLOT_GAP * (columns - 1)) / columns
})

const actualOutfitSlotHeight = computed(() => {
  return Math.max(46, Math.round(actualOutfitSlotWidth.value * OUTFIT_SLOT_HEIGHT_RATIO))
})

const cardMinRangeStyle = computed(() => {
  const span = Math.max(1, cardMinMax.value - CARD_MIN_MIN)
  const percent = ((effectiveCardMin.value - CARD_MIN_MIN) / span) * 100
  return { backgroundSize: `${percent}% 100%` }
})

function persistLayout() {
  if (!config.ui.layout) config.ui.layout = {}
  config.ui.layout.costume = {
    leftWidth: leftWidth.value,
    rightSplit: rightSplit.value,
    cardMin: cardMin.value,
  }
}

function setCardMin(value) {
  cardMin.value = clampCardMin(value)
  persistLayout()
}

function applyLayout(layout) {
  const l = { ...DEFAULT, ...(layout ?? {}) }
  leftWidth.value  = Math.max(PANE_MIN, l.leftWidth)
  rightSplit.value = clampRightSplit(l.rightSplit)
  cardMin.value    = clampCardMin(l.cardMin)
}

function readPx(value) {
  const next = Number.parseFloat(value)
  return Number.isFinite(next) ? next : 0
}

function measureGridContentWidth() {
  if (!itemGrid.value) return 0
  const style = window.getComputedStyle(itemGrid.value)
  const paddingInline = readPx(style.paddingLeft) + readPx(style.paddingRight)
  return itemGrid.value.clientWidth - paddingInline
}

function measureOutfitSlotsContentWidth() {
  if (!outfitSlots.value) return 0
  const style = window.getComputedStyle(outfitSlots.value)
  const paddingInline = readPx(style.paddingLeft) + readPx(style.paddingRight)
  return outfitSlots.value.clientWidth - paddingInline
}

// Measure the sub-tab bar's natural (unconstrained) content width.
// Temporarily sets width to max-content for an accurate read, then restores.
// Called on mount and whenever the active L1 tab changes.
async function measureSubTabBar() {
  await nextTick()
  const bar = subTabBar.value
  if (!bar) { subTabBarNaturalW.value = 0; return }
  bar.style.width = 'max-content'
  const w = bar.offsetWidth   // forced reflow; equals natural content width
  bar.style.width = ''
  subTabBarNaturalW.value = w
}

onMounted(() => {
  if (layoutRoot.value) {
    layoutWidth.value = layoutRoot.value.clientWidth
    layoutResizeObserver = new ResizeObserver(([entry]) => {
      layoutWidth.value = entry.contentRect.width
    })
    layoutResizeObserver.observe(layoutRoot.value)
  }
  if (!itemGrid.value) return
  itemGridContentWidth.value = measureGridContentWidth()
  gridResizeObserver = new ResizeObserver(([entry]) => {
    itemGridContentWidth.value = entry.contentRect.width
  })
  gridResizeObserver.observe(itemGrid.value)
  if (outfitSlots.value) {
    outfitSlotsContentWidth.value = measureOutfitSlotsContentWidth()
    outfitResizeObserver = new ResizeObserver(([entry]) => {
      outfitSlotsContentWidth.value = entry.contentRect.width
    })
    outfitResizeObserver.observe(outfitSlots.value)
  }
  measureSubTabBar()
})

onUnmounted(() => {
  layoutResizeObserver?.disconnect()
  gridResizeObserver?.disconnect()
  outfitResizeObserver?.disconnect()
})

watch(
  () => config.ui.layout?.costume,
  layout => applyLayout(layout),
  { deep: true }
)

// ── Drag Handling ─────────────────────────────────────────────────────────────

const dragging = ref(null)
let drag = null

function startDragV(e) {
  e.preventDefault()
  dragging.value = 'v'
  const totalW = layoutWidth.value || document.querySelector('.costume-layout')?.clientWidth || window.innerWidth
  drag = {
    startX: e.clientX,
    startW: effectiveLeftWidth.value,
    maxW: Math.max(dynamicPaneMin.value, totalW - DIVIDER_SIZE - PANE_MIN),
  }
  attach()
}

function startDragH(e) {
  e.preventDefault()
  dragging.value = 'h'
  const el = document.querySelector('.pane-right')
  const totalH = el?.clientHeight ?? 1
  drag = { startY: e.clientY, startS: clampRightSplit(rightSplit.value, totalH), totalH }
  attach()
}

function onMove(e) {
  if (!drag) return
  if (dragging.value === 'v') {
    leftWidth.value = Math.max(PANE_MIN, Math.min(drag.maxW, drag.startW + e.clientX - drag.startX))
  } else {
    const dp = ((e.clientY - drag.startY) / drag.totalH) * 100
    rightSplit.value = clampRightSplit(drag.startS + dp, drag.totalH)
  }
}

function onUp() {
  dragging.value = null; drag = null
  detach(); persistLayout()
}

function attach()  { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp) }
function detach()  { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
onUnmounted(detach)

// ── Gender & Closet Tabs ──────────────────────────────────────────────────────

const gender = ref('PC2')   // PC1 = 男, PC2 = 女

// First-level tabs derived from CLOSET_TAB_CONF, sorted by rank_value.
// subTabs: children with matching fathertab.
// hasColor: true for 发型 and 妆容 — appends a reserved colour sub-tab.
const L1_TABS = [
  {
    id: '1', label: '套装', icon: '🎭',
    subTabs: [],
    hasColor: false,
  },
  {
    id: '3', label: '衣服', icon: '👗',
    subTabs: [
      { id: '4',  label: '连体服', icon: '🥻' },
      { id: '5',  label: '上装',   icon: '👕' },
      { id: '6',  label: '下装',   icon: '👖' },
      { id: '7',  label: '头饰',   icon: '🎀' },
      { id: '8',  label: '手饰',   icon: '💍' },
    ],
    hasColor: false,
  },
  {
    id: '9', label: '装饰', icon: '💎',
    subTabs: [
      { id: '10', label: '面饰',   icon: '🎭' },
      { id: '11', label: '鞋子',   icon: '👠' },
      { id: '12', label: '袜子',   icon: '🧦' },
      { id: '13', label: '背饰',   icon: '🎒' },
      { id: '14', label: '包挂饰', icon: '🔮' },
    ],
    hasColor: false,
  },
  {
    id: '2', label: '法杖', icon: '🪄',
    subTabs: [],
    hasColor: false,
  },
  {
    id: '15', label: '发型', icon: '💇',
    subTabs: [],
  },
  {
    id: '16', label: '妆容', icon: '💄',
    subTabs: [
      { id: '17', label: '肤色', icon: '🟤' },
      { id: '18', label: '眉毛', icon: '✏️' },
      { id: '19', label: '睫毛', icon: '👁'  },
      { id: '20', label: '瞳孔', icon: '🔵' },
      { id: '21', label: '贴花', icon: '🌸' },
    ],
  },
]

const activeL1Tab  = ref('3')
const activeSubTab = ref('4')   // default to first child of 衣服

const currentL1 = computed(() => L1_TABS.find(t => t.id === activeL1Tab.value))

// Sub-tabs for the active first-level tab.
const currentSubTabs = computed(() => currentL1.value?.subTabs ?? [])

// Re-measure pane minimum whenever the sub-tab bar content changes.
// Must be declared after currentSubTabs to avoid temporal dead zone.
watch(currentSubTabs, measureSubTabBar)

function setL1Tab(id) {
  activeL1Tab.value = id
  const tab = L1_TABS.find(t => t.id === id)
  if (tab.subTabs.length > 0) {
    activeSubTab.value = tab.subTabs[0].id
  } else if (tab.hasColor) {
    activeSubTab.value = 'color'
  } else {
    activeSubTab.value = null
  }
}

// ── Item Display ──────────────────────────────────────────────────────────────

// Swatch palette used when actual material colours are not yet known.
const SWATCH_PALETTE = ['#7c8eb5', '#b57c8e', '#8eb57c', '#b5a87c', '#9c7cb5', '#7cb5b5', '#b58e7c']

// Per-card selected variant index (keyed by item.id).
const selectedVariants = reactive({})
function activeVariant(item) {
  return item.variants[selectedVariants[item.id] ?? 0] ?? item.variants[0]
}
function swatchColor(v, idx) {
  if (v.colourIds?.length === 1) return v.colourIds[0]
  if (v.colourIds?.length >= 2)
    return `linear-gradient(135deg, ${v.colourIds[0]} 50%, ${v.colourIds[1]} 50%)`
  return SWATCH_PALETTE[idx % SWATCH_PALETTE.length]
}

// ── Tab → type filters ────────────────────────────────────────────────────────

const searchText = ref('')

const displayedItems = computed(() => {
  if (!costumeStore.scanned) return []

  // Gender: always include PC3 (unisex) items
  let items = costumeStore.items.filter(i =>
    i.gender === gender.value || i.gender === 'PC3'
  )

  // Hide items with no conf entry unless the user explicitly enables them.
  if (!hiddenConfig.showUnconfedItems) {
    items = items.filter(i => i.hasConf)
  }

  // Tab filter
  const sub = activeSubTab.value
  const l1  = activeL1Tab.value
  if (sub && RULE_SUB_TAB_FILTERS[sub]) {
    items = items.filter(RULE_SUB_TAB_FILTERS[sub])
  } else if (l1 && RULE_L1_TAB_FILTERS[l1]) {
    items = items.filter(RULE_L1_TAB_FILTERS[l1])
  }

  // Search
  const q = searchText.value.trim().toLowerCase()
  if (q) {
    items = items.filter(i =>
      (i.name ?? '').toLowerCase().includes(q) ||
      i.id.includes(q) ||
      i.type.toLowerCase().includes(q)
    )
  }

  return items
})

const displayedSuits = computed(() => {
  if (!costumeStore.scanned) return []
  const q = searchText.value.trim().toLowerCase()
  return costumeStore.suits.filter(s =>
    (s.gender === gender.value || s.gender === 'PC3') &&
    (!q || s.name.toLowerCase().includes(q))
  )
})

function suitIconUrl(suit) {
  return resolveGameTextureUrl(suit.icon)
}

function openAssetDir(item, tag) {
  const subdir = tag === 'tex' ? 'Tex' : tag === 'mat' ? 'Mat' : null
  platform.openPath(subdir ? platform.joinPath(item.folderPath, subdir) : item.folderPath)
}

function itemIconUrl(item) {
  const av = activeVariant(item)
  const iconUrl = resolveGameTextureUrl(av?.icon ?? item.icon)
  if (iconUrl) return iconUrl
  if (hiddenConfig.texFallback && item.assets.tex && item.folderPath) {
    const texId = textureIdFor(item, activeVariant)
    return baseTextureUrl(item, texId) ?? modelTextureUrl(item, item.type, texId)
  }
  return null
}


const scanProgressPct = computed(() => {
  const { done, total } = costumeStore.progress
  return total > 0 ? Math.round(done / total * 100) : 0
})

// ── Outfit Slots ──────────────────────────────────────────────────────────────

const SLOT_DEFS = [
  { id: 'sk',  label: '肤色', icon: '🎨' },
  { id: 'hr',  label: '发型', icon: '💇' },
  { id: 'br',  label: '眉毛', icon: '✏️' },
  { id: 'et',  label: '眼眶', icon: '👁'  },
  { id: 'es',  label: '眼球', icon: '👁'  },
  { id: 'pu',  label: '瞳孔', icon: '🔵' },
  { id: 'fe',  label: '脸型', icon: '😊' },
  { id: 'dc',  label: '贴花', icon: '🌸' },
  { id: 'fi',  label: '面饰', icon: '🎭' },
  { id: 'er',  label: '颈背', icon: '🔗' },
  { id: 'cup', label: '上衣', icon: '👗' },
  { id: 'ps',  label: '下装', icon: '👖' },
  { id: 'so',  label: '袜子', icon: '🧦' },
  { id: 'se',  label: '鞋子', icon: '👠' },
  { id: 'ht',  label: '帽子', icon: '🎩' },
  { id: 'hi',  label: '头饰', icon: '💫' },
  { id: 'mp',  label: '彩绘', icon: '💄' },
  { id: 'ge',  label: '手饰', icon: '💍' },
  { id: 'bg',  label: '背包', icon: '🎒' },
  { id: 'bi',  label: '挂饰', icon: '🔮' },
  { id: 'mw',  label: '法杖', icon: '🪄' },
]

// outfit[slotId] = item object or null
const outfit = reactive({})

function _defaultItemFor(slotId) {
  return defaultItemFor(slotId, gender.value, costumeStore.items)
}

function _previewEntryFor(item) {
  return previewEntryFor(item, {
    activeVariant,
    gender: gender.value,
    outfit,
    items: costumeStore.items,
  })
}
const previewModelUrls = computed(() => {
  const seen = new Set()
  const entries = []
  for (const [slotId, item] of Object.entries(outfit)) {
    if (!item?.assets.model || !item.folderPath || !item.modelFile) continue
    const entry = _previewEntryFor(item)
    if (seen.has(entry.url)) continue  // 连体服 cup+ps 共享同一模型，只取首个槽位的 key
    seen.add(entry.url)
    entries.push({ key: slotId, ...entry })
  }
  return entries
})

// Items with a model file, or config-only virtual items (no folderPath), can be selected.
function canSelect(item) {
  return item.assets.model || item.folderPath === null
}

function isEquipped(item) {
  const slotId = TYPE_TO_SLOT[item.type]
  return slotId ? outfit[slotId]?.id === item.id : false
}

function handleCardClick(item) {
  if (!canSelect(item)) return
  const slotId = TYPE_TO_SLOT[item.type]
  if (!slotId) return
  // Required slots can never be left empty.
  if (REQUIRED_SLOTS.has(slotId) && outfit[slotId]?.id === item.id) return
  outfit[slotId] = item

  // ── Slot conflict resolution ──────────────────────────────────────────────
  // Ht and Hi share the same game "hat" slot — equipping one removes the other.
  // Regular Hr hairstyle doesn't work under a hat; clear it so the user must
  // pick an Hr_Ht variant.
  if (slotId === 'ht') {
    outfit['hi'] = null
  } else if (slotId === 'hi') {
    outfit['ht'] = null
  }

  // Jumpsuit (Cup with isSuit=true) occupies both cup and ps slots.
  // A regular Cup or Ps item removes the jumpsuit from the other slot.
  if (slotId === 'cup') {
    if (item.isSuit) {
      outfit['ps'] = item                 // jumpsuit fills ps as well
    } else if (outfit['ps']?.isSuit) {
      outfit['ps'] = null                 // regular top removes jumpsuit bottom
      _applyDefaultFor('ps')              // ps is required -> restore default
    }
  } else if (slotId === 'ps') {
    if (outfit['cup']?.isSuit) {
      outfit['cup'] = null                // separate bottom removes jumpsuit top
      _applyDefaultFor('cup')             // cup is required → restore default
    }
  }
}

// Fill one required slot from the gender-specific default, unless already occupied.
function _applyDefaultFor(slotId) {
  if (outfit[slotId]) return
  const item = _defaultItemFor(slotId)
  if (item) outfit[slotId] = item
}

// Fill all required slots from scanned items using the gender-specific defaults.
// Skips slots that already have a user selection.
function applyDefaults() {
  if (!costumeStore.scanned) return
  for (const slotId of Object.keys(DEFAULT_MODEL_BASES[gender.value] ?? {})) {
    _applyDefaultFor(slotId)
  }
}

// After a rescan, refresh outfit item references to the new scan results so that
// model URLs and textures reflect the latest filesystem state.
function _refreshOutfit() {
  for (const [slotId, item] of Object.entries(outfit)) {
    if (!item) continue
    const fresh = costumeStore.items.find(i => i.id === item.id && i.type === item.type)
    if (fresh) outfit[slotId] = fresh
    else if (!REQUIRED_SLOTS.has(slotId)) outfit[slotId] = null
  }
  applyDefaults()
}

function handleSuitClick(suit) {
  for (const itemId of suit.itemIds) {
    const item = costumeStore.items.find(
      i => i.id === itemId && (i.gender === gender.value || i.gender === 'PC3')
    )
    if (item) handleCardClick(item)
  }
}

function clearSlot(slotId) {
  if (REQUIRED_SLOTS.has(slotId)) return
  outfit[slotId] = null
  if ((slotId === 'ht' || slotId === 'hi') && outfit.hr?.type === 'Hr_Ht') {
    const defaultHr = _defaultItemFor('hr')
    if (defaultHr) outfit.hr = defaultHr
  }
}

// Display name for an equipped slot, using the currently selected colour variant.
function slotValue(slotId) {
  const item = outfit[slotId]
  if (!item) return null
  const variantIdx = selectedVariants[item.id] ?? 0
  const variant = item.variants[variantIdx] ?? item.variants[0]
  return (item.variants.length > 1 && variant?.name) ? variant.name : item.name
}

// Thumbnail URL for an equipped slot.
function slotIconUrl(slotId) {
  const item = outfit[slotId]
  return item ? itemIconUrl(item) : null
}

function resetOutfit() {
  for (const key of Object.keys(outfit)) delete outfit[key]
  applyDefaults()
}

// After each scan (initial or rescan) refresh outfit item references and fill defaults.
watch(() => costumeStore.scanned, scanned => { if (scanned) _refreshOutfit() })

// On gender switch: clear the whole outfit and re-apply defaults for the new gender.
watch(gender, () => {
  for (const key of Object.keys(outfit)) delete outfit[key]
  applyDefaults()
})

// ── Model preview ref & JSON export ──────────────────────────────────────────

const modelViewerRef = ref(null)

// Convert nrcfile:///D:/foo%20bar/baz → D:\foo bar\baz
function _toWinPath(url) {
  if (!url) return null
  let p = url
  if (p.startsWith('nrcfile:///')) p = p.slice('nrcfile:///'.length)
  else if (p.startsWith('nrcfile://')) p = p.slice('nrcfile://'.length)
  return decodeURIComponent(p).replace(/\//g, '\\')
}

// Find the avatar root by looking for the .../PC segment that precedes PC[123]/Avatar/
function _avatarRoot(winPath) {
  if (!winPath) return null
  const m = winPath.match(/^(.*\\PC)\\PC[123]\\/i)
  return m ? m[1] : null
}

function _rel(winPath, root) {
  if (!winPath || !root) return winPath
  const prefix = root.endsWith('\\') ? root : root + '\\'
  return winPath.startsWith(prefix) ? winPath.slice(prefix.length) : winPath
}

function _replaceExt(path, newExt) {
  if (!path || !newExt) return path
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(0, dot) + newExt : path + newExt
}

// Derive the Mat\ path from the texture path: replace Tex\{file} → Mat\{matName}.{ext}
function _matPath(texRelPath, matName, matExt) {
  if (!texRelPath) return `Mat\\${matName}${matExt}`
  const m = texRelPath.match(/^(.*\\)Tex\\[^\\]+$/)
  return m ? `${m[1]}Mat\\${matName}${matExt}` : `Mat\\${matName}${matExt}`
}

// ── Export dialog state ───────────────────────────────────────────────────────

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
  const mExt   = exportModelExt.value
  const tExt   = exportTexExt.value
  const matExt = exportMatExt.value || costumeStore.matFileExt || '.json'
  const resolved = modelViewerRef.value?.resolvedMaterials ?? {}

  let avatarRoot = null
  for (const entry of previewModelUrls.value) {
    avatarRoot = _avatarRoot(_toWinPath(entry.url))
    if (avatarRoot) break
  }

  const data = {
    avatarRoot: avatarRoot ?? '',
    gender: gender.value,
    slots: previewModelUrls.value.map(entry => {
      const mats       = resolved[entry.key] ?? {}
      const modelRel   = _replaceExt(_rel(_toWinPath(entry.url), avatarRoot), mExt)
      const materials  = {}
      for (const [matName, info] of Object.entries(mats)) {
        const matKey = `${matName}${matExt}`
        if (!info) {
          materials[matKey] = { mat: _matPath(null, matName, matExt), texture: null }
          continue
        }
        if (info.fallbackColor) {
          materials[matKey] = { mat: _matPath(null, matName, matExt), color: info.fallbackColor }
          continue
        }
        const texRel  = _rel(_toWinPath(info.url), avatarRoot)
        const texPath = _replaceExt(texRel, tExt)
        const rec     = { mat: _matPath(texRel, matName, matExt), texture: texPath }
        if (info.overlayUrl) rec.overlay = _replaceExt(_rel(_toWinPath(info.overlayUrl), avatarRoot), tExt)
        materials[matKey] = rec
      }
      return { slot: entry.key, model: modelRel, materials }
    }),
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `nrc_outfit_${gender.value}_${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="view costume-view" :class="{ 'no-select': dragging }">
    <div ref="layoutRoot" class="costume-layout">

      <!-- ── Left Pane: Closet Index ──────────────────────────── -->
      <div class="pane-left" :style="{ width: effectiveLeftWidth + 'px' }">

        <!-- Full-width title bar — spans both sidebar and main -->
        <div class="panel-head closet-head">
          <span>服装选择区</span>
          <div class="gender-switch">
            <button
              class="gender-btn"
              :class="{ active: gender === 'PC1' }"
              @click="gender = 'PC1'"
            >男</button>
            <button
              class="gender-btn"
              :class="{ active: gender === 'PC2' }"
              @click="gender = 'PC2'"
            >女</button>
          </div>
        </div>

        <!-- Sidebar + main content side by side below the header -->
        <div class="closet-body">

          <!-- Category sidebar -->
          <nav class="closet-sidebar">
            <button
              v-for="tab in L1_TABS"
              :key="tab.id"
              class="sidebar-tab"
              :class="{ active: activeL1Tab === tab.id }"
              :title="tab.label"
              @click="setL1Tab(tab.id)"
            >
              <span class="tab-icon-wrap">
                <img v-if="costumeStore.closetTabIcons[tab.id]" class="tab-frame-icon" :src="frameUrl(costumeStore.closetTabIcons[tab.id])" @error="e => e.target.style.display='none'" />
                <span v-else>{{ tab.icon }}</span>
              </span>
              <span class="tab-label">{{ tab.label }}</span>
            </button>
          </nav>

          <!-- Main content column -->
          <div class="closet-main">

            <!-- Sub-tab bar — visible when active L1 tab has children -->
            <div v-if="currentSubTabs.length > 0" ref="subTabBar" class="sub-tab-bar">
              <button
                v-for="sub in currentSubTabs"
                :key="sub.id"
                class="sub-tab"
                :class="{ active: activeSubTab === sub.id }"
                :title="sub.label"
                @click="activeSubTab = sub.id"
              >
                <div class="sub-thumb">
                  <img v-if="costumeStore.closetTabIcons[sub.id]" class="sub-frame-icon" :src="frameUrl(costumeStore.closetTabIcons[sub.id])" @error="e => e.target.style.display='none'" />
                  <span v-else class="sub-thumb-icon">{{ sub.icon }}</span>
                </div>
                <span class="sub-label">{{ sub.label }}</span>
              </button>
            </div>

            <!-- Toolbar: search -->
            <div class="closet-toolbar">
              <div class="search-wrap">
                <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="7"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <input type="text" class="search-input" placeholder="搜索…" v-model="searchText" />
              </div>
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

              <!-- Scan trigger -->
              <button
                class="head-action-btn scan-btn"
                :class="{ scanning: costumeStore.scanning }"
                :disabled="costumeStore.scanning"
                :title="costumeStore.scanning ? `扫描中 ${scanProgressPct}%` : '扫描本地模型资产'"
                @click="rescanCostumes"
              >
                <span v-if="costumeStore.scanning">{{ scanProgressPct }}%</span>
                <span v-else>扫描</span>
              </button>
            </div>

            <!-- Empty / scan state -->
            <div v-if="!costumeStore.scanned && !costumeStore.scanning" class="scan-empty view-empty">
              <svg class="view-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
                <path d="M11 8v6M8 11h6"/>
              </svg>
              <p class="view-empty__title">尚未扫描</p>
              <p class="view-empty__desc">
                <span v-if="!config.paths.models">请先在设置中配置模型路径</span>
                <span v-else>点击工具栏"扫描"按钮加载本地资产</span>
              </p>
            </div>

            <div v-else-if="costumeStore.scanning" class="scan-empty view-empty">
              <div class="scan-progress-ring"></div>
              <p class="view-empty__title">扫描中…</p>
              <p class="view-empty__desc">{{ costumeStore.progress.done }} / {{ costumeStore.progress.total }}</p>
            </div>

            <div v-else-if="costumeStore.error" class="scan-empty view-empty">
              <p class="view-empty__title">扫描失败</p>
              <p class="view-empty__desc">{{ costumeStore.error }}</p>
              <button class="head-action-btn" style="margin-top:10px" @click="rescanCostumes">重试</button>
            </div>

            <div
              v-else
              ref="itemGrid"
              class="item-grid scrollable"
              :style="{
                '--item-card-min': effectiveCardMin + 'px',
                '--item-card-width': actualCardWidth + 'px',
                '--item-card-footer-height': CARD_FOOTER_HEIGHT + 'px',
              }"
            >
              <!-- ── Suits tab ── -->
              <template v-if="activeL1Tab === '1'">
                <div v-if="displayedSuits.length === 0" class="grid-empty">暂无套装数据</div>
                <div
                  v-for="suit in displayedSuits"
                  :key="suit.id"
                  class="item-card suit-card"
                  @click="handleSuitClick(suit)"
                >
                  <div class="card-thumb" style="background: #252830">
                    <img
                      v-if="suitIconUrl(suit)"
                      class="card-thumb-img suit-thumb-img"
                      :src="suitIconUrl(suit)"
                      @error="e => e.target.style.display = 'none'"
                    />
                    <span v-if="suit.gradeName" class="suit-grade-badge">{{ suit.gradeName }}</span>
                  </div>
                  <div class="card-footer">
                    <p class="card-name">{{ suit.name }}</p>
                    <p class="card-id">{{ suit.itemIds.length }} 件单品</p>
                  </div>
                </div>
              </template>

              <!-- ── Normal items tabs ── -->
              <template v-else>
                <div v-if="displayedItems.length === 0" class="grid-empty">暂无匹配资产</div>
                <div
                  v-for="item in displayedItems"
                  :key="item.id"
                  class="item-card"
                  :class="{
                    equipped:     isEquipped(item),
                    unselectable: !canSelect(item),
                  }"
                  @click="handleCardClick(item)"
                >
                <div class="card-thumb" :style="{ background: RULE_TYPE_COLORS[item.type] ?? '#252830' }">
                  <img
                    v-if="itemIconUrl(item)"
                    class="card-thumb-img"
                    :src="itemIconUrl(item)"
                    @error="e => e.target.style.display = 'none'"
                  />
                  <!-- Asset presence indicators — click to open folder -->
                  <div v-if="hiddenConfig.showAssetTags" class="asset-tags">
                    <template v-if="hiddenConfig.hideMissingAssets">
                      <button v-if="item.assets.model" class="asset-tag" @click.stop="openAssetDir(item, 'model')">Model</button>
                      <button v-if="item.assets.tex"   class="asset-tag" @click.stop="openAssetDir(item, 'tex')">Tex</button>
                      <button v-if="item.assets.mat"   class="asset-tag" @click.stop="openAssetDir(item, 'mat')">Mat</button>
                    </template>
                    <template v-else>
                      <button class="asset-tag" :class="{ missing: !item.assets.model }"
                        @click.stop="item.assets.model && openAssetDir(item, 'model')">Model</button>
                      <button class="asset-tag" :class="{ missing: !item.assets.tex }"
                        @click.stop="item.assets.tex && openAssetDir(item, 'tex')">Tex</button>
                      <button class="asset-tag" :class="{ missing: !item.assets.mat }"
                        @click.stop="item.assets.mat && openAssetDir(item, 'mat')">Mat</button>
                    </template>
                  </div>
                  <!-- Colour variant swatches -->
                  <div v-if="item.variants.length > 1" class="variant-swatches">
                    <button
                      v-for="(v, idx) in item.variants"
                      :key="v.id"
                      class="variant-swatch"
                      :class="{ active: (selectedVariants[item.id] ?? 0) === idx }"
                      :style="{ background: swatchColor(v, idx) }"
                      @click.stop="selectedVariants[item.id] = idx"
                    />
                  </div>
                </div>
                <div class="card-footer">
                  <p class="card-name">{{ activeVariant(item).name ?? item.name }}</p>
                  <p class="card-id">{{ item.assets.model ? item.modelBaseName : '' }}</p>
                </div>
              </div>
              </template>
            </div>

          </div>
        </div>
      </div>

      <!-- ── Vertical Drag Divider ─────────────────────────────── -->
      <div
        class="divider divider--v"
        :class="{ active: dragging === 'v' }"
        @mousedown="startDragV"
      ></div>

      <!-- ── Right Pane ────────────────────────────────────────── -->
      <div class="pane-right" :style="{ '--right-pane-min-height': RIGHT_PANE_MIN_HEIGHT + 'px' }">

        <!-- Top: outfit config (Issue 3: horizontal row layout per slot) -->
        <div class="pane-top" :style="{ height: rightSplit + '%' }">
          <div class="panel-head">
            <span>已选服装配置区</span>
            <button class="head-action-btn" @click="resetOutfit">重置</button>
          </div>
          <div
            ref="outfitSlots"
            class="outfit-slots scrollable"
            :style="{
              '--outfit-slot-min': OUTFIT_SLOT_MIN + 'px',
              '--outfit-slot-width': actualOutfitSlotWidth + 'px',
              '--outfit-slot-height': actualOutfitSlotHeight + 'px',
            }"
          >
            <div
              v-for="slot in SLOT_DEFS"
              :key="slot.id"
              class="outfit-slot"
              :class="{ equipped: !!outfit[slot.id], required: REQUIRED_SLOTS.has(slot.id) }"
              @click="clearSlot(slot.id)"
            >
              <!-- Square icon / thumbnail on the left -->
              <div class="slot-thumb">
                <img
                  v-if="slotIconUrl(slot.id)"
                  class="slot-thumb-img"
                  :src="slotIconUrl(slot.id)"
                  @error="e => e.target.style.display = 'none'"
                />
                <span v-else class="slot-thumb-icon">{{ slot.icon }}</span>
              </div>
              <!-- Text on the right -->
              <div class="slot-info">
                <span class="slot-label">{{ slot.label }}</span>
                <span class="slot-value">{{ slotValue(slot.id) ?? '—' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Horizontal Drag Divider ──── -->
        <div
          class="divider divider--h"
          :class="{ active: dragging === 'h' }"
          @mousedown="startDragH"
        ></div>

        <!-- Bottom: 3D preview -->
        <div class="pane-bottom">
          <div class="panel-head">
            <span>模型预览区</span>
            <button v-if="previewModelUrls.length" class="head-action-btn" @click="openExportDialog">导出配置</button>
          </div>
          <ModelViewer ref="modelViewerRef" :model-urls="previewModelUrls" />
        </div>

      </div>
    </div>

    <!-- ── Export config dialog ────────────────────────────────── -->
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
/* ── Root ───────────────────────────────────────────────────── */
.costume-view { background: var(--bg-base); }
.no-select { user-select: none; }
.no-select .divider--v { cursor: ew-resize; }
.no-select .divider--h { cursor: ns-resize; }

.costume-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

/* ── Left Pane ──────────────────────────────────────────────── */
.pane-left {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  /* min-width is managed by dynamicPaneMin in JS */
}

/* Sidebar + main sit side-by-side below the header */
.closet-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

/* ── Closet Sidebar ─────────────────────────────────────────── */
.closet-sidebar {
  width: 60px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 5px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  overflow-y: auto;
}

.sidebar-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 7px 4px;
  border-radius: var(--r-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}
.sidebar-tab:hover { background: var(--bg-hover); color: var(--text-primary); }
.sidebar-tab.active { background: var(--accent-muted); color: var(--accent-hover); }

.tab-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  background: var(--bg-active);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  overflow: hidden;
  transition: background var(--t);
}
.sidebar-tab.active .tab-icon-wrap { background: var(--accent-muted); }

.tab-label { font-size: 11px; font-weight: 500; line-height: 1; }

.tab-frame-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.sub-frame-icon {
  width: calc(100% - 8px);
  height: calc(100% - 8px);
  object-fit: contain;
}

[data-theme="light"] .tab-frame-icon,
[data-theme="light"] .sub-frame-icon {
  filter: invert(1) brightness(0.75);
}

[data-theme="light"] .tab-icon-wrap {
  background: rgba(0, 0, 0, 0.08);
}
[data-theme="light"] .sidebar-tab.active .tab-icon-wrap {
  background: var(--accent-muted);
}

[data-theme="light"] .sub-thumb {
  background: rgba(0, 0, 0, 0.08);
}
[data-theme="light"] .sub-tab.active .sub-thumb {
  background: var(--accent-muted);
}

/* ── Sub-tab Bar ────────────────────────────────────────────── */
.sub-tab-bar {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 6px 6px 0;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  overflow-x: auto;
  flex-shrink: 0;
}

.sub-tab {
  display: flex;
  flex-direction: row;   /* icon left, label right */
  align-items: center;
  gap: 6px;
  padding: 5px 10px 7px;
  border-radius: var(--r-md) var(--r-md) 0 0;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  transition: background var(--t), color var(--t);
}
.sub-tab:hover { background: var(--bg-hover); color: var(--text-primary); }
.sub-tab.active { color: var(--accent-hover); }
.sub-tab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 4px; right: 4px;
  height: 2px;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
}

/* Square preview placeholder — same visual language as sidebar .tab-icon-wrap */
.sub-thumb {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: var(--r-sm);
  background: var(--bg-active);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  overflow: hidden;
  transition: background var(--t);
}
.sub-tab.active .sub-thumb { background: var(--accent-muted); }

.sub-thumb-icon { line-height: 1; pointer-events: none; }

.sub-label {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  line-height: 1;
  color: inherit;
}

/* ── Closet Main ────────────────────────────────────────────── */
.closet-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* ── Panel Header (shared between all pane headers) ─────────── */
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

/* Issue 4: closet header has gender switcher instead of an action button */
.closet-head { text-transform: uppercase; }

/* Gender segmented control */
.gender-switch {
  display: flex;
  gap: 2px;
  background: var(--bg-active);
  padding: 2px;
  border-radius: var(--r-md);
  flex-shrink: 0;
}

.gender-btn {
  padding: 2px 10px;
  border-radius: calc(var(--r-md) - 2px);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0;
  text-transform: none;
  transition: background var(--t), color var(--t), box-shadow var(--t);
}

.gender-btn.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

[data-theme="light"] .gender-btn.active {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

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

/* ── Toolbar ────────────────────────────────────────────────── */
.closet-toolbar {
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

.card-size-range {
  min-width: 0;
}

/* ── Item Grid ──────────────────────────────────────────────── */
/* The slider controls card density; columns still stretch to fill the available width. */
.item-grid {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--item-card-min, 120px)), 1fr));
  grid-auto-rows: calc(var(--item-card-width, 120px) + var(--item-card-footer-height, 44px));
  gap: 7px;
  align-content: start;
  align-items: start;
}

/* ── Item Card ──────────────────────────────────────────────── */
.item-card {
  width: 100%;
  height: 100%;
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, var(--item-card-width, 120px)) var(--item-card-footer-height, 44px);
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

.item-card.equipped {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent) inset;
}
.item-card.equipped:hover { border-color: var(--accent); }

.item-card.unselectable {
  opacity: 0.45;
  cursor: not-allowed;
}
.item-card.unselectable:hover {
  transform: none;
  box-shadow: none;
  border-color: var(--border-subtle);
}

.card-thumb {
  width: 100%;
  height: 100%;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.card-thumb-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

/* ── Suit cards ─────────────────────────────────────────────── */
.suit-thumb-img {
  object-fit: contain;
}

.suit-grade-badge {
  position: absolute;
  bottom: 5px;
  left: 5px;
  font-size: 9px;
  font-family: var(--font-mono);
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

/* ── Variant colour swatches ────────────────────────────────── */
.variant-swatches {
  position: absolute;
  bottom: 5px;
  right: 5px;
  display: flex;
  gap: 3px;
  flex-wrap: wrap-reverse;
  justify-content: flex-end;
  max-width: 70%;
}

.variant-swatch {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.45);
  cursor: pointer;
  flex-shrink: 0;
  transition: transform var(--t), border-color var(--t);
}
.variant-swatch:hover   { transform: scale(1.2); border-color: rgba(255,255,255,0.85); }
.variant-swatch.active  { border-color: #fff; transform: scale(1.25); box-shadow: 0 0 0 1px rgba(0,0,0,0.3); }

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
}
.asset-tag:not(.missing) {
  cursor: pointer;
}
.asset-tag:not(.missing):hover {
  background: rgba(255, 255, 255, 0.22);
}
.asset-tag.missing {
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.35);
  text-decoration: line-through;
  cursor: default;
}

.card-footer {
  min-width: 0;
  padding: 5px 8px 6px;
  border-top: 1px solid var(--border-subtle);
  overflow: hidden;
}
.card-name {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
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
  width: 100%;
  min-width: 0;
  max-width: 100%;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

/* ── Drag Dividers ──────────────────────────────────────────── */
.divider {
  flex-shrink: 0;
  background: var(--border-subtle);
  position: relative;
  z-index: 10;
  transition: background var(--t);
}
.divider::before {
  content: '';
  position: absolute;
  z-index: 1;
}
.divider::after {
  content: '';
  position: absolute;
  background: var(--accent);
  opacity: 0;
  border-radius: 2px;
  transition: opacity var(--t);
  z-index: 2;
}
.divider--v { width: 4px; cursor: ew-resize; }
.divider--v::before { top: 0; bottom: 0; left: -5px; right: -5px; }
.divider--v::after  { top: 0; bottom: 0; left: 1px; width: 2px; }
.divider--h { height: 4px; cursor: ns-resize; }
.divider--h::before { left: 0; right: 0; top: -5px; bottom: -5px; }
.divider--h::after  { left: 0; right: 0; top: 1px; height: 2px; }
.divider:hover::after, .divider.active::after { opacity: 1; }

/* ── Right Pane ─────────────────────────────────────────────── */
.pane-right { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.pane-top   { flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; min-height: var(--right-pane-min-height, 120px); }
.pane-bottom { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: var(--right-pane-min-height, 120px); }

/* ── Outfit Slots ───────────────────────────────────────────── */
/* Grid ensures every cell is exactly the same width — no last-row width drift. */
.outfit-slots {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--outfit-slot-min, 120px)), 1fr));
  grid-auto-rows: var(--outfit-slot-height, 46px);
  gap: var(--outfit-slot-gap, 5px);
  padding: 8px;
  overflow-y: auto;
  align-content: start;
  align-items: start;
}

.outfit-slot {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--r-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: border-color var(--t), background var(--t);
  overflow: hidden;
}
.outfit-slot:hover { border-color: var(--border); background: var(--bg-hover); }
.outfit-slot.equipped { border-color: var(--accent-border); background: var(--accent-muted); }
.outfit-slot.required { cursor: default; }
.outfit-slot.required.equipped:hover { border-color: var(--accent-border); background: var(--accent-muted); }

/* Square icon placeholder on the left */
.slot-thumb {
  width: clamp(34px, calc(var(--outfit-slot-height, 46px) - 12px), 52px);
  height: clamp(34px, calc(var(--outfit-slot-height, 46px) - 12px), 52px);
  flex-shrink: 0;
  border-radius: var(--r-sm);
  background: var(--bg-active);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(18px, calc(var(--outfit-slot-height, 46px) * 0.38), 24px);
  overflow: hidden;
  transition: background var(--t);
}
.outfit-slot.equipped .slot-thumb { background: rgba(124, 106, 247, 0.12); }
.slot-thumb-icon { line-height: 1; }
.slot-thumb-img { width: 100%; height: 100%; object-fit: contain; }

/* Text column on the right */
.slot-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.slot-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  line-height: 1.2;
}
.slot-value {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
.outfit-slot.equipped .slot-value { color: var(--text-primary); font-weight: 500; }

/* ── Preview Empty ──────────────────────────────────────────── */

/* ── Scan states ────────────────────────────────────────────── */
.scan-empty {
  flex: 1;
  margin: 8px;
  border-radius: var(--r-md);
  border: 1px dashed var(--border-subtle);
}

.scan-btn {
  flex-shrink: 0;
  height: 28px;
  min-width: 52px;
  text-align: center;
}
.scan-btn.scanning { color: var(--accent-hover); }

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

.grid-empty {
  grid-column: 1 / -1;
  padding: 32px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
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
  gap: 18px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
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

.export-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

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
