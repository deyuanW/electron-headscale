import type {
  CreatePreAuthKeyInput,
  PreAuthKey,
  PreAuthKeyListResult,
  PreAuthKeyRevokeResult
} from '@shared/types/headscale'
import { invoke } from './client'

export function listPreAuthKeys(user?: string, userId?: string): Promise<PreAuthKeyListResult> {
  return invoke('preauthkey.list', { user, userId })
}

export function createPreAuthKey(input: CreatePreAuthKeyInput): Promise<PreAuthKey | null> {
  return invoke('preauthkey.create', input)
}

/**
 * 撤销密钥。服务端支持删除时为删除，否则回退为「置为过期」（mode 会告知实际结果）。
 * id 为密钥数字 ID（0.28+ 必需），user/key 用于兼容旧版。
 */
export function revokePreAuthKey(payload: {
  id: string
  key: string
  user: string
  userId?: string
}): Promise<PreAuthKeyRevokeResult> {
  return invoke('preauthkey.revoke', payload)
}
