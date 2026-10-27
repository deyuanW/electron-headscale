import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SaveConfigPayload } from '@shared/types/ipc'
import * as connectionApi from '@/api/connection'

/**
 * 连接状态：保存服务器地址 / API Key，并维护全局连接指示（顶部状态栏使用）。
 * 明文 API Key 始终留在主进程，本 store 只知道「是否已配置」。
 */
export const useConnectionStore = defineStore('connection', () => {
  const serverUrl = ref('')
  const hasApiKey = ref(false)
  const connected = ref(false)
  const version = ref<string | null>(null)
  const latencyMs = ref<number | null>(null)
  const loading = ref(false)
  const testing = ref(false)
  const error = ref<string | null>(null)

  const configured = computed(() => Boolean(serverUrl.value && hasApiKey.value))

  async function loadConfig(): Promise<void> {
    const config = await connectionApi.getDesktopConfig()
    serverUrl.value = config.serverUrl
    hasApiKey.value = config.hasApiKey
  }

  /** 静默探测连接状态，失败不弹提示（由页面自行展示 error） */
  async function refreshStatus(): Promise<boolean> {
    if (!configured.value) {
      connected.value = false
      version.value = null
      return false
    }
    return test()
  }

  async function test(override?: { serverUrl?: string; apiKey?: string }): Promise<boolean> {
    testing.value = true
    error.value = null

    try {
      const result = await connectionApi.testConnection(override ?? {})
      serverUrl.value = result.serverUrl
      connected.value = true
      version.value = result.version
      latencyMs.value = result.latencyMs
      return true
    } catch (cause) {
      connected.value = false
      version.value = null
      latencyMs.value = null
      error.value = cause instanceof Error ? cause.message : '连接失败'
      return false
    } finally {
      testing.value = false
    }
  }

  async function save(payload: SaveConfigPayload): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const config = await connectionApi.saveDesktopConfig(payload)
      serverUrl.value = config.serverUrl
      hasApiKey.value = config.hasApiKey
      return await test()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '保存配置失败'
      return false
    } finally {
      loading.value = false
    }
  }

  async function clear(): Promise<void> {
    await connectionApi.clearDesktopConfig()
    serverUrl.value = ''
    hasApiKey.value = false
    connected.value = false
    version.value = null
    latencyMs.value = null
    error.value = null
  }

  return {
    serverUrl,
    hasApiKey,
    connected,
    version,
    latencyMs,
    loading,
    testing,
    error,
    configured,
    loadConfig,
    refreshStatus,
    test,
    save,
    clear
  }
})
