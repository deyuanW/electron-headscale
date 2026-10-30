/** 内置 Tailscale 核心的运行模式 */
export type TailscaleRunMode = 'userspace' | 'tun'

/** 持久化在 electron-store 中的核心配置 */
export interface TailscaleSettings {
  /** 应用启动时自动启动核心 */
  autoStart: boolean
  mode: TailscaleRunMode
  /** Headscale 控制面地址；留空时回退到连接配置中的服务器地址 */
  controlUrl: string
  hostname: string
  acceptRoutes: boolean
  enableSsh: boolean
  exitNode: string
  advertiseRoutes: string
  /** 用户态模式下的本地 SOCKS5 端口 */
  socksPort: number
}

/** 返回给渲染进程的配置：永远不包含明文认证密钥 */
export interface TailscaleSettingsView extends TailscaleSettings {
  hasAuthKey: boolean
}

export interface TailscaleSettingsInput extends TailscaleSettings {
  /** 留空表示保持已保存的密钥不变 */
  authKey?: string
}

export interface TailscalePeer {
  id: string
  hostName: string
  dnsName: string
  os: string
  ips: string[]
  online: boolean
  active: boolean
  exitNode: boolean
  exitNodeOption: boolean
}

export interface TailscaleStatus {
  /** 是否找到可用的核心二进制 */
  available: boolean
  binaryPath: string | null
  coreVersion: string | null
  running: boolean
  backendState: string
  loggedIn: boolean
  nodeName: string | null
  dnsName: string | null
  ips: string[]
  online: boolean
  mode: TailscaleRunMode
  controlUrl: string
  socksProxy: string | null
  peers: TailscalePeer[]
  health: string[]
  error: string | null
  loginUrl: string | null
}

export interface TailscaleLogEntry {
  time: string
  stream: 'stdout' | 'stderr' | 'system'
  text: string
}

export const DEFAULT_TAILSCALE_SETTINGS: TailscaleSettings = {
  autoStart: false,
  mode: 'userspace',
  controlUrl: '',
  hostname: '',
  acceptRoutes: false,
  enableSsh: false,
  exitNode: '',
  advertiseRoutes: '',
  socksPort: 1055
}

export function emptyTailscaleStatus(): TailscaleStatus {
  return {
    available: false,
    binaryPath: null,
    coreVersion: null,
    running: false,
    backendState: 'NoState',
    loggedIn: false,
    nodeName: null,
    dnsName: null,
    ips: [],
    online: false,
    mode: 'userspace',
    controlUrl: '',
    socksProxy: null,
    peers: [],
    health: [],
    error: null,
    loginUrl: null
  }
}
