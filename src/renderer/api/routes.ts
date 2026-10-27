import type { RouteListResult } from '@shared/types/headscale'
import { invoke } from './client'

export function listRoutes(): Promise<RouteListResult> {
  return invoke('route.list', {})
}

export function enableRoute(id: string): Promise<null> {
  return invoke('route.enable', { id })
}

export function disableRoute(id: string): Promise<null> {
  return invoke('route.disable', { id })
}
