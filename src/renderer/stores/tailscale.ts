import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  TailscaleLogEntry,
  TailscaleSettingsInput,
  TailscaleSettingsView,
  TailscaleStatus
} from '@shared/types/tailscale'
import {
  DEFAULT_TAILSCALE_SETTINGS,
  emptyTailscaleStatus
} from '@shared/types/tailscale'
import * as tailscaleApi from '@/api/tailscale'

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    // Electron IPC 抛错时会带 "Error invoking remote method ...:" 前缀
    return error.message.replace(/^Error invoking remote method '[^']+':\s*/, '')
  }
  return String(error)
}

/**
 * 内置 Tailscale 核心状态。
 * 认证密钥永远不进入这个 store，只维护 hasAuthKey 标记。
 */
export const useTailscaleStore = defineStore('tailscale', () => {
  const settings = ref<TailscaleSettingsView>({
    ...DEFAULT_TAILSCALE_SETTINGS,
    hasAuthKey: false
  })
  const status = ref<TailscaleStatus>(emptyTailscaleStatus())
  const logs = ref<TailscaleLogEntry[]>([])
  const loading = ref(false)
  const action = ref<'save' | 'start' | 'stop' | 'reset' | null>(null)
  const error = ref<string | null>(null)

  let initialized = false
  let unsubscribeLog: (() => void) | null = null

  const running = computed(() => status.value.running)
  const connected = computed(() => status.value.loggedIn && status.value.online)
  const available = computed(() => status.value.available)

  const stateLabel = computed(() => {
    if (!status.value.available) return '核心缺失'
    if (action.value === 'start') return '启动中'
    if (action.value === 'stop') return '停止中'
    if (action.value === 'reset') return '清理中'
    if (!status.value.running) return '未启动'
    if (status.value.loggedIn) return '已连接'
    if (status.value.loginUrl) return '待登录'
    return '已启动'
  })

  async function initialize(): Promise<void> {
    if (initialized) {
      await refresh()
      return
    }
    initialized = true
    loading.value = true
    error.value = null

    try {
      const [nextSettings, nextStatus, nextLogs] = await Promise.all([
        tailscaleApi.getTailscaleSettings(),
        tailscaleApi.getTailscaleStatus(),
        tailscaleApi.getTailscaleLogs()
      ])
      settings.value = nextSettings
      status.value = nextStatus
      logs.value = nextLogs
      error.value = nextStatus.error

      unsubscribeLog = tailscaleApi.onTailscaleLog((entry) => {
        logs.value.push(entry)
        if (logs.value.length > 500) logs.value.splice(0, logs.value.length - 500)
      })
    } catch (cause) {
      error.value = messageOf(cause)
    } finally {
      loading.value = false
    }
  }

  async function refresh(): Promise<void> {
    try {
      status.value = await tailscaleApi.getTailscaleStatus()
      error.value = status.value.error
    } catch (cause) {
      error.value = messageOf(cause)
    }
  }

  async function save(input: TailscaleSettingsInput): Promise<boolean> {
    action.value = 'save'
    error.value = null
    try {
      settings.value = await tailscaleApi.saveTailscaleSettings(input)
      await refresh()
      return true
    } catch (cause) {
      error.value = messageOf(cause)
      return false
    } finally {
      action.value = null
    }
  }

  async function start(): Promise<TailscaleStatus> {
    action.value = 'start'
    error.value = null
    try {
      status.value = await tailscaleApi.startTailscale()
      error.value = status.value.error
    } catch (cause) {
      error.value = messageOf(cause)
    } finally {
      action.value = null
    }
    return status.value
  }

  async function stop(): Promise<TailscaleStatus> {
    action.value = 'stop'
    error.value = null
    try {
      status.value = await tailscaleApi.stopTailscale()
      error.value = status.value.error
    } catch (cause) {
      error.value = messageOf(cause)
    } finally {
      action.value = null
    }
    return status.value
  }

  function clearLogs(): void {
    logs.value = []
  }

  /** 退出登录 + 清除本地状态缓存 */
  async function reset(): Promise<TailscaleStatus> {
    action.value = 'reset'
    error.value = null
    try {
      status.value = await tailscaleApi.resetTailscale()
      logs.value = await tailscaleApi.getTailscaleLogs()
      error.value = status.value.error
    } catch (cause) {
      error.value = messageOf(cause)
    } finally {
      action.value = null
    }
    return status.value
  }

  function dispose(): void {
    unsubscribeLog?.()
    unsubscribeLog = null
    initialized = false
  }

  return {
    settings,
    status,
    logs,
    loading,
    action,
    error,
    running,
    connected,
    available,
    stateLabel,
    initialize,
    refresh,
    save,
    start,
    stop,
    reset,
    clearLogs,
    dispose
  }
})
