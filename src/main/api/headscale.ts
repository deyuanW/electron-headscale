import { getStoredConfig } from '../config'
import { normalizeServerUrl } from '../utils/url'
import {
  createHeadscaleClient,
  fetchHeadscaleVersion,
  HeadscaleApiError
} from './client'
import {
  extractList,
  extractResource,
  normalizeNode,
  normalizePreAuthKey,
  normalizeRoute,
  normalizeUser
} from './normalize'
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
} from '../../shared/types/headscale'

/** 使用显式传入的凭据（用于「测试连接」），否则回退到本地存储 */
function getClient(override?: { serverUrl?: string; apiKey?: string }) {
  const stored = getStoredConfig()
  const serverUrl = normalizeServerUrl(override?.serverUrl || stored.serverUrl)
  const apiKey = (override?.apiKey ?? '').trim() || stored.apiKey
  return createHeadscaleClient(serverUrl, apiKey)
}

function sortByNumericId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const left = Number(a.id)
    const right = Number(b.id)
    if (Number.isFinite(left) && Number.isFinite(right)) return left - right
    return a.id.localeCompare(b.id)
  })
}

/** 测试连接：拉取一次节点列表（校验 API Key），再尽力读取版本号 */
export async function testConnection(override?: {
  serverUrl?: string
  apiKey?: string
}): Promise<ConnectionTestResult> {
  const { http, serverUrl } = getClient(override)

  const startedAt = Date.now()
  const response = await http.get('/node')
  const nodes = extractList(response.data, 'nodes')
  const latencyMs = Date.now() - startedAt

  const version = await fetchHeadscaleVersion(serverUrl)

  return {
    serverUrl,
    version,
    nodeCount: nodes.length,
    latencyMs
  }
}

/** 节点列表 */
export async function listNodes(query: NodeListQuery = {}): Promise<NodeListResult> {
  const { http } = getClient()

  const params: Record<string, string> = {}
  if (query.user) params.user = query.user

  // TODO(headscale): 状态筛选在不同版本中未必支持服务端过滤，这里统一在客户端过滤
  const response = await http.get('/node', { params })
  let nodes = extractList(response.data, 'nodes').map(normalizeNode)

  if (query.status && query.status !== 'all') {
    nodes = nodes.filter((node) => (query.status === 'online' ? node.online : !node.online))
  }

  return { nodes: sortByNumericId(nodes) }
}

/** 重命名节点（POST /node/{id}/rename/{newName}） */
export async function renameNode(id: string, newName: string): Promise<NodeResource | null> {
  const { http } = getClient()
  const response = await http.post(
    `/node/${encodeURIComponent(id)}/rename/${encodeURIComponent(newName)}`
  )
  const raw = extractResource(response.data, 'node')
  return raw ? normalizeNode(raw) : null
}

/** 删除节点（不可恢复，需要二次确认） */
export async function deleteNode(id: string): Promise<null> {
  const { http } = getClient()
  await http.delete(`/node/${encodeURIComponent(id)}`)
  return null
}

/**
 * 让节点立即过期（POST /node/{id}/expire）。
 *
 * TODO(headscale): 官方 REST API 目前只提供「立即过期」的 ExpireNode 接口，
 * 不支持自定义一个未来的过期时间；若后续版本提供更新节点的接口，可在此扩展。
 */
export async function expireNode(id: string): Promise<NodeResource | null> {
  const { http } = getClient()
  const response = await http.post(`/node/${encodeURIComponent(id)}/expire`)
  const raw = extractResource(response.data, 'node')
  return raw ? normalizeNode(raw) : null
}

/**
 * 批准节点的子网路由（POST /node/{id}/approve_routes）。
 * Headscale 要求传入完整的待批准网段列表，因此调用方需要合并「已批准 + 本次新增」。
 */
export async function approveNodeRoutes(
  id: string,
  routes: string[]
): Promise<NodeResource | null> {
  const { http } = getClient()
  const response = await http.post(`/node/${encodeURIComponent(id)}/approve_routes`, {
    routes
  })
  const raw = extractResource(response.data, 'node')
  return raw ? normalizeNode(raw) : null
}

/** 路由列表；老版本没有 /routes 接口时，用节点数据推导（只读降级） */
export async function listRoutes(): Promise<RouteListResult> {
  const { http } = getClient()

  try {
    const response = await http.get('/routes')
    return {
      routes: sortByNumericId(extractList(response.data, 'routes').map(normalizeRoute)),
      supported: true
    }
  } catch (error) {
    if (error instanceof HeadscaleApiError && (error.status === 404 || error.status === 405)) {
      // 优雅降级：从节点的 availableRoutes 推导路由列表
      const { nodes } = await listNodes()
      const routes = nodes.flatMap((node) =>
        node.availableRoutes.map((prefix) => ({
          id: '',
          nodeId: node.id,
          nodeName: node.name,
          prefix,
          advertised: true,
          enabled: node.approvedRoutes.includes(prefix),
          isPrimary: false
        }))
      )
      return { routes, supported: false }
    }
    throw error
  }
}

/**
 * 启用/禁用路由（POST /routes/{id}/enable | /disable）。
 * 部分文档写作单数 /route/{id}/enable，这里做了 404/405 的兼容回退。
 */
async function changeRouteState(id: string, action: 'enable' | 'disable'): Promise<null> {
  const { http } = getClient()
  const encodedId = encodeURIComponent(id)

  try {
    await http.post(`/routes/${encodedId}/${action}`)
  } catch (error) {
    if (error instanceof HeadscaleApiError && (error.status === 404 || error.status === 405)) {
      // TODO(headscale): 兼容旧版/单数形式的路径，若目标版本无此接口会在二次请求后报错
      await http.post(`/route/${encodedId}/${action}`)
      return null
    }
    throw error
  }

  return null
}

export function enableRoute(id: string): Promise<null> {
  return changeRouteState(id, 'enable')
}

export function disableRoute(id: string): Promise<null> {
  return changeRouteState(id, 'disable')
}

/** 用户列表 */
export async function listUsers(): Promise<{ users: HeadscaleUser[] }> {
  const { http } = getClient()
  const response = await http.get('/user')
  const users = extractList(response.data, 'users')
    .map(normalizeUser)
    .filter((user): user is HeadscaleUser => user !== null)
  return { users: sortByNumericId(users) }
}

export async function createUser(name: string): Promise<HeadscaleUser | null> {
  const { http } = getClient()
  const response = await http.post('/user', { name })
  return normalizeUser(extractResource(response.data, 'user'))
}

/** 重命名用户：路径使用「旧用户名」，而不是数字 ID */
export async function renameUser(name: string, newName: string): Promise<HeadscaleUser | null> {
  const { http } = getClient()
  const response = await http.post(
    `/user/${encodeURIComponent(name)}/rename/${encodeURIComponent(newName)}`
  )
  return normalizeUser(extractResource(response.data, 'user'))
}

export async function deleteUser(name: string): Promise<null> {
  const { http } = getClient()
  await http.delete(`/user/${encodeURIComponent(name)}`)
  return null
}

/** 预认证密钥列表；user 为可选的用户名过滤条件 */
export async function listPreAuthKeys(user?: string): Promise<PreAuthKeyListResult> {
  const { http } = getClient()
  const params: Record<string, string> = {}
  if (user) params.user = user

  const response = await http.get('/preauthkey', { params })
  const keys = extractList(response.data, 'preAuthKeys', 'pre_auth_keys').map(normalizePreAuthKey)

  keys.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return { keys }
}

/**
 * 创建预认证密钥。
 *
 * TODO(headscale): CreatePreAuthKeyRequest.user 在部分版本中是用户名，老版本中是用户 ID；
 * 这里优先传用户名（v0.23+ 的常见行为），如果服务端要求 ID，可在 UI 层改为传 user.id。
 */
export async function createPreAuthKey(input: CreatePreAuthKeyInput): Promise<PreAuthKey | null> {
  const { http } = getClient()

  const payload: Record<string, unknown> = {
    user: input.user,
    reusable: input.reusable,
    ephemeral: input.ephemeral
  }
  if (input.expiration) payload.expiration = input.expiration

  const response = await http.post('/preauthkey', payload)
  return normalizePreAuthKey(extractResource(response.data, 'preAuthKey'))
}

/**
 * 撤销（删除）预认证密钥。
 *
 * 官方稳定版 API 只提供 /preauthkey/expire，没有删除接口。
 * 因此先尝试 DELETE（新版本可能支持），404/405 时回退为「置为过期」，
 * 并在返回值中告知 UI 实际执行的是哪种语义。
 */
export async function revokePreAuthKey(user: string, key: string): Promise<PreAuthKeyRevokeResult> {
  const { http } = getClient()

  try {
    await http.delete('/preauthkey', { data: { user, key } })
    return { mode: 'deleted' }
  } catch (error) {
    if (error instanceof HeadscaleApiError && (error.status === 404 || error.status === 405)) {
      await http.post('/preauthkey/expire', { user, key })
      return { mode: 'expired' }
    }
    throw error
  }
}
