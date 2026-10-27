import type {
  HeadscaleUser,
  NodeResource,
  PreAuthKey,
  RouteResource
} from '../../shared/types/headscale'

/**
 * Headscale 的 grpc-gateway 输出在不同版本间存在差异：
 * - 字段可能是 camelCase（protojson 默认）或 snake_case
 * - v0.26 之前 Node 内嵌 machine，之后逐步扁平化
 * 这里统一转换为渲染进程使用的稳定结构，避免视图层处理兼容逻辑。
 */

type Raw = Record<string, any>

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pick(sources: Array<Raw | undefined>, ...keys: string[]): unknown {
  for (const source of sources) {
    if (!source) continue
    for (const key of keys) {
      const value = source[key]
      if (value !== undefined && value !== null) return value
    }
  }
  return undefined
}

function asString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

/** 0001-01-01 / 1970-01-01 在 protojson 中通常代表「未设置」 */
function asTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  if (value.startsWith('0001-01-01') || value.startsWith('1970-01-01')) return null
  return value
}

function toStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : asString(item)))
      .filter((item) => item.length > 0)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

export function normalizeUser(input: unknown): HeadscaleUser | null {
  if (!isRecord(input)) return null

  return {
    id: asString(pick([input], 'id')),
    name: asString(pick([input], 'name', 'username')),
    displayName: asString(pick([input], 'displayName', 'display_name')),
    email: asString(pick([input], 'email')),
    createdAt: asTimestamp(pick([input], 'createdAt', 'created_at'))
  }
}

export function normalizeNode(input: unknown): NodeResource {
  const raw: Raw = isRecord(input) ? input : {}
  const machine = isRecord(raw.machine) ? raw.machine : undefined
  const sources = [raw, machine]

  const id = asString(pick(sources, 'id'))
  const machineName = asString(pick([machine], 'name'))
  const hostname = machineName || asString(pick([raw], 'hostname', 'name')) || `node-${id}`
  const givenName = asString(pick(sources, 'givenName', 'given_name'))
  const name = givenName || hostname

  const hostInfo = pick(sources, 'hostInfo', 'host_info')
  const osFromHostInfo = isRecord(hostInfo) ? asString(pick([hostInfo], 'os', 'OS')) : ''

  const approvedRoutes = toStringArray(pick(sources, 'approvedRoutes', 'approved_routes'))
  const availableRoutes = unique([
    ...toStringArray(pick(sources, 'availableRoutes', 'available_routes')),
    ...toStringArray(pick(sources, 'subnetRoutes', 'subnet_routes')),
    ...approvedRoutes
  ]).sort()

  const tags = unique([
    ...toStringArray(pick(sources, 'validTags', 'valid_tags')),
    ...toStringArray(pick(sources, 'forcedTags', 'forced_tags'))
  ])

  return {
    id,
    name,
    hostname,
    ipAddresses: unique(
      toStringArray(pick(sources, 'ipAddresses', 'ip_addresses', 'ipAddress', 'ip_address'))
    ),
    online: asBool(pick(sources, 'online')),
    lastSeen: asTimestamp(pick(sources, 'lastSeen', 'last_seen')),
    expiry: asTimestamp(pick(sources, 'expiry')),
    createdAt: asTimestamp(pick(sources, 'createdAt', 'created_at')),
    user: normalizeUser(pick(sources, 'user')),
    os: asString(pick(sources, 'os')) || osFromHostInfo || null,
    registerMethod: asString(pick(sources, 'registerMethod', 'register_method')) || null,
    ephemeral: asBool(pick(sources, 'ephemeral')),
    approvedRoutes,
    availableRoutes,
    tags
  }
}

export function normalizeRoute(input: unknown): RouteResource {
  const raw: Raw = isRecord(input) ? input : {}
  const nodeRaw = raw.node
  const node = isRecord(nodeRaw) ? normalizeNode(nodeRaw) : null
  const advertisedValue = raw.advertised

  return {
    id: asString(pick([raw], 'id')),
    nodeId: node?.id || asString(pick([raw], 'nodeId', 'node_id')),
    nodeName: node?.name || asString(pick([raw], 'nodeName', 'node_name')),
    prefix: asString(pick([raw], 'prefix')),
    advertised: advertisedValue === undefined ? true : asBool(advertisedValue),
    enabled: asBool(pick([raw], 'enabled')),
    isPrimary: asBool(pick([raw], 'isPrimary', 'is_primary'))
  }
}

export function normalizePreAuthKey(input: unknown): PreAuthKey {
  const raw: Raw = isRecord(input) ? input : {}

  return {
    id: asString(pick([raw], 'id')),
    key: asString(pick([raw], 'key')),
    user: normalizeUser(pick([raw], 'user')),
    reusable: asBool(pick([raw], 'reusable')),
    ephemeral: asBool(pick([raw], 'ephemeral')),
    used: asBool(pick([raw], 'used')),
    createdAt: asTimestamp(pick([raw], 'createdAt', 'created_at')),
    expiration: asTimestamp(pick([raw], 'expiration'))
  }
}

/** grpc-gateway 列表响应形如 { nodes: [...] } / { users: [...] }，也兼容直接返回数组 */
export function extractList(input: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(input)) return input
  if (isRecord(input)) {
    for (const key of keys) {
      const value = input[key]
      if (Array.isArray(value)) return value
    }
  }
  return []
}

/** 详情类响应形如 { node: {...} } / { user: {...} } */
export function extractResource(input: unknown, key: string): unknown {
  if (isRecord(input) && isRecord(input[key])) return input[key]
  return input
}
