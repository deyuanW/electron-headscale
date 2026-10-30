import type {
  TailscaleLogEntry,
  TailscaleSettingsInput,
  TailscaleSettingsView,
  TailscaleStatus
} from '@shared/types/tailscale'

/**
 * 内置 Tailscale 核心的控制接口。
 * 实际进程管理、密钥保存都在主进程完成。
 */
export function getTailscaleSettings(): Promise<TailscaleSettingsView> {
  return window.desktop.tailscale.getSettings()
}

export function saveTailscaleSettings(
  payload: TailscaleSettingsInput
): Promise<TailscaleSettingsView> {
  return window.desktop.tailscale.saveSettings(payload)
}

export function getTailscaleStatus(): Promise<TailscaleStatus> {
  return window.desktop.tailscale.status()
}

export function startTailscale(): Promise<TailscaleStatus> {
  return window.desktop.tailscale.start()
}

export function stopTailscale(): Promise<TailscaleStatus> {
  return window.desktop.tailscale.stop()
}

/** 退出登录并清除本机核心状态缓存（清除后需要重新登录） */
export function resetTailscale(): Promise<TailscaleStatus> {
  return window.desktop.tailscale.reset()
}

export function getTailscaleLogs(): Promise<TailscaleLogEntry[]> {
  return window.desktop.tailscale.logs()
}

export function onTailscaleLog(
  listener: (entry: TailscaleLogEntry) => void
): () => void {
  return window.desktop.tailscale.onLog(listener)
}
