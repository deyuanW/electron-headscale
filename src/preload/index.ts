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

/**
 * 最小暴露面：
 * - config：读写本地连接配置（API Key 不明文回传）
 * - invoke：按白名单 action 调用主进程中的 Headscale API 封装
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
    >
}

contextBridge.exposeInMainWorld('desktop', desktopApi)
