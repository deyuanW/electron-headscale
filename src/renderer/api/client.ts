import type { ActionName, ActionPayload, ActionResult, IpcResult } from '@shared/types/ipc'

/** 渲染进程侧的统一 API 错误，消息来自主进程对后端错误的解析 */
export class ApiError extends Error {
  status?: number
  code?: string

  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * 所有业务请求的唯一入口。
 * 实际 HTTP 请求由主进程的 axios 实例发出（见 src/main/api/client.ts）。
 */
export async function invoke<A extends ActionName>(
  action: A,
  payload: ActionPayload<A>
): Promise<ActionResult<A>> {
  const result: IpcResult<ActionResult<A>> = await window.desktop.invoke(action, payload)

  if (!result.ok) {
    throw new ApiError(result.error.message, result.error.status, result.error.code)
  }

  return result.data
}
