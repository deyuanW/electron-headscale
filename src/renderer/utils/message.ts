import { ElMessage } from 'element-plus'

/** 统一展示后端返回的错误信息（来自 IPC 序列化后的 message） */
export function showApiError(error: unknown, fallback = '操作失败'): void {
  let message = fallback
  if (error instanceof Error && error.message) {
    message = error.message
  } else if (typeof error === 'string' && error) {
    message = error
  }

  ElMessage.error({ message, grouping: true, duration: 4500 })
  console.error(error)
}

export function showSuccess(message: string): void {
  ElMessage.success({ message, grouping: true })
}
