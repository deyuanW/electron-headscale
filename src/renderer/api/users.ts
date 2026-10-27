import type { HeadscaleUser } from '@shared/types/headscale'
import { invoke } from './client'

export function listUsers(): Promise<{ users: HeadscaleUser[] }> {
  return invoke('user.list', {})
}

export function createUser(name: string): Promise<HeadscaleUser | null> {
  return invoke('user.create', { name })
}

/**
 * 重命名用户。
 * Headscale >= 0.28 需要数字 ID，旧版需要用户名，因此两个都传，由主进程兼容处理。
 */
export function renameUser(
  id: string,
  name: string,
  newName: string
): Promise<HeadscaleUser | null> {
  return invoke('user.rename', { id, name, newName })
}

/** 删除用户：同样同时传 ID 与用户名，兼容不同版本 */
export function deleteUser(id: string, name: string): Promise<null> {
  return invoke('user.delete', { id, name })
}
