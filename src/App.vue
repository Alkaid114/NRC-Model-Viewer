<script setup>
import { ref, computed, onMounted, watchEffect, defineAsyncComponent } from 'vue'
import { initConfig, config } from './store/config.js'
import { platform } from './platform/index.js'

const CostumeView  = defineAsyncComponent(() => import('./views/CostumeView.vue'))
const NpcView      = defineAsyncComponent(() => import('./views/NpcView.vue'))
const SpriteView   = defineAsyncComponent(() => import('./views/SpriteView.vue'))
const SettingsView = defineAsyncComponent(() => import('./views/SettingsView.vue'))

const appVersion   = __APP_VERSION__
const activeTab    = ref('costume')
const showSettings = ref(false)

// Add new entries here to extend the tab bar.
const tabs = [
  { id: 'costume', label: '服装' },
  { id: 'npc',     label: 'NPC' },
  { id: 'sprite',  label: '精灵' },
]

const _viewMap = { costume: CostumeView, npc: NpcView, sprite: SpriteView }
const currentView = computed(() => showSettings.value ? SettingsView : _viewMap[activeTab.value])

function setTab(id) {
  activeTab.value    = id
  showSettings.value = false
}

function toggleSettings() {
  showSettings.value = !showSettings.value
}

const SOCIAL_LINKS = [
  {
    id: 'bilibili',
    label: 'Bilibili · ',
    url: 'https://space.bilibili.com/35970397',
    // Bilibili TV icon
    svg: 'M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L8.12 3.933h7.68l1.867-1.867c.267-.249.573-.373.92-.373.347 0 .662.151.907.373.249.267.373.564.373.92s-.124.645-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.13.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z',
  },
  {
    id: 'github',
    label: 'GitHub · ',
    url: 'https://github.com/SparseShadow2024',
    // GitHub mark icon
    svg: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  },
]

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
        <div class="brand-text">
          <span class="brand-name"></span>
          <span class="brand-meta">v{{ appVersion }} · By </span>
        </div>
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
        <component :is="currentView" />
      </Transition>
    </main>

    <!-- ── Bottom Bar ──────────────────────────────────────────── -->
    <footer class="bottom-bar">
      <div class="bottom-bar-social">
        <button
          v-for="link in SOCIAL_LINKS"
          :key="link.id"
          class="social-btn"
          :title="link.label"
          @click="platform.openExternal(link.url)"
        >
          <svg class="social-icon" viewBox="0 0 24 24" fill="currentColor">
            <path :d="link.svg" />
          </svg>
          <span>{{ link.label }}</span>
        </button>
      </div>
    </footer>
  </div>
</template>
