import type {
  NodeListQuery,
  NodeListResult,
  NodeResource
} from '@shared/types/headscale'
import { invoke } from './client'

export function listNodes(query: NodeListQuery = {}): Promise<NodeListResult> {
  return invoke('node.list', query)
}

export function renameNode(id: string, newName: string): Promise<NodeResource | null> {
  return invoke('node.rename', { id, newName })
}

export function deleteNode(id: string): Promise<null> {
  return invoke('node.delete', { id })
}

/** 立即让节点过期（Headscale 官方 API 仅支持立即过期） */
export function expireNode(id: string): Promise<NodeResource | null> {
  return invoke('node.expire', { id })
}

/** 批准路由：传入「已批准 + 本次新增」的完整网段列表 */
export function approveNodeRoutes(id: string, routes: string[]): Promise<NodeResource | null> {
  return invoke('node.approveRoutes', { id, routes })
}
