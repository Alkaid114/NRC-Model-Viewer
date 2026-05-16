<script setup>
import { computed } from 'vue'
import { config } from '../store/config.js'

const isConfigured = computed(() => Boolean(config.paths.configFiles && config.paths.models))
</script>

<template>
  <div class="view">
    <div v-if="!isConfigured" class="view-empty">
      <svg class="view-empty__icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.3H22l-6.2 4.5 2.4 7.3L12 17.1 5.8 21.1l2.4-7.3L2 9.3h7.6L12 2Z"/>
      </svg>
      <p class="view-empty__title">精灵模型预览</p>
      <p class="view-empty__desc">请先在设置中配置资产路径</p>
    </div>

    <div v-else class="view-empty">
      <svg class="view-empty__icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.3H22l-6.2 4.5 2.4 7.3L12 17.1 5.8 21.1l2.4-7.3L2 9.3h7.6L12 2Z"/>
      </svg>
      <p class="view-empty__title">精灵模型预览</p>
      <p class="view-empty__desc">功能开发中</p>
    </div>
  </div>
</template>
