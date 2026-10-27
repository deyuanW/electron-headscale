import type { DesktopConfig, SaveConfigPayload } from '@shared/types/ipc'
import type { ConnectionTestResult } from '@shared/types/headscale'
import { invoke } from './client'

export function getDesktopConfig(): Promise<DesktopConfig> {
  return window.desktop.config.getAll()
}

export function saveDesktopConfig(payload: SaveConfigPayload): Promise<DesktopConfig> {
  return window.desktop.config.save(payload)
}

export function clearDesktopConfig(): Promise<void> {
  return window.desktop.config.clear()
}

/** 测试连接：服务端若未保存配置，可传临时 serverUrl / apiKey */
export function testConnection(payload: {
  serverUrl?: string
  apiKey?: string
}): Promise<ConnectionTestResult> {
  return invoke('connection.test', payload)
}
