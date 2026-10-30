import { app } from 'electron'
import Store from 'electron-store'
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type AppSettingsInput,
  type AppSettingsView,
  type CloseAction
} from '../shared/types/settings'

const store = new Store<AppSettings>({
  name: 'desktop-settings',
  defaults: DEFAULT_APP_SETTINGS
})

let runtimeListener: ((settings: AppSettings) => void) | null = null
let trayActive = false

function normalizeCloseAction(value: unknown): CloseAction {
  return value === 'quit' ? 'quit' : 'tray'
}

export function getAppSettings(): AppSettings {
  return {
    launchAtLogin: Boolean(store.get('launchAtLogin', false)),
    runInBackground: Boolean(store.get('runInBackground', false)),
    closeAction: normalizeCloseAction(store.get('closeAction'))
  }
}

export function getAppSettingsView(): AppSettingsView {
  const settings = getAppSettings()
  return {
    ...settings,
    launchAtLoginSupported: process.platform !== 'linux',
    trayActive
  }
}

/** index.ts 注册：设置变化后同步托盘等运行时状态 */
export function setAppSettingsRuntimeListener(
  listener: (settings: AppSettings) => void
): void {
  runtimeListener = listener
}

export function setTrayActive(active: boolean): void {
  trayActive = active
}

export function applyLaunchAtLogin(enabled: boolean): void {
  if (process.platform === 'linux') return
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
  } catch {
    // 某些系统（如未签名的 macOS 构建）可能拒绝写入登录项，忽略即可
  }
}

export function saveAppSettings(input: AppSettingsInput): AppSettingsView {
  const settings: AppSettings = {
    launchAtLogin: Boolean(input.launchAtLogin),
    runInBackground: Boolean(input.runInBackground),
    closeAction: normalizeCloseAction(input.closeAction)
  }

  store.set(settings)
  applyLaunchAtLogin(settings.launchAtLogin)
  runtimeListener?.(settings)

  return getAppSettingsView()
}
