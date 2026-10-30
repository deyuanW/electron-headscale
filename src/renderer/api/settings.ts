import type { AppSettingsInput, AppSettingsView } from '@shared/types/settings'

/**
 * 桌面客户端自身的运行设置（开机自启、后台运行、关闭行为）。
 * 实际生效逻辑全部在主进程。
 */
export function getAppSettings(): Promise<AppSettingsView> {
  return window.desktop.settings.get()
}

export function saveAppSettings(payload: AppSettingsInput): Promise<AppSettingsView> {
  return window.desktop.settings.save(payload)
}
