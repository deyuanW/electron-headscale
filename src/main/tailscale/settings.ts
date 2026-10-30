import Store from 'electron-store'
import {
  DEFAULT_TAILSCALE_SETTINGS,
  type TailscaleRunMode,
  type TailscaleSettings,
  type TailscaleSettingsInput,
  type TailscaleSettingsView
} from '../../shared/types/tailscale'
import { normalizeServerUrl } from '../utils/url'

interface TailscaleStoreSchema extends TailscaleSettings {
  authKey: string
}

/**
 * 内置核心的配置独立存放，避免与 Headscale API 配置混在一起。
 * authKey 只保存在主进程，渲染进程只能看到 hasAuthKey。
 */
const store = new Store<TailscaleStoreSchema>({
  name: 'tailscale-core',
  defaults: {
    ...DEFAULT_TAILSCALE_SETTINGS,
    authKey: ''
  }
})

export interface StoredTailscaleSettings extends TailscaleSettings {
  authKey: string
}

function normalizeMode(value: unknown): TailscaleRunMode {
  return value === 'tun' ? 'tun' : 'userspace'
}

function clampPort(value: unknown): number {
  const port = typeof value === 'number' ? Math.trunc(value) : Number(value)
  if (!Number.isFinite(port) || port < 1 || port > 65535) return DEFAULT_TAILSCALE_SETTINGS.socksPort
  return port
}

export function getStoredTailscaleSettings(): StoredTailscaleSettings {
  return {
    autoStart: Boolean(store.get('autoStart', false)),
    mode: normalizeMode(store.get('mode')),
    controlUrl: store.get('controlUrl', ''),
    hostname: store.get('hostname', ''),
    acceptRoutes: Boolean(store.get('acceptRoutes', false)),
    enableSsh: Boolean(store.get('enableSsh', false)),
    exitNode: store.get('exitNode', ''),
    advertiseRoutes: store.get('advertiseRoutes', ''),
    socksPort: clampPort(store.get('socksPort', DEFAULT_TAILSCALE_SETTINGS.socksPort)),
    authKey: store.get('authKey', '')
  }
}

export function getTailscaleSettingsView(): TailscaleSettingsView {
  const { authKey, ...settings } = getStoredTailscaleSettings()
  return {
    ...settings,
    hasAuthKey: Boolean(authKey)
  }
}

export function saveTailscaleSettings(input: TailscaleSettingsInput): TailscaleSettingsView {
  const current = getStoredTailscaleSettings()

  store.set({
    autoStart: Boolean(input.autoStart),
    mode: normalizeMode(input.mode),
    controlUrl: input.controlUrl.trim() ? normalizeServerUrl(input.controlUrl) : '',
    hostname: input.hostname.trim(),
    acceptRoutes: Boolean(input.acceptRoutes),
    // 用户态网络没有稳定的入站通道，SSH 服务只在 TUN 模式下开放
    enableSsh: normalizeMode(input.mode) === 'tun' ? Boolean(input.enableSsh) : false,
    exitNode: input.exitNode.trim(),
    advertiseRoutes: input.advertiseRoutes
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .join(','),
    socksPort: clampPort(input.socksPort),
    // 空字符串表示保持原密钥，便于「只改地址」时不重新输入
    authKey:
      typeof input.authKey === 'string' && input.authKey.trim() !== ''
        ? input.authKey.trim()
        : current.authKey
  })

  return getTailscaleSettingsView()
}

export function getTailscaleAuthKey(): string {
  return store.get('authKey', '')
}

export function clearTailscaleAuthKey(): void {
  store.set('authKey', '')
}
