import type { HeadscaleUser } from '@shared/types/headscale'
import { invoke } from './client'

export function listUsers(): Promise<{ users: HeadscaleUser[] }> {
  return invoke('user.list', {})
}

export function createUser(name: string): Promise<HeadscaleUser | null> {
  return invoke('user.create', { name })
}

export function renameUser(name: string, newName: string): Promise<HeadscaleUser | null> {
  return invoke('user.rename', { name, newName })
}

export function deleteUser(name: string): Promise<null> {
  return invoke('user.delete', { name })
}
