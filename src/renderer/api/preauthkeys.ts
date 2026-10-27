import type {
  CreatePreAuthKeyInput,
  PreAuthKey,
  PreAuthKeyListResult,
  PreAuthKeyRevokeResult
} from '@shared/types/headscale'
import { invoke } from './client'

export function listPreAuthKeys(user?: string): Promise<PreAuthKeyListResult> {
  return invoke('preauthkey.list', { user })
}

export function createPreAuthKey(input: CreatePreAuthKeyInput): Promise<PreAuthKey | null> {
  return invoke('preauthkey.create', input)
}

/**
 * 撤销密钥。服务端支持 DELETE 时为删除，否则回退为「置为过期」（mode 会告知实际结果）。
 */
export function revokePreAuthKey(user: string, key: string): Promise<PreAuthKeyRevokeResult> {
  return invoke('preauthkey.revoke', { user, key })
}
