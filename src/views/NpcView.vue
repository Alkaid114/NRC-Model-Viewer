<script setup>
import { computed } from 'vue'
import { config } from '../store/config.js'

const isConfigured = computed(() => Boolean(config.paths.configFiles && config.paths.models))
</script>

<template>
  <div class="view">
    <div v-if="!isConfigured" class="view-empty">
      <svg class="view-empty__icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 20c0-3.314 3.582-6 8-6s8 2.686 8 6H4Z"/>
      </svg>
      <p class="view-empty__title">NPC 模型预览</p>
      <p class="view-empty__desc">请先在设置中配置资产路径</p>
    </div>

    <div v-else class="view-empty">
      <svg class="view-empty__icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 20c0-3.314 3.582-6 8-6s8 2.686 8 6H4Z"/>
      </svg>
      <p class="view-empty__title">NPC 模型预览</p>
      <p class="view-empty__desc">功能开发中</p>
    </div>
  </div>
</template>
