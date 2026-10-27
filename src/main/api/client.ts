import axios from 'axios'
import type { AxiosError, AxiosInstance } from 'axios'
import { normalizeServerUrl } from '../utils/url'

/** 统一的 API 错误类型，IPC 层会把它序列化为 { message, status, code } */
export class HeadscaleApiError extends Error {
  status?: number
  code?: string

  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = 'HeadscaleApiError'
    this.status = status
    this.code = code
  }
}

export interface HeadscaleClient {
  http: AxiosInstance
  serverUrl: string
}

/**
 * 创建 axios 实例（统一封装）：
 * - baseURL 固定为 {serverUrl}/api/v1
 * - 自动附加 Bearer 认证头
 * - 统一超时与错误拦截
 *
 * 注意：请求在主进程发出，因此不存在浏览器 CORS 限制，
 * 同时 API Key 不会进入渲染进程。
 */
export function createHeadscaleClient(serverUrl: string, apiKey: string): HeadscaleClient {
  const normalized = normalizeServerUrl(serverUrl)
  if (!normalized) {
    throw new HeadscaleApiError('请先填写 Headscale 服务器地址')
  }
  if (!apiKey) {
    throw new HeadscaleApiError('请先填写 API Key')
  }

  const http = axios.create({
    baseURL: `${normalized}/api/v1`,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  })

  http.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => Promise.reject(translateAxiosError(error))
  )

  return { http, serverUrl: normalized }
}

/** Headscale / grpc-gateway 的错误响应结构可能是 { message } / { error } / 纯文本 */
function extractMessage(data: unknown): string | undefined {
  if (!data) return undefined

  if (typeof data === 'string') {
    const text = data.trim()
    return text && text.length <= 500 ? text : undefined
  }

  if (typeof data === 'object') {
    const record = data as Record<string, unknown>
    for (const key of ['message', 'error', 'detail', 'error_description']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return undefined
}

/** axios 错误 -> 可读的中文错误 */
export function translateAxiosError(error: AxiosError): HeadscaleApiError {
  if (error instanceof HeadscaleApiError) return error

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new HeadscaleApiError('请求超时，请检查服务器地址与网络连接', 408, error.code)
  }

  if (!error.response) {
    return new HeadscaleApiError(
      '无法连接到服务器，请检查地址、网络或 TLS 证书是否受信任',
      undefined,
      error.code
    )
  }

  const status = error.response.status
  const data = error.response.data as unknown
  const rawCode =
    data && typeof data === 'object' && 'code' in data
      ? String((data as Record<string, unknown>).code)
      : undefined

  const statusMessages: Record<number, string> = {
    400: '请求参数有误',
    401: '认证失败：API Key 无效或已过期',
    403: '没有权限执行该操作',
    404: '接口不存在，当前 Headscale 版本可能不支持该功能',
    405: '服务端不支持该请求方法',
    409: '资源冲突，请刷新后重试',
    429: '请求过于频繁，请稍后再试',
    500: '服务端内部错误',
    502: '网关错误，请检查反向代理配置',
    503: '服务暂不可用'
  }

  const message = extractMessage(data) || statusMessages[status] || `服务端返回错误（HTTP ${status}）`
  return new HeadscaleApiError(message, status, rawCode)
}

/**
 * 读取 Headscale 版本（/version 不在 /api/v1 下）。
 * 不同版本返回值可能是纯文本或 { version }，失败时返回 null，不影响主流程。
 */
export async function fetchHeadscaleVersion(serverUrl: string): Promise<string | null> {
  const normalized = normalizeServerUrl(serverUrl)
  if (!normalized) return null

  try {
    const response = await axios.get(`${normalized}/version`, {
      timeout: 8000,
      responseType: 'text',
      transformResponse: [(data) => data]
    })

    const raw = typeof response.data === 'string' ? response.data.trim() : ''

    if (!raw) return null
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw) as { version?: string }
        return parsed.version ?? null
      } catch {
        return raw
      }
    }
    return raw
  } catch {
    // TODO(headscale): 部分老旧版本没有 /version 接口，此处静默降级
    return null
  }
}
