<template>
  <RouterView v-if="ready" />
  <div v-else class="boot-screen">
    <div class="boot-mark">HS</div>
    <p>正在读取本地配置…</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'

const ready = ref(false)
const connection = useConnectionStore()
const ui = useUiStore()

onMounted(async () => {
  ui.initTheme()
  try {
    await connection.loadConfig()
  } finally {
    ready.value = true
  }
  // 配置已加载，后台探测连接状态，避免阻塞首屏
  void connection.refreshStatus()
})
</script>

<style scoped>
.boot-screen {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: var(--hs-bg);
  color: var(--hs-text-secondary);
}

.boot-mark {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #4f7cff, #7c5cff);
  letter-spacing: 0.5px;
}
</style>
