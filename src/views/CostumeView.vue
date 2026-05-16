<script setup>
import { computed, nextTick, reactive, ref, onMounted, onUnmounted, watch } from 'vue'
import { config } from '../store/config.js'

// ── Layout Persistence ────────────────────────────────────────────────────────

const CARD_MIN_MIN = 56
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
const DEBUG_CARD_GRID = true
const DEFAULT = { leftWidth: 320, rightSplit: 42, cardMin: 120 }

function loadLayout() {
  return { ...DEFAULT, ...(config.ui.layout?.costume ?? {}) }
}

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

const leftWidth  = ref(loadLayout().leftWidth)
const rightSplit = ref(loadLayout().rightSplit)
const cardMin    = ref(clampCardMin(loadLayout().cardMin))
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
let debugFrame = 0

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
    rightSplit: clampRightSplit(rightSplit.value),
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

function logCardGrid(reason = 'manual') {
  if (!DEBUG_CARD_GRID || !itemGrid.value) return

  const grid = itemGrid.value
  const style = window.getComputedStyle(grid)
  const gridRect = grid.getBoundingClientRect()
  const firstCard = grid.querySelector('.item-card')
  const firstCardRect = firstCard?.getBoundingClientRect()
  const paddingInline = readPx(style.paddingLeft) + readPx(style.paddingRight)
  const gap = readPx(style.columnGap)
  const contentWidth = grid.clientWidth - paddingInline
  const tracks = style.gridTemplateColumns === 'none'
    ? []
    : style.gridTemplateColumns.split(' ').filter(Boolean)

  console.groupCollapsed(`[CostumeGrid] ${reason}`)
  console.table({
    leftWidth: leftWidth.value,
    effectiveLeftWidth: effectiveLeftWidth.value,
    rightSplit: rightSplit.value,
    paneMin: PANE_MIN,
    layoutWidth: layoutWidth.value,
    savedCardMin: cardMin.value,
    dynamicCardMax: cardMinMax.value,
    effectiveCardMin: effectiveCardMin.value,
    actualCardWidth: Math.round(actualCardWidth.value * 100) / 100,
    minColumns: CARD_MIN_COLUMNS,
    observedContentWidth: itemGridContentWidth.value,
    gridClientWidth: grid.clientWidth,
    gridOffsetWidth: grid.offsetWidth,
    gridScrollWidth: grid.scrollWidth,
    gridRectWidth: Math.round(gridRect.width * 100) / 100,
    contentWidth,
    paddingInline,
    gap,
    trackCount: tracks.length,
    gridTemplateColumns: style.gridTemplateColumns,
    firstCardWidth: firstCardRect ? Math.round(firstCardRect.width * 100) / 100 : null,
    firstCardOffsetWidth: firstCard?.offsetWidth ?? null,
    overflowX: grid.scrollWidth > grid.clientWidth,
  })
  console.groupEnd()
}

function scheduleCardGridLog(reason) {
  if (!DEBUG_CARD_GRID) return
  cancelAnimationFrame(debugFrame)
  debugFrame = requestAnimationFrame(() => logCardGrid(reason))
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
  applyLayout(config.ui.layout?.costume)
  if (layoutRoot.value) {
    layoutWidth.value = layoutRoot.value.clientWidth
    layoutResizeObserver = new ResizeObserver(([entry]) => {
      layoutWidth.value = entry.contentRect.width
      scheduleCardGridLog('layout-resize')
    })
    layoutResizeObserver.observe(layoutRoot.value)
  }
  if (!itemGrid.value) return
  itemGridContentWidth.value = measureGridContentWidth()
  gridResizeObserver = new ResizeObserver(([entry]) => {
    itemGridContentWidth.value = entry.contentRect.width
    scheduleCardGridLog('resize')
  })
  gridResizeObserver.observe(itemGrid.value)
  if (outfitSlots.value) {
    outfitSlotsContentWidth.value = measureOutfitSlotsContentWidth()
    outfitResizeObserver = new ResizeObserver(([entry]) => {
      outfitSlotsContentWidth.value = entry.contentRect.width
      scheduleCardGridLog('outfit-resize')
    })
    outfitResizeObserver.observe(outfitSlots.value)
  }
  window.__nrcLogCostumeGrid = logCardGrid
  scheduleCardGridLog('mounted')
  measureSubTabBar()
})

onUnmounted(() => {
  layoutResizeObserver?.disconnect()
  gridResizeObserver?.disconnect()
  outfitResizeObserver?.disconnect()
  cancelAnimationFrame(debugFrame)
  if (window.__nrcLogCostumeGrid === logCardGrid) delete window.__nrcLogCostumeGrid
})

watch(
  () => config.ui.layout?.costume,
  (layout) => {
    applyLayout(layout)
    scheduleCardGridLog('layout-config')
  },
  { deep: true }
)

watch([leftWidth, effectiveLeftWidth, cardMin, effectiveCardMin, cardMinMax, actualCardWidth, actualOutfitSlotWidth], () => {
  scheduleCardGridLog('layout-state')
})

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
      { id: '19', label: '睫毛', icon: '👁' },
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

// ── Test Data ─────────────────────────────────────────────────────────────────
// Colour variants of the same base item are stored in `variants`.
// Each card tracks its active variant index in `selectedVariants`.

const testItems = [
  {
    id: '2070390101', name: '菡萏留声', type: 'Cup', gender: 'PC2',
    assets: { model: true, tex: true, mat: true },
    variants: [
      { id: '2070390101', hue: '#c8a0b0' },
      { id: '2070390102', hue: '#90a8c8' },
      { id: '2070390103', hue: '#a0c890' },
    ],
  },
  { id: '2090001001', name: '月光序曲·下', type: 'Ps',  gender: 'PC2', assets: { model: true, tex: true, mat: true  }, variants: [{ id: '2090001001', hue: '#b0a0c8' }] },
  { id: '2090002001', name: '晨曦织梦·下', type: 'Ps',  gender: 'PC2', assets: { model: true, tex: true, mat: false }, variants: [{ id: '2090002001', hue: '#c8b890' }] },
  {
    id: '2010001001', name: '自然卷', type: 'Hr', gender: 'PC2',
    assets: { model: true, tex: true, mat: true },
    variants: [
      { id: '2010001001', hue: '#505050' },
      { id: '2010001002', hue: '#906050' },
    ],
  },
  { id: '2010002001', name: '直发短切',   type: 'Hr',  gender: 'PC2', assets: { model: true, tex: false, mat: false }, variants: [{ id: '2010002001', hue: '#c8b0a0' }] },
  {
    id: '1010001001', name: '卷发', type: 'Hr', gender: 'PC1',
    assets: { model: true, tex: true, mat: true },
    variants: [
      { id: '1010001001', hue: '#383838' },
      { id: '1010001002', hue: '#785038' },
    ],
  },
  { id: '2070001001', name: '基础上衣',   type: 'Cup', gender: 'PC2', assets: { model: true, tex: true, mat: false }, variants: [{ id: '2070001001', hue: '#d8d0c8' }] },
  { id: '1070001001', name: '基础上衣·男', type: 'Cup', gender: 'PC1', assets: { model: true, tex: false, mat: false }, variants: [{ id: '1070001001', hue: '#c0c8d0' }] },
  { id: '2030001001', name: '标准眉形',   type: 'Br',  gender: 'PC2', assets: { model: true, tex: true, mat: true  }, variants: [{ id: '2030001001', hue: '#907090' }] },
  { id: '2040001001', name: '单眼皮',     type: 'Et',  gender: 'PC2', assets: { model: true, tex: true, mat: true  }, variants: [{ id: '2040001001', hue: '#906070' }] },
]

// Per-card selected variant index (keyed by item.id).
const selectedVariants = reactive({})
function activeVariant(item) {
  return item.variants[selectedVariants[item.id] ?? 0] ?? item.variants[0]
}

// ── Outfit Slots ──────────────────────────────────────────────────────────────

const slots = [
  { id: 'hr',  label: '发型', value: '自然卷·黑', icon: '💇' },
  { id: 'br',  label: '眉毛', value: '标准眉形',  icon: '✏️' },
  { id: 'et',  label: '眼眶', value: '单眼皮',    icon: '👁' },
  { id: 'es',  label: '眼球', value: null,        icon: '👁' },
  { id: 'fe',  label: '脸型', value: null,        icon: '😊' },
  { id: 'cup', label: '上衣', value: '菡萏留声',  icon: '👗' },
  { id: 'ps',  label: '下装', value: '月光序曲',  icon: '👖' },
  { id: 'so',  label: '袜子', value: null,        icon: '🧦' },
  { id: 'se',  label: '鞋子', value: null,        icon: '👠' },
  { id: 'ht',  label: '帽子', value: null,        icon: '🎩' },
  { id: 'hi',  label: '头饰', value: null,        icon: '💫' },
  { id: 'mp',  label: '彩绘', value: null,        icon: '💄' },
  { id: 'ge',  label: '手饰', value: null,        icon: '💍' },
  { id: 'bg',  label: '背包', value: null,        icon: '🎒' },
  { id: 'bi',  label: '挂饰', value: null,        icon: '🔮' },
  { id: 'mw',  label: '法杖', value: null,        icon: '🪄' },
]
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
              <span class="tab-icon-wrap">{{ tab.icon }}</span>
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
                  <span class="sub-thumb-icon">{{ sub.icon }}</span>
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
                <input type="text" class="search-input" placeholder="搜索…" />
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
            </div>

            <div
              ref="itemGrid"
              class="item-grid scrollable"
              :style="{
                '--item-card-min': effectiveCardMin + 'px',
                '--item-card-width': actualCardWidth + 'px',
                '--item-card-footer-height': CARD_FOOTER_HEIGHT + 'px',
              }"
            >
              <div
                v-for="item in testItems"
                :key="item.id"
                class="item-card"
              >
                <div class="card-thumb" :style="{ background: activeVariant(item).hue }">
                  <!-- Asset presence indicators: Model / Tex / Mat -->
                  <div class="asset-tags">
                    <span class="asset-tag" :class="{ missing: !item.assets.model }">Model</span>
                    <span class="asset-tag" :class="{ missing: !item.assets.tex }">Tex</span>
                    <span class="asset-tag" :class="{ missing: !item.assets.mat }">Mat</span>
                  </div>
                  <!-- Colour variant swatches — only shown when the item has multiple variants -->
                  <div v-if="item.variants.length > 1" class="variant-swatches">
                    <button
                      v-for="(v, idx) in item.variants"
                      :key="v.id"
                      class="variant-swatch"
                      :class="{ active: (selectedVariants[item.id] ?? 0) === idx }"
                      :style="{ background: v.hue }"
                      @click.stop="selectedVariants[item.id] = idx"
                    />
                  </div>
                </div>
                <div class="card-footer">
                  <p class="card-name">{{ item.name }}</p>
                  <p class="card-id">{{ activeVariant(item).id }}</p>
                </div>
              </div>
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
            <button class="head-action-btn">重置</button>
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
              v-for="slot in slots"
              :key="slot.id"
              class="outfit-slot"
              :class="{ equipped: slot.value }"
            >
              <!-- Square icon on the left -->
              <div class="slot-thumb">
                <span class="slot-thumb-icon">{{ slot.icon }}</span>
              </div>
              <!-- Text on the right -->
              <div class="slot-info">
                <span class="slot-label">{{ slot.label }}</span>
                <span class="slot-value">{{ slot.value ?? '—' }}</span>
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
          <div class="panel-head"><span>模型预览区</span></div>
          <div class="preview-empty view-empty">
            <svg class="view-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l9 4.9V17L12 22 3 17V6.9L12 2z"/>
              <path d="M12 22V12M3 7l9 5 9-5"/>
            </svg>
            <p class="view-empty__title">Three.js 预览区</p>
            <p class="view-empty__desc">3D 模型预览功能开发中</p>
          </div>
        </div>

      </div>
    </div>
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

.card-thumb {
  width: 100%;
  height: 100%;
  min-width: 0;
  position: relative;
  overflow: hidden;
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
.asset-tag.missing {
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.35);
  text-decoration: line-through;
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
.preview-empty { flex: 1; }
</style>
