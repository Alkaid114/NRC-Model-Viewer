<script setup>
import { ref, onMounted, watchEffect, defineAsyncComponent } from 'vue'
import { initConfig, config } from './store/config.js'

const CostumeView  = defineAsyncComponent(() => import('./views/CostumeView.vue'))
const NpcView      = defineAsyncComponent(() => import('./views/NpcView.vue'))
const SpriteView   = defineAsyncComponent(() => import('./views/SpriteView.vue'))
const SettingsView = defineAsyncComponent(() => import('./views/SettingsView.vue'))

const activeTab    = ref('costume')
const showSettings = ref(false)

// Add new entries here to extend the tab bar.
const tabs = [
  { id: 'costume', label: '换装' },
  { id: 'npc',     label: 'NPC' },
  { id: 'sprite',  label: '精灵' },
]

function setTab(id) {
  activeTab.value    = id
  showSettings.value = false
}

function toggleSettings() {
  showSettings.value = !showSettings.value
}

onMounted(async () => {
  await initConfig()
})

// Apply theme to <html> element so CSS [data-theme] selectors work globally.
watchEffect(() => {
  document.documentElement.setAttribute('data-theme', config.ui.theme ?? 'dark')
})
</script>

<template>
  <div class="app">
    <!-- ── Tab Bar ───────────────────────────────────────────────── -->
    <header class="tab-bar">
      <div class="app-brand">
        <span class="brand-logo">◈</span>
        <span class="brand-name">NRC Model Viewer</span>
      </div>

      <nav class="tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          role="tab"
          class="tab-btn"
          :class="{ active: activeTab === tab.id && !showSettings }"
          :aria-selected="activeTab === tab.id && !showSettings"
          @click="setTab(tab.id)"
        >
          <!-- Costume icon (sparkle/fashion) -->
          <svg v-if="tab.id === 'costume'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Zm7.652-9.21-.26 1.036a2.25 2.25 0 0 1-1.423 1.423l-1.036.26 1.036.26a2.25 2.25 0 0 1 1.423 1.423l.26 1.036.26-1.036a2.25 2.25 0 0 1 1.423-1.423l1.036-.26-1.036-.26a2.25 2.25 0 0 1-1.423-1.423l-.26-1.036Z"/>
          </svg>
          <!-- NPC icon (person) -->
          <svg v-else-if="tab.id === 'npc'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-6 9a6 6 0 1 1 12 0v1H6v-1Z"/>
            <path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6H4Z"/>
          </svg>
          <!-- Sprite icon (star) -->
          <svg v-else-if="tab.id === 'sprite'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.4 7.3H22l-6.2 4.5 2.4 7.3L12 17.1 5.8 21.1l2.4-7.3L2 9.3h7.6L12 2Z"/>
          </svg>

          <span>{{ tab.label }}</span>
        </button>
      </nav>

      <div class="tab-bar-end">
        <!-- Settings icon (gear) -->
        <button
          class="icon-btn"
          :class="{ active: showSettings }"
          title="设置"
          @click="toggleSettings"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.03c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- ── Content ──────────────────────────────────────────────── -->
    <main class="content">
      <Transition name="fade" mode="out-in">
        <SettingsView v-if="showSettings"  key="settings" />
        <CostumeView  v-else-if="activeTab === 'costume'" key="costume" />
        <NpcView      v-else-if="activeTab === 'npc'"     key="npc" />
        <SpriteView   v-else-if="activeTab === 'sprite'"  key="sprite" />
      </Transition>
    </main>
  </div>
</template>
