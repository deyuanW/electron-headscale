import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type AppSettingsView
} from '@shared/types/settings'
import * as settingsApi from '@/api/settings'

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+':\s*/, '')
  }
  return String(error)
}

/** 应用级运行设置：与 Headscale 连接配置、Tailscale 核心配置相互独立 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettingsView>({
    ...DEFAULT_APP_SETTINGS,
    launchAtLoginSupported: true,
    trayActive: false
  })
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      settings.value = await settingsApi.getAppSettings()
    } catch (cause) {
      error.value = messageOf(cause)
    } finally {
      loading.value = false
    }
  }

  async function update(partial: Partial<AppSettings>): Promise<boolean> {
    const next: AppSettings = {
      launchAtLogin: partial.launchAtLogin ?? settings.value.launchAtLogin,
      runInBackground: partial.runInBackground ?? settings.value.runInBackground,
      closeAction: partial.closeAction ?? settings.value.closeAction
    }

    saving.value = true
    error.value = null
    try {
      settings.value = await settingsApi.saveAppSettings(next)
      return true
    } catch (cause) {
      error.value = messageOf(cause)
      return false
    } finally {
      saving.value = false
    }
  }

  return { settings, loading, saving, error, load, update }
})
