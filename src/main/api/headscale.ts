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

/**
 * Headscale 0.28 起 RenameUser / DeleteUser 的路径参数改为数字 ID，
 * 更早的版本使用用户名。这里优先 ID，失败后再回退到用户名。
 */
function isIdentifierMismatch(error: unknown): boolean {
  if (!(error instanceof HeadscaleApiError)) return false
  if (error.status === 400 || error.status === 404 || error.status === 405) return true
  return /type mismatch|ParseUint|invalid syntax|not found/i.test(error.message)
}

function userIdentifierAttempts(id: string, name: string): string[] {
  return Array.from(
    new Set([id, name].map((value) => value.trim()).filter((value) => value.length > 0))
  )
}

/** 重命名用户：兼容 {old_id}（>=0.28）与 {old_name}（旧版）两种路径语义 */
export async function renameUser(
  id: string,
  name: string,
  newName: string
): Promise<HeadscaleUser | null> {
  const { http } = getClient()
  let lastError: unknown

  for (const identifier of userIdentifierAttempts(id, name)) {
    try {
      const response = await http.post(
        `/user/${encodeURIComponent(identifier)}/rename/${encodeURIComponent(newName)}`
      )
      return normalizeUser(extractResource(response.data, 'user'))
    } catch (error) {
      lastError = error
      if (!isIdentifierMismatch(error)) throw error
    }
  }

  throw lastError instanceof Error ? lastError : new HeadscaleApiError('重命名用户失败')
}

/** 删除用户：同上，优先数字 ID，旧版回退用户名 */
export async function deleteUser(id: string, name: string): Promise<null> {
  const { http } = getClient()
  let lastError: unknown

  for (const identifier of userIdentifierAttempts(id, name)) {
    try {
      await http.delete(`/user/${encodeURIComponent(identifier)}`)
      return null
    } catch (error) {
      lastError = error
      if (!isIdentifierMismatch(error)) throw error
    }
  }

  throw lastError instanceof Error ? lastError : new HeadscaleApiError('删除用户失败')
}

/**
 * 预认证密钥列表。
 * Headscale >= 0.28 的 ListPreAuthKeysRequest 不再接受 user 参数，
 * 因此优先请求全量列表并在本地按用户过滤；旧版若要求 user 参数则回退重试。
 */
export async function listPreAuthKeys(
  user?: string,
  userId?: string
): Promise<PreAuthKeyListResult> {
  const { http } = getClient()
  let response

  try {
    response = await http.get('/preauthkey')
  } catch (error) {
    if (!user || !isIdentifierMismatch(error)) throw error
    response = await http.get('/preauthkey', { params: { user } })
  }

  let keys = extractList(response.data, 'preAuthKeys', 'pre_auth_keys').map(normalizePreAuthKey)

  if (user) {
    keys = keys.filter(
      (key) => key.user?.name === user || (userId ? key.user?.id === userId : false)
    )
  }

  keys.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return { keys }
}

/**
 * 创建预认证密钥。
 * - Headscale >= 0.28：CreatePreAuthKeyRequest.user 是 uint64 用户 ID
 * - Headscale < 0.28：user 是用户名字符串
 * 因此先尝试数字 ID，400 时回退用户名。
 */
export async function createPreAuthKey(input: CreatePreAuthKeyInput): Promise<PreAuthKey | null> {
  const { http } = getClient()

  const basePayload: Record<string, unknown> = {
    reusable: input.reusable,
    ephemeral: input.ephemeral
  }
  if (input.expiration) basePayload.expiration = input.expiration

  const numericUserId = Number(input.userId)
  const attempts: Array<Record<string, unknown>> = []

  if (input.userId && Number.isFinite(numericUserId) && numericUserId > 0) {
    attempts.push({ ...basePayload, user: numericUserId })
  }
  attempts.push({ ...basePayload, user: input.user })

  let lastError: unknown
  for (const payload of attempts) {
    try {
      const response = await http.post('/preauthkey', payload)
      return normalizePreAuthKey(extractResource(response.data, 'preAuthKey'))
    } catch (error) {
      lastError = error
      if (!isIdentifierMismatch(error)) throw error
    }
  }

  throw lastError instanceof Error ? lastError : new HeadscaleApiError('创建预认证密钥失败')
}

/**
 * 撤销（删除）预认证密钥，兼容多个版本：
 * - >= 0.28：DELETE /preauthkey 携带 { id }
 * - 部分旧版：DELETE 携带 { user, key }，或只有 /preauthkey/expire
 * 依次尝试，成功即返回；全部失败时抛出最后一个错误。
 */
export async function revokePreAuthKey(input: {
  id: string
  key: string
  user: string
  userId?: string
}): Promise<PreAuthKeyRevokeResult> {
  const { http } = getClient()

  const numericId = Number(input.id)
  const hasId = input.id.length > 0 && Number.isFinite(numericId) && numericId > 0
  let lastError: unknown

  const deleteAttempts: Array<() => Promise<unknown>> = []
  if (hasId) {
    // Headscale >= 0.28 的 DeletePreAuthKey 没有 body 映射，id 必须放在 query 参数里；
    // 若放在 JSON body 中会被忽略，服务端会删除 id=0 并返回成功（表现为「删除成功但没删掉」）。
    deleteAttempts.push(() => http.delete('/preauthkey', { params: { id: numericId } }))
  }
  if (input.user && input.key) {
    deleteAttempts.push(() =>
      http.delete('/preauthkey', { data: { user: input.user, key: input.key } })
    )
  }

  for (const attempt of deleteAttempts) {
    try {
      await attempt()
      return { mode: 'deleted' }
    } catch (error) {
      lastError = error
      if (!isIdentifierMismatch(error)) throw error
    }
  }

  const expireAttempts: Array<() => Promise<unknown>> = []
  if (hasId) {
    expireAttempts.push(() => http.post('/preauthkey/expire', { id: numericId }))
  }
  if (input.user && input.key) {
    expireAttempts.push(() =>
      http.post('/preauthkey/expire', { user: input.user, key: input.key })
    )
  }

  for (const attempt of expireAttempts) {
    try {
      await attempt()
      return { mode: 'expired' }
    } catch (error) {
      lastError = error
      if (!isIdentifierMismatch(error)) throw error
    }
  }

  throw lastError instanceof Error ? lastError : new HeadscaleApiError('删除预认证密钥失败')
}
