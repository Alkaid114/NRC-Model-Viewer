<script setup>
import { ref } from 'vue'
import { config, hiddenConfig } from '../store/config.js'
import { platform } from '../platform/index.js'

// ── Hidden section trigger ────────────────────────────────────────────────────
const showHidden = ref(false)
let clickCount = 0
let clickTimer  = null

function handleTitleClick() {
  clickCount++
  clearTimeout(clickTimer)
  if (clickCount >= 3) {
    showHidden.value = !showHidden.value
    clickCount = 0
  } else {
    clickTimer = setTimeout(() => { clickCount = 0 }, 1500)
  }
}

// ── Directory picker ──────────────────────────────────────────────────────────
async function browse(dotPath) {
  const selected = await platform.openDirectory()
  if (!selected) return
  // Resolve nested key path like 'paths.configFiles'
  const keys = dotPath.split('.')
  let target = config
  for (let i = 0; i < keys.length - 1; i++) target = target[keys[i]]
  target[keys.at(-1)] = selected
}
</script>

<template>
  <div class="view settings-view">
    <div class="settings-scroll">
      <div class="settings-container">

        <h1 class="settings-title" @click="handleTitleClick">设置</h1>

        <!-- ── 界面设置 ─────────────────────────────────────── -->
        <section class="settings-section">
          <h2 class="section-title">界面</h2>
          <div class="settings-group">

            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">配色主题</span>
              </div>
              <div class="radio-group radio-group--h">
                <label class="radio-option" :class="{ 'radio-option--checked': config.ui.theme === 'dark' }">
                  <input type="radio" v-model="config.ui.theme" value="dark" />
                  <span class="radio-dot"></span>
                  <span class="radio-label">深色</span>
                </label>
                <label class="radio-option" :class="{ 'radio-option--checked': config.ui.theme === 'light' }">
                  <input type="radio" v-model="config.ui.theme" value="light" />
                  <span class="radio-dot"></span>
                  <span class="radio-label">浅色</span>
                </label>
              </div>
            </div>

          </div>
        </section>

        <!-- ── 配置设置 ─────────────────────────────────────── -->
        <section class="settings-section">
          <h2 class="section-title">配置设置</h2>
          <div class="settings-group">

            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">游戏配置文件根目录</span>
                <span class="label-hint">包含 JSON 配置文件的 NRC 根文件夹</span>
              </div>
              <div class="path-row">
                <input
                  v-model="config.paths.configFiles"
                  type="text"
                  placeholder="例：D:\Resources\...\NRC"
                  class="path-input"
                  spellcheck="false"
                />
                <button class="browse-btn" @click="browse('paths.configFiles')">浏览…</button>
              </div>
            </div>

          </div>
        </section>

        <!-- ── UI 资源设置 ──────────────────────────────────── -->
        <section class="settings-section">
          <h2 class="section-title">UI 资源设置</h2>
          <div class="settings-group">

            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">UI 资源根目录</span>
                <span class="label-hint">包含图标、缩略图等平面资产的 NRC 根文件夹</span>
              </div>
              <div class="path-row">
                <input
                  v-model="config.paths.uiAssets"
                  type="text"
                  placeholder="例：D:\Resources\...\NRC"
                  class="path-input"
                  spellcheck="false"
                />
                <button class="browse-btn" @click="browse('paths.uiAssets')">浏览…</button>
              </div>
            </div>

          </div>
        </section>

        <!-- ── 模型设置 ─────────────────────────────────────── -->
        <section class="settings-section">
          <h2 class="section-title">模型设置</h2>
          <div class="settings-group">

            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">模型根目录</span>
                <span class="label-hint">包含 3D 模型文件的 NRC 根文件夹</span>
              </div>
              <div class="path-row">
                <input
                  v-model="config.paths.models"
                  type="text"
                  placeholder="例：D:\Resources\...\NRC"
                  class="path-input"
                  spellcheck="false"
                />
                <button class="browse-btn" @click="browse('paths.models')">浏览…</button>
              </div>
            </div>

          </div>
        </section>

        <!-- ── 隐藏设置（三击触发）──────────────────────────── -->
        <Transition name="hidden-reveal">
          <section v-if="showHidden" class="settings-section settings-section--hidden">
            <h2 class="section-title section-title--hidden">
              隐藏设置
              <span class="dev-badge">DEV</span>
            </h2>
            <div class="settings-group">

              <div class="setting-item setting-item--row">
                <div class="setting-label">
                  <span class="label-text">开发者模式</span>
                  <span class="label-hint">显示调试信息面板</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" v-model="hiddenConfig.devMode" />
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </label>
              </div>

              <div class="setting-item setting-item--row">
                <div class="setting-label">
                  <span class="label-text">显示资产类型标签</span>
                  <span class="label-hint">在卡片缩略图上显示 Model / Tex / Mat 标签</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" v-model="hiddenConfig.showAssetTags" />
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </label>
              </div>

              <div class="setting-item setting-item--row">
                <div class="setting-label">
                  <span class="label-text">隐藏缺失资产标签</span>
                  <span class="label-hint">关闭时缺失资产显示删除线，开启时直接隐藏</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" v-model="hiddenConfig.hideMissingAssets" />
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </label>
              </div>

              <div class="setting-item setting-item--row">
                <div class="setting-label">
                  <span class="label-text">贴图缩略图兜底</span>
                  <span class="label-hint">无配置图标时，尝试用 D 贴图作为卡片缩略图</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" v-model="hiddenConfig.texFallback" />
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </label>
              </div>

              <div class="setting-item setting-item--row">
                <div class="setting-label">
                  <span class="label-text">显示未识别物品</span>
                  <span class="label-hint">显示在配置文件中没有对应记录的物品（名称显示为 ID 数字）</span>
                </div>
                <label class="toggle">
                  <input type="checkbox" v-model="hiddenConfig.showUnconfedItems" />
                  <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                  </span>
                </label>
              </div>

            </div>
          </section>
        </Transition>

      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  background: var(--bg-base);
}

.settings-scroll {
  overflow-y: auto;
  height: 100%;
}

.settings-container {
  max-width: 760px;
  margin: 0 auto;
  padding: 36px 28px 60px;
}

/* ── Title ──────────────────────────────────────────────────── */
.settings-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 32px;
  cursor: default;
  user-select: none;
  display: inline-block;
}

/* ── Sections ───────────────────────────────────────────────── */
.settings-section {
  margin-bottom: 36px;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title--hidden {
  color: var(--accent);
  border-bottom-color: var(--accent-border);
}

.dev-badge {
  font-size: 10px;
  background: var(--accent-muted);
  color: var(--accent);
  border: 1px solid var(--accent-border);
  padding: 0 6px;
  border-radius: 10px;
  letter-spacing: 0.05em;
}

/* ── Settings Group & Items ─────────────────────────────────── */
.settings-group {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-item--row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.label-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.label-hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* ── Path Input Row ─────────────────────────────────────────── */
.path-row {
  display: flex;
  gap: 8px;
}

.path-input {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.01em;
}

.browse-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  background: var(--bg-active);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
  transition: background var(--t), color var(--t), border-color var(--t);
}

.browse-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--text-muted);
}

/* ── Radio Group ────────────────────────────────────────────── */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-group--h {
  flex-direction: row;
}

.radio-group--h .radio-option {
  flex: 1;
  justify-content: center;
}

.radio-group--h .radio-hint {
  display: none;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  cursor: pointer;
  transition: border-color var(--t), background var(--t);
}

.radio-option:hover {
  border-color: var(--border);
  background: var(--bg-hover);
}

.radio-option--checked {
  border-color: var(--accent-border);
  background: var(--accent-muted);
}

.radio-option input[type="radio"] {
  display: none;
  width: auto;
  padding: 0;
}

.radio-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--border);
  flex-shrink: 0;
  transition: border-color var(--t), background var(--t);
  position: relative;
}

.radio-option--checked .radio-dot {
  border-color: var(--accent);
  background: var(--accent);
}

.radio-option--checked .radio-dot::after {
  content: '';
  position: absolute;
  inset: 2px;
  background: var(--bg-base);
  border-radius: 50%;
}

.radio-label {
  font-weight: 500;
  font-size: 14px;
  color: var(--text-primary);
}

.radio-hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-secondary);
}

/* ── Toggle ─────────────────────────────────────────────────── */
.toggle {
  cursor: pointer;
  flex-shrink: 0;
}

.toggle input[type="checkbox"] {
  display: none;
  width: auto;
  padding: 0;
}

.toggle-track {
  display: block;
  width: 38px;
  height: 22px;
  background: var(--bg-active);
  border: 1px solid var(--border);
  border-radius: 11px;
  position: relative;
  transition: background var(--t), border-color var(--t);
}

.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  background: var(--text-muted);
  border-radius: 50%;
  transition: transform var(--t), background var(--t);
}

.toggle input:checked + .toggle-track {
  background: var(--accent-muted);
  border-color: var(--accent-border);
}

.toggle input:checked + .toggle-track .toggle-thumb {
  transform: translateX(16px);
  background: var(--accent);
}

/* ── Hidden section ─────────────────────────────────────────── */
.settings-section--hidden {
  background: rgba(124, 106, 247, 0.04);
  border: 1px solid var(--accent-border);
  border-radius: var(--r-lg);
  padding: 16px 20px;
}

.hidden-reveal-enter-active,
.hidden-reveal-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.hidden-reveal-enter-from,
.hidden-reveal-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
