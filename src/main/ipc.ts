import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/types/ipc'
import type {
  ActionName,
  ApiErrorInfo,
  DesktopConfig,
  IpcResult,
  SaveConfigPayload
} from '../shared/types/ipc'
import type {
  TailscaleSettingsInput,
  TailscaleSettingsView,
  TailscaleStatus
} from '../shared/types/tailscale'
import type { AppSettingsInput, AppSettingsView } from '../shared/types/settings'
import { clearStoredConfig, getStoredConfig, saveStoredConfig } from './config'
import { HeadscaleApiError } from './api/client'
import * as headscale from './api/headscale'
import { tailscaleManager } from './tailscale/manager'
import { getTailscaleSettingsView, saveTailscaleSettings } from './tailscale/settings'
import { getAppSettingsView, saveAppSettings } from './settings'

function toDesktopConfig(): DesktopConfig {
  const { serverUrl, apiKey } = getStoredConfig()
  return {
    serverUrl,
    hasApiKey: Boolean(apiKey)
  }
}

function serializeError(error: unknown): ApiErrorInfo {
  if (error instanceof HeadscaleApiError) {
    return {
      message: error.message,
      status: error.status,
      code: error.code
    }
  }
  if (error instanceof Error) {
    return { message: error.message }
  }
  return { message: '发生未知错误' }
}

/** 所有业务操作统一在这里分发，主进程是唯一发起 HTTP 请求的地方 */
async function dispatch(action: ActionName, payload: any): Promise<unknown> {
  switch (action) {
    case 'connection.test':
      return headscale.testConnection(payload ?? {})
    case 'node.list':
      return headscale.listNodes(payload ?? {})
    case 'node.rename':
      return headscale.renameNode(payload.id, payload.newName)
    case 'node.delete':
      return headscale.deleteNode(payload.id)
    case 'node.expire':
      return headscale.expireNode(payload.id)
    case 'node.approveRoutes':
      return headscale.approveNodeRoutes(payload.id, payload.routes)
    case 'route.list':
      return headscale.listRoutes()
    case 'route.enable':
      return headscale.enableRoute(payload.id)
    case 'route.disable':
      return headscale.disableRoute(payload.id)
    case 'user.list':
      return headscale.listUsers()
    case 'user.create':
      return headscale.createUser(payload.name)
    case 'user.rename':
      return headscale.renameUser(payload.id, payload.name, payload.newName)
    case 'user.delete':
      return headscale.deleteUser(payload.id, payload.name)
    case 'preauthkey.list':
      return headscale.listPreAuthKeys(payload.user, payload.userId)
    case 'preauthkey.create':
      return headscale.createPreAuthKey(payload)
    case 'preauthkey.revoke':
      return headscale.revokePreAuthKey(payload)
    case 'policy.get':
      return headscale.getPolicy()
    case 'policy.set':
      return headscale.setPolicy(payload.policy)
    default: {
      const unknownAction: never = action
      throw new Error(`不支持的操作：${String(unknownAction)}`)
    }
  }
}

export function registerIpcHandlers(): void {
  // 核心日志广播到所有窗口；页面离开后由渲染进程自行忽略
  tailscaleManager.setLogSink((entry) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.tailscaleLogEvent, entry)
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.configGetAll, (): DesktopConfig => toDesktopConfig())

  ipcMain.handle(
    IPC_CHANNELS.configSave,
    (_event, payload: SaveConfigPayload): DesktopConfig => {
      saveStoredConfig(payload)
      return toDesktopConfig()
    }
  )

  ipcMain.handle(IPC_CHANNELS.configClear, (): void => {
    clearStoredConfig()
  })

  ipcMain.handle(
    IPC_CHANNELS.appSettingsGet,
    (): AppSettingsView => getAppSettingsView()
  )

  ipcMain.handle(
    IPC_CHANNELS.appSettingsSave,
    (_event, payload: AppSettingsInput): AppSettingsView => saveAppSettings(payload)
  )

  ipcMain.handle(
    IPC_CHANNELS.invoke,
    async (_event, action: ActionName, payload: unknown): Promise<IpcResult<unknown>> => {
      try {
        const data = await dispatch(action, payload)
        return { ok: true, data }
      } catch (error) {
        return { ok: false, error: serializeError(error) }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.tailscaleGetSettings,
    (): TailscaleSettingsView => getTailscaleSettingsView()
  )

  ipcMain.handle(
    IPC_CHANNELS.tailscaleSaveSettings,
    (_event, payload: TailscaleSettingsInput): TailscaleSettingsView =>
      saveTailscaleSettings(payload)
  )

  ipcMain.handle(
    IPC_CHANNELS.tailscaleStatus,
    (): Promise<TailscaleStatus> => tailscaleManager.getStatus()
  )

  ipcMain.handle(
    IPC_CHANNELS.tailscaleStart,
    (): Promise<TailscaleStatus> => tailscaleManager.start()
  )

  ipcMain.handle(
    IPC_CHANNELS.tailscaleStop,
    (): Promise<TailscaleStatus> => tailscaleManager.stop()
  )

  ipcMain.handle(
    IPC_CHANNELS.tailscaleReset,
    (): Promise<TailscaleStatus> => tailscaleManager.resetIdentity()
  )

  ipcMain.handle(IPC_CHANNELS.tailscaleLogs, () => tailscaleManager.getLogs())
}
