import type {
  ConnectionTestResult,
  CreatePreAuthKeyInput,
  HeadscaleUser,
  NodeListQuery,
  NodeListResult,
  NodeResource,
  PreAuthKey,
  PreAuthKeyListResult,
  PreAuthKeyRevokeResult,
  RouteListResult
} from './headscale'

/** IPC 通道名集中定义，避免主进程与 preload 出现字符串漂移 */
export const IPC_CHANNELS = {
  configGetAll: 'config:get-all',
  configSave: 'config:save',
  configClear: 'config:clear',
  invoke: 'headscale:invoke'
} as const

export interface DesktopConfig {
  serverUrl: string
  /** 出于安全考虑，渲染进程永远不会拿到明文 API Key，只知道是否已保存 */
  hasApiKey: boolean
}

export interface SaveConfigPayload {
  serverUrl: string
  /** 不传或为空字符串表示「保持已保存的 Key 不变」 */
  apiKey?: string
}

export interface ApiErrorInfo {
  message: string
  status?: number
  code?: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorInfo }

/**
 * 渲染进程 -> 主进程 的操作注册表。
 * 所有网络请求都在主进程执行（规避浏览器 CORS，避免 API Key 暴露给渲染进程），
 * 这里仅约束 IPC 契约的类型。
 */
export interface ActionRegistry {
  'connection.test': {
    payload: { serverUrl?: string; apiKey?: string }
    result: ConnectionTestResult
  }
  'node.list': {
    payload: NodeListQuery
    result: NodeListResult
  }
  'node.rename': {
    payload: { id: string; newName: string }
    result: NodeResource | null
  }
  'node.delete': {
    payload: { id: string }
    result: null
  }
  'node.expire': {
    payload: { id: string }
    result: NodeResource | null
  }
  'node.approveRoutes': {
    payload: { id: string; routes: string[] }
    result: NodeResource | null
  }
  'route.list': {
    payload: Record<string, never>
    result: RouteListResult
  }
  'route.enable': {
    payload: { id: string }
    result: null
  }
  'route.disable': {
    payload: { id: string }
    result: null
  }
  'user.list': {
    payload: Record<string, never>
    result: { users: HeadscaleUser[] }
  }
  'user.create': {
    payload: { name: string }
    result: HeadscaleUser | null
  }
  'user.rename': {
    payload: { id: string; name: string; newName: string }
    result: HeadscaleUser | null
  }
  'user.delete': {
    payload: { id: string; name: string }
    result: null
  }
  'preauthkey.list': {
    payload: { user?: string; userId?: string }
    result: PreAuthKeyListResult
  }
  'preauthkey.create': {
    payload: CreatePreAuthKeyInput
    result: PreAuthKey | null
  }
  'preauthkey.revoke': {
    payload: { id: string; key: string; user: string; userId?: string }
    result: PreAuthKeyRevokeResult
  }
}

export type ActionName = keyof ActionRegistry
export type ActionPayload<A extends ActionName> = ActionRegistry[A]['payload']
export type ActionResult<A extends ActionName> = ActionRegistry[A]['result']

/** preload 通过 contextBridge 暴露给渲染进程的最小 API */
export interface DesktopApi {
  config: {
    getAll: () => Promise<DesktopConfig>
    save: (payload: SaveConfigPayload) => Promise<DesktopConfig>
    clear: () => Promise<void>
  }
  invoke: <A extends ActionName>(
    action: A,
    payload: ActionPayload<A>
  ) => Promise<IpcResult<ActionResult<A>>>
}
