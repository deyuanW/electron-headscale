import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types/ipc'
import type {
  ActionName,
  ActionPayload,
  ActionResult,
  DesktopApi,
  DesktopConfig,
  IpcResult,
  SaveConfigPayload
} from '../shared/types/ipc'
import type {
  TailscaleLogEntry,
  TailscaleSettingsInput,
  TailscaleSettingsView,
  TailscaleStatus
} from '../shared/types/tailscale'
import type { AppSettingsInput, AppSettingsView } from '../shared/types/settings'

/**
 * 最小暴露面：
 * - config：读写本地连接配置（API Key 不明文回传）
 * - invoke：按白名单 action 调用主进程中的 Headscale API 封装
 * - tailscale：控制内置核心（认证密钥留在主进程）
 */
const desktopApi: DesktopApi = {
  config: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.configGetAll) as Promise<DesktopConfig>,
    save: (payload: SaveConfigPayload) =>
      ipcRenderer.invoke(IPC_CHANNELS.configSave, payload) as Promise<DesktopConfig>,
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.configClear) as Promise<void>
  },
  invoke: <A extends ActionName>(action: A, payload: ActionPayload<A>) =>
    ipcRenderer.invoke(IPC_CHANNELS.invoke, action, payload) as Promise<
      IpcResult<ActionResult<A>>
    >,
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.appSettingsGet) as Promise<AppSettingsView>,
    save: (payload: AppSettingsInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.appSettingsSave, payload) as Promise<AppSettingsView>
  },
  tailscale: {
    getSettings: () =>
      ipcRenderer.invoke(IPC_CHANNELS.tailscaleGetSettings) as Promise<TailscaleSettingsView>,
    saveSettings: (payload: TailscaleSettingsInput) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.tailscaleSaveSettings,
        payload
      ) as Promise<TailscaleSettingsView>,
    status: () => ipcRenderer.invoke(IPC_CHANNELS.tailscaleStatus) as Promise<TailscaleStatus>,
    start: () => ipcRenderer.invoke(IPC_CHANNELS.tailscaleStart) as Promise<TailscaleStatus>,
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.tailscaleStop) as Promise<TailscaleStatus>,
    reset: () => ipcRenderer.invoke(IPC_CHANNELS.tailscaleReset) as Promise<TailscaleStatus>,
    logs: () => ipcRenderer.invoke(IPC_CHANNELS.tailscaleLogs) as Promise<TailscaleLogEntry[]>,
    onLog: (listener: (entry: TailscaleLogEntry) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, entry: TailscaleLogEntry): void => {
        listener(entry)
      }
      ipcRenderer.on(IPC_CHANNELS.tailscaleLogEvent, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.tailscaleLogEvent, handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('desktop', desktopApi)
