import type { PolicyDocument, PolicySaveResult } from '@shared/types/headscale'
import { invoke } from './client'

export function getPolicy(): Promise<PolicyDocument> {
  return invoke('policy.get', {})
}

export function setPolicy(policy: string): Promise<PolicySaveResult> {
  return invoke('policy.set', { policy })
}
