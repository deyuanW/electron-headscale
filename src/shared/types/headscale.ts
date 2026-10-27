/**
 * Headscale REST API 领域模型。
 *
 * 说明：
 * 1. 这里的所有资源都由主进程从服务端原始 JSON「规范化」后得到（见 src/main/api/normalize.ts），
 *    因此渲染进程拿到的字段是稳定的驼峰命名。
 * 2. Headscale 不同版本的 protojson 字段存在 camelCase / snake_case 差异，
 *    同时在 v0.26 前后 Node/Machine 结构也有变化，规范化层统一做了兼容。
 */

export type ThemeMode = 'light' | 'dark' | 'system'

export interface HeadscaleUser {
  id: string
  name: string
  displayName: string
  email: string
  createdAt: string | null
}

/** 节点（可兼容 v0.26 的 Node + Machine 嵌套结构，以及更早的扁平结构） */
export interface NodeResource {
  id: string
  /** 展示名称：优先 givenName（重命名后的名字），其次是主机名 */
  name: string
  /** 节点上报的原始主机名 */
  hostname: string
  ipAddresses: string[]
  online: boolean
  /** RFC3339 时间字符串，null 表示未知/从未在线 */
  lastSeen: string | null
  /** 节点过期时间，null 表示永不过期 */
  expiry: string | null
  createdAt: string | null
  user: HeadscaleUser | null
  /** 操作系统信息（部分版本的服务端不下发该字段） */
  os: string | null
  registerMethod: string | null
  ephemeral: boolean
  /** 已批准（正在服务）的子网路由 */
  approvedRoutes: string[]
  /** 节点通告的全部子网路由 */
  availableRoutes: string[]
  tags: string[]
}

/** 子网路由（GET /api/v1/routes 返回） */
export interface RouteResource {
  id: string
  nodeId: string
  nodeName: string
  prefix: string
  /** 节点是否通告了该网段 */
  advertised: boolean
  /** 是否已批准并正在服务 */
  enabled: boolean
  /** 是否为主路由（Headscale 新版本字段） */
  isPrimary: boolean
}

export interface PreAuthKey {
  id: string
  key: string
  user: HeadscaleUser | null
  reusable: boolean
  ephemeral: boolean
  used: boolean
  createdAt: string | null
  expiration: string | null
}

export type NodeStatusFilter = 'all' | 'online' | 'offline'

export interface NodeListQuery {
  user?: string
  status?: NodeStatusFilter
}

export interface NodeListResult {
  nodes: NodeResource[]
}

export interface RouteListResult {
  routes: RouteResource[]
  /**
   * 服务端是否提供 /api/v1/routes 接口。
   * 老版本 Headscale 没有该接口，此时会从节点数据推导出路由（id 为空），并关闭启用/禁用操作。
   */
  supported: boolean
}

export interface PreAuthKeyListResult {
  keys: PreAuthKey[]
}

export interface ConnectionTestResult {
  serverUrl: string
  version: string | null
  nodeCount: number
  latencyMs: number
}

export interface CreatePreAuthKeyInput {
  /** 用户名（Headscale API 使用 user 名称或 ID，规范化层统一传名称） */
  user: string
  reusable: boolean
  ephemeral: boolean
  /** RFC3339 过期时间；不传则由服务端决定（通常为 1 小时） */
  expiration?: string
}

export interface PreAuthKeyRevokeResult {
  /** deleted = 服务端支持删除；expired = 回退为「置为过期」 */
  mode: 'deleted' | 'expired'
}
