import Store from 'electron-store'
import { normalizeServerUrl } from './utils/url'

interface ConfigSchema {
  serverUrl: string
  apiKey: string
}

/**
 * 本地配置存储（electron-store）。
 * 数据保存在系统 userData 目录下的 config.json，渲染进程无法直接读取文件。
 */
const store = new Store<ConfigSchema>({
  name: 'headscale-desktop',
  defaults: {
    serverUrl: '',
    apiKey: ''
  }
})

export interface StoredConfig {
  serverUrl: string
  apiKey: string
}

export function getStoredConfig(): StoredConfig {
  return {
    serverUrl: store.get('serverUrl', ''),
    apiKey: store.get('apiKey', '')
  }
}

export function saveStoredConfig(input: { serverUrl: string; apiKey?: string }): StoredConfig {
  const serverUrl = normalizeServerUrl(input.serverUrl)
  store.set('serverUrl', serverUrl)

  // apiKey 为空/未传时保持原有 Key 不变，便于「只改地址」的场景
  if (typeof input.apiKey === 'string' && input.apiKey.trim() !== '') {
    store.set('apiKey', input.apiKey.trim())
  }

  return getStoredConfig()
}

export function clearStoredConfig(): void {
  store.set('serverUrl', '')
  store.set('apiKey', '')
}
