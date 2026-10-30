import { app } from 'electron'
import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import type {
  TailscaleLogEntry,
  TailscalePeer,
  TailscaleRunMode,
  TailscaleStatus
} from '../../shared/types/tailscale'
import { emptyTailscaleStatus } from '../../shared/types/tailscale'
import { getStoredConfig } from '../config'
import { normalizeServerUrl } from '../utils/url'
import {
  getStoredTailscaleSettings,
  getTailscaleAuthKey,
  type StoredTailscaleSettings
} from './settings'

interface CoreBinaries {
  dir: string
  tailscale: string
  tailscaled: string
}

interface RawPeer {
  ID?: string
  HostName?: string
  DNSName?: string
  OS?: string
  TailscaleIPs?: string[]
  Online?: boolean
  Active?: boolean
  ExitNode?: boolean
  ExitNodeOption?: boolean
}

interface RawStatus {
  BackendState?: string
  Version?: string
  Self?: {
    HostName?: string
    DNSName?: string
    TailscaleIPs?: string[]
    Online?: boolean
  }
  Peer?: Record<string, RawPeer>
  Health?: string[]
}

class CommandError extends Error {
  stdout: string
  stderr: string
  code: number | string | null

  constructor(message: string, stdout: string, stderr: string, code: number | string | null) {
    super(message)
    this.name = 'CommandError'
    this.stdout = stdout
    this.stderr = stderr
    this.code = code
  }
}

function runFile(
  file: string,
  args: string[],
  timeout: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        encoding: 'utf8'
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new CommandError(
              error.message,
              String(stdout ?? ''),
              String(stderr ?? ''),
              typeof error.code === 'number' || typeof error.code === 'string' ? error.code : null
            )
          )
          return
        }
        resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
      }
    )
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function platformFolder(): string {
  const arch = process.arch === 'x64' || process.arch === 'arm64' ? process.arch : process.arch
  return `${process.platform}-${arch}`
}

function executableName(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name
}

function redactArgs(args: string[]): string[] {
  return args.map((arg) => (arg.startsWith('--authkey=') ? '--authkey=***' : arg))
}

function describeError(error: unknown): string {
  if (error instanceof CommandError) {
    const output = (error.stderr || error.stdout).trim()
    if (output) {
      return output.split(/\r?\n/).slice(-8).join('\n')
    }
    if (error.code === 'ETIMEDOUT') return '命令执行超时'
    return error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}

/** Windows 判断当前进程是否具备管理员权限；非 Windows 判断是否 root */
function isElevated(): boolean {
  if (process.platform === 'win32') {
    try {
      execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true })
      return true
    } catch {
      return false
    }
  }
  return typeof process.getuid === 'function' && process.getuid() === 0
}

function parseStatus(raw: string): RawStatus | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as RawStatus
  } catch {
    return null
  }
}

function toPeers(status: RawStatus): TailscalePeer[] {
  const peers = Object.entries(status.Peer ?? {}).map(([key, peer]) => ({
    id: peer.ID || key,
    hostName: peer.HostName || key,
    dnsName: (peer.DNSName || '').replace(/\.$/, ''),
    os: peer.OS || '',
    ips: Array.isArray(peer.TailscaleIPs) ? peer.TailscaleIPs : [],
    online: Boolean(peer.Online),
    active: Boolean(peer.Active),
    exitNode: Boolean(peer.ExitNode),
    exitNodeOption: Boolean(peer.ExitNodeOption)
  }))

  return peers.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1
    return a.hostName.localeCompare(b.hostName)
  })
}

/**
 * 内置 Tailscale 核心管理器。
 *
 * 设计要点：
 * - 使用随应用分发的 tailscaled/tailscale，不依赖官方托盘 UI
 * - 独立 state/socket，尽量避免与系统中已安装的 Tailscale 冲突
 * - 默认 userspace 模式（免管理员）；TUN 模式需要管理员/root
 * - 认证密钥只在主进程使用，不通过 IPC 回传
 */
class TailscaleManager {
  private child: ChildProcess | null = null
  private loginChild: ChildProcess | null = null
  /** 常驻 IPN 订阅客户端，防止 dev 模式下后端随最后一个客户端断开而停止 */
  private ipnWatch: ChildProcess | null = null
  private binaries: CoreBinaries | null = null
  private binariesResolved = false
  private starting: Promise<TailscaleStatus> | null = null
  private statusPromise: Promise<TailscaleStatus> | null = null
  private logs: TailscaleLogEntry[] = []
  private logSink: ((entry: TailscaleLogEntry) => void) | null = null
  private lastError: string | null = null
  private loginUrl: string | null = null
  private intentionalStop = false
  /** TUN 网卡创建失败（通常是与官方 Tailscale 的 Wintun 网卡冲突） */
  private tunConflict = false
  private coreVersion: string | null = null
  private versionResolved = false

  setLogSink(sink: ((entry: TailscaleLogEntry) => void) | null): void {
    this.logSink = sink
  }

  getLogs(): TailscaleLogEntry[] {
    return [...this.logs]
  }

  private ensureStateDir(): string {
    const dir = join(app.getPath('userData'), 'tailscale-core')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  private get stateFile(): string {
    return join(this.ensureStateDir(), 'tailscaled.state')
  }

  /** 记录当前核心进程 PID，用于应用被强杀后下次启动/退出时清理遗留进程 */
  private get pidFile(): string {
    return join(this.ensureStateDir(), 'tailscaled.pid')
  }

  private recordPid(pid: number | undefined): void {
    if (!pid) return
    try {
      writeFileSync(this.pidFile, String(pid), 'utf8')
    } catch {
      // 写不进去不影响核心运行
    }
  }

  private clearPidFile(): void {
    try {
      unlinkSync(this.pidFile)
    } catch {
      // 文件不存在时忽略
    }
  }

  private isTailscaledPid(pid: number): boolean {
    try {
      if (process.platform === 'win32') {
        const output = execFileSync(
          'tasklist',
          ['/FI', `PID eq ${pid}`, '/FI', 'IMAGENAME eq tailscaled.exe', '/NH'],
          { encoding: 'utf8', windowsHide: true }
        )
        return output.toLowerCase().includes('tailscaled.exe')
      }
      const output = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], {
        encoding: 'utf8'
      })
      return output.includes('tailscaled')
    } catch {
      return false
    }
  }

  /**
   * 清理上一次运行遗留的核心进程。
   * 应用被任务管理器强杀或升级覆盖时，tailscaled 可能变成孤儿进程继续占用 socket。
   */
  private killRecordedDaemon(): void {
    let pid = 0
    try {
      pid = Number(readFileSync(this.pidFile, 'utf8').trim())
    } catch {
      return
    }

    if (!Number.isInteger(pid) || pid <= 0) {
      this.clearPidFile()
      return
    }
    if (this.child?.pid === pid) return
    if (!this.isTailscaledPid(pid)) {
      this.clearPidFile()
      return
    }

    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true
        })
      } else {
        process.kill(pid, 'SIGKILL')
      }
      this.appendLog('system', `已清理遗留的核心进程（pid=${pid}）`)
    } catch {
      // 进程可能已退出
    }

    this.clearPidFile()
  }

  private get socketPath(): string {
    if (process.platform === 'win32') {
      return '\\\\.\\pipe\\headscale-desktop-tailscaled'
    }
    return join(this.ensureStateDir(), 'tailscaled.sock')
  }

  /** 查找随包分发的核心；找不到时回退到系统安装的 tailscale */
  private resolveBinaries(): CoreBinaries | null {
    if (this.binariesResolved) return this.binaries
    this.binariesResolved = true

    const folder = platformFolder()
    const roots: string[] = []
    if (app.isPackaged) {
      roots.push(join(process.resourcesPath, 'tailscale'))
    }
    roots.push(join(app.getAppPath(), 'resources', 'tailscale'))
    roots.push(join(process.cwd(), 'resources', 'tailscale'))

    for (const root of roots) {
      const dir = join(root, folder)
      const tailscale = join(dir, executableName('tailscale'))
      const tailscaled = join(dir, executableName('tailscaled'))
      if (existsSync(tailscale) && existsSync(tailscaled)) {
        this.makeExecutable(tailscale)
        this.makeExecutable(tailscaled)
        this.binaries = { dir, tailscale, tailscaled }
        return this.binaries
      }
    }

    const systemDirs =
      process.platform === 'win32'
        ? ['C:\\Program Files\\Tailscale']
        : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']

    for (const dir of systemDirs) {
      const tailscale = join(dir, executableName('tailscale'))
      const tailscaled = join(dir, executableName('tailscaled'))
      if (existsSync(tailscale) && existsSync(tailscaled)) {
        this.binaries = { dir, tailscale, tailscaled }
        return this.binaries
      }
    }

    return null
  }

  private makeExecutable(file: string): void {
    if (process.platform === 'win32') return
    try {
      chmodSync(file, 0o755)
    } catch {
      // 权限不足时交给启动阶段报错，不在这里中断
    }
  }

  private appendLog(stream: TailscaleLogEntry['stream'], text: string): void {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
    for (const line of lines) {
      const entry: TailscaleLogEntry = {
        time: new Date().toISOString(),
        stream,
        text: line
      }
      this.logs.push(entry)
      if (this.logs.length > 500) this.logs.splice(0, this.logs.length - 500)
      this.logSink?.(entry)
    }
  }

  private attachStream(
    stream: NodeJS.ReadableStream | null,
    kind: 'stdout' | 'stderr',
    onLine?: (line: string) => void
  ): void {
    if (!stream) return
    let buffer = ''
    stream.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString()
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        this.appendLog(kind, line)
        onLine?.(line)
      }
    })
  }

  private getCliArgs(args: string[]): string[] {
    return [`--socket=${this.socketPath}`, ...args]
  }

  private async execCli(
    args: string[],
    timeout = 10000
  ): Promise<{ stdout: string; stderr: string }> {
    const binaries = this.resolveBinaries()
    if (!binaries) throw new Error('未找到 Tailscale 核心二进制')
    return runFile(binaries.tailscale, this.getCliArgs(args), timeout)
  }

  private async resolveCoreVersion(): Promise<string | null> {
    if (this.versionResolved) return this.coreVersion
    this.versionResolved = true
    const binaries = this.resolveBinaries()
    if (!binaries) return null
    try {
      const { stdout } = await runFile(binaries.tailscaled, ['--version'], 5000)
      this.coreVersion = stdout.split(/\r?\n/)[0]?.trim() || null
    } catch {
      this.coreVersion = null
    }
    return this.coreVersion
  }

  /**
   * `tailscale up` 的规则：只要本机存在「非默认」偏好，就必须在命令里显式提到全部非默认项，
   * 否则报 "changing settings via 'tailscale up' requires mentioning all non-default flags"。
   * 因此这里不做省略，布尔项统一写成 --flag=true/false，路由/出口节点即使为空也显式传空值。
   */
  private buildUpArgs(
    settings: StoredTailscaleSettings,
    authKey: string
  ): string[] {
    const args = [
      'up',
      `--login-server=${settings.controlUrl}`,
      `--hostname=${settings.hostname || hostname()}`,
      `--accept-routes=${settings.acceptRoutes}`,
      // 不接管系统 DNS：Headscale 未下发 DNS 配置时会让系统失去解析能力，
      // 连控制面域名都无法解析（fetch control key: no DNS fallback candidates remain）
      '--accept-dns=false',
      `--advertise-routes=${settings.advertiseRoutes}`,
      `--exit-node=${settings.exitNode}`
    ]

    if (authKey) args.push(`--authkey=${authKey}`)
    // Windows 版核心不支持作为 SSH 服务端，传该参数会直接报错
    if (process.platform !== 'win32') args.push(`--ssh=${settings.enableSsh}`)

    return args
  }

  /**
   * 无预认证密钥时的交互式登录。
   *
   * 注意：不能用带超时的 execFile 等待 `tailscale up`，因为命令被终止后
   * Tailscale 会把 WantRunning 回滚为 false，导致用户完成授权后节点仍不启动。
   * 这里保留登录进程，拿到 URL 后立即返回，由用户在浏览器完成授权。
   */
  private async startInteractiveLogin(settings: StoredTailscaleSettings): Promise<void> {
    const binaries = this.resolveBinaries()
    if (!binaries) throw new Error('未找到 Tailscale 核心二进制')

    this.stopLoginProcess()
    this.loginUrl = null

    const args = this.buildUpArgs(settings, '')
    this.appendLog('system', `进入交互式登录：tailscale ${redactArgs(args).join(' ')}`)

    const child = spawn(binaries.tailscale, this.getCliArgs(args), {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.loginChild = child

    let output = ''
    let settle: (() => void) | null = null
    const wait = new Promise<void>((resolve) => {
      settle = resolve
    })
    const finish = (): void => {
      if (!settle) return
      const resolve = settle
      settle = null
      resolve()
    }
    const timer = setTimeout(finish, 15000)

    const handleOutput = (kind: 'stdout' | 'stderr', chunk: Buffer | string): void => {
      const text = chunk.toString()
      output += text
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) this.appendLog(kind, line)
      }
      const url = output.match(/https?:\/\/[^\s"'<>]+/)?.[0]
      if (url && !this.loginUrl) {
        this.loginUrl = url
        this.lastError = null
        finish()
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => handleOutput('stdout', chunk))
    child.stderr?.on('data', (chunk: Buffer) => handleOutput('stderr', chunk))

    child.on('error', (error) => {
      this.lastError = `登录进程启动失败：${error.message}`
      this.appendLog('system', this.lastError)
      finish()
    })

    child.on('exit', (code, signal) => {
      if (this.loginChild === child) this.loginChild = null
      if (code !== null && code !== 0 && !this.loginUrl) {
        this.lastError = `登录进程退出（code=${code}），请查看核心日志`
      }
      this.appendLog('system', `登录进程结束（code=${code ?? 'null'}, signal=${signal ?? 'null'}）`)
      finish()
    })

    await wait
    clearTimeout(timer)

    if (!this.loginUrl && !this.lastError) {
      this.lastError = '已启动登录流程，但暂未获取到登录链接，请查看核心日志'
    }
  }

  private stopLoginProcess(): void {
    const child = this.loginChild
    this.loginChild = null
    if (child && child.exitCode === null) {
      try {
        child.kill()
      } catch {
        // 忽略
      }
    }
  }

  /**
   * Windows 的 dev 模式会把后端生命周期绑定到本地客户端连接：
   * 最后一个客户端断开时 tailscaled 会停止后端（日志中的 disconnecting Tailscale）。
   * 这里保持一个常驻的 IPN 订阅客户端，避免界面定时刷新状态时反复打断连接。
   */
  private startIpnWatch(): void {
    if (this.ipnWatch && this.ipnWatch.exitCode === null) return
    const binaries = this.resolveBinaries()
    if (!binaries) return

    const child = spawn(binaries.tailscale, this.getCliArgs(['debug', 'watch-ipn']), {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    this.ipnWatch = child

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString().trim()
      if (text) this.appendLog('stderr', text)
    })
    child.on('error', () => {
      if (this.ipnWatch === child) this.ipnWatch = null
    })
    child.on('exit', () => {
      if (this.ipnWatch === child) this.ipnWatch = null
    })
  }

  private stopIpnWatch(): void {
    const child = this.ipnWatch
    this.ipnWatch = null
    if (!child || child.exitCode !== null) return
    try {
      child.kill()
    } catch {
      // 忽略
    }
  }

  private async runUp(settings: StoredTailscaleSettings, authKey: string): Promise<void> {
    if (!authKey) {
      await this.startInteractiveLogin(settings)
      return
    }

    const args = this.buildUpArgs(settings, authKey)
    this.appendLog('system', `执行 tailscale ${redactArgs(args).join(' ')}`)

    try {
      await this.execCli(args, 30000)
      this.loginUrl = null
      this.stopLoginProcess()
    } catch (error) {
      this.lastError = describeError(error)
      this.appendLog('system', `tailscale up 失败：${this.lastError}`)
      throw error
    }
  }

  private async waitForDaemon(): Promise<boolean> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (!this.child || this.child.exitCode !== null) return false
      if (this.tunConflict) return false
      try {
        const { stdout } = await this.execCli(['status', '--json'], 4000)
        if (parseStatus(stdout)) return true
      } catch {
        // 守护进程尚未就绪，继续等待
      }
      await delay(350)
    }
    return false
  }

  async getStatus(): Promise<TailscaleStatus> {
    if (this.statusPromise) return this.statusPromise
    this.statusPromise = this.readStatus().finally(() => {
      this.statusPromise = null
    })
    return this.statusPromise
  }

  private async readStatus(): Promise<TailscaleStatus> {
    const settings = getStoredTailscaleSettings()
    const binaries = this.resolveBinaries()
    const version = await this.resolveCoreVersion()
    const status = emptyTailscaleStatus()

    status.available = Boolean(binaries)
    status.binaryPath = binaries?.tailscaled ?? null
    status.coreVersion = version
    status.mode = settings.mode
    status.controlUrl = this.resolveControlUrl(settings)
    status.socksProxy =
      settings.mode === 'userspace' ? `socks5://127.0.0.1:${settings.socksPort}` : null
    status.running = Boolean(this.child && this.child.exitCode === null)
    status.error = this.lastError
    status.loginUrl = this.loginUrl

    if (!binaries) {
      status.error =
        '未找到 Tailscale 核心。请确认 resources/tailscale 下已放入对应平台二进制，或安装官方 Tailscale。'
      return status
    }

    if (!status.running) {
      return status
    }

    try {
      const { stdout } = await this.execCli(['status', '--json'], 6000)
      const raw = parseStatus(stdout)
      if (!raw) {
        status.error = '核心已启动，但状态输出无法解析'
        return status
      }

      status.backendState = raw.BackendState || 'Unknown'
      status.loggedIn = raw.BackendState === 'Running'
      status.nodeName = raw.Self?.HostName ?? null
      status.dnsName = (raw.Self?.DNSName || '').replace(/\.$/, '') || null
      status.ips = Array.isArray(raw.Self?.TailscaleIPs) ? raw.Self.TailscaleIPs : []
      status.online = Boolean(raw.Self?.Online)
      status.peers = toPeers(raw)
      status.health = Array.isArray(raw.Health) ? raw.Health : []
      if (status.loggedIn) {
        this.lastError = null
        this.loginUrl = null
        // 登录完成后 tailscale up 进程通常自行退出，这里兜底清理
        this.stopLoginProcess()
      }
    } catch (error) {
      status.error = `读取核心状态失败：${describeError(error)}`
    }

    return status
  }

  private resolveControlUrl(settings: StoredTailscaleSettings): string {
    const configured = normalizeServerUrl(settings.controlUrl) || normalizeServerUrl(getStoredConfig().serverUrl)
    return configured
  }

  async start(): Promise<TailscaleStatus> {
    if (this.starting) return this.starting
    this.starting = this.doStart().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  private async doStart(): Promise<TailscaleStatus> {
    this.lastError = null
    this.loginUrl = null
    this.tunConflict = false

    const settings = getStoredTailscaleSettings()
    settings.controlUrl = this.resolveControlUrl(settings)

    if (!settings.controlUrl) {
      this.lastError = '请先填写 Headscale 控制面地址，或完成连接配置'
      return this.getStatus()
    }

    const binaries = this.resolveBinaries()
    if (!binaries) {
      this.lastError = '未找到 Tailscale 核心二进制'
      return this.getStatus()
    }

    if (settings.mode === 'tun' && !isElevated()) {
      this.lastError =
        process.platform === 'win32'
          ? '系统 TUN 模式需要管理员权限，请以管理员身份重新启动应用'
          : '系统 TUN 模式需要 root 权限，请使用 sudo 启动应用'
      return this.getStatus()
    }

    const authKey = getTailscaleAuthKey()

    // 上次运行被强杀时可能遗留核心进程，先清理再决定是否复用
    this.killRecordedDaemon()

    if (this.child && this.child.exitCode === null) {
      try {
        await this.runUp(settings, authKey)
      } catch {
        // lastError 已记录
      }
      return this.getStatus()
    }

    const args = [
      `--state=${this.stateFile}`,
      `--socket=${this.socketPath}`,
      '--port=0'
    ]
    if (process.platform === 'win32') {
      // Windows 默认模式会强制使用系统服务的命名管道；dev 模式才允许自定义 socket，
      // 从而与官方 Tailscale 服务并存
      args.push('--windows-mode=dev')
    }
    if (settings.mode === 'userspace') {
      args.push('--tun=userspace-networking')
      args.push(`--socks5-server=127.0.0.1:${settings.socksPort}`)
    } else if (process.platform === 'win32') {
      // 官方 Tailscale 默认占用名为 "Tailscale" 的 Wintun 网卡，
      // 内置核心 TUN 模式改用独立网卡名，避免 "Cannot create a file when that file already exists"
      args.push('--tun=headscale-desktop')
    }

    this.appendLog(
      'system',
      `启动核心（${settings.mode === 'tun' ? '系统 TUN' : '用户态'}）：${binaries.tailscaled} ${args.join(' ')}`
    )

    this.intentionalStop = false
    const child = spawn(binaries.tailscaled, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.child = child
    this.recordPid(child.pid)

    child.on('error', (error) => {
      this.lastError = `核心启动失败：${error.message}`
      this.appendLog('system', this.lastError)
    })

    child.on('exit', (code, signal) => {
      this.appendLog(
        'system',
        `核心已退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）`
      )
      if (!this.intentionalStop && code !== 0) {
        this.lastError = `核心进程异常退出（code=${code ?? 'null'}）`
      }
      if (this.child === child) this.child = null
    })

    this.attachStream(child.stdout, 'stdout')
    this.attachStream(child.stderr, 'stderr', (line) => {
      // 官方 Tailscale 已运行时会占用 Wintun，导致自建网卡创建失败
      if (
        settings.mode === 'tun' &&
        (line.includes('tstun.New') || line.includes('0x800700B7'))
      ) {
        this.tunConflict = true
      }
    })

    const ready = await this.waitForDaemon()
    if (!ready) {
      this.lastError = this.tunConflict
        ? '系统 TUN 模式与官方 Tailscale 冲突：官方客户端正在占用 Wintun 网卡。请先退出官方 Tailscale（或停止 Tailscale 服务）后重试，或切换到「用户态」模式。'
        : this.lastError || '核心启动超时，请查看日志'
      await this.stopChild()
      return this.getStatus()
    }

    // 保持一个常驻客户端，避免后续状态轮询断开时后端被停止
    this.startIpnWatch()

    try {
      await this.runUp(settings, authKey)
    } catch {
      // lastError 已记录，保留核心进程以便用户修正后重试
    }

    return this.getStatus()
  }

  async stop(): Promise<TailscaleStatus> {
    this.intentionalStop = true
    this.loginUrl = null
    this.stopLoginProcess()

    if (this.child) {
      try {
        await this.execCli(['down'], 6000)
      } catch {
        // 未登录或核心未就绪时 down 可能失败，继续终止进程
      }
    }

    await this.stopChild()
    this.lastError = null
    return this.getStatus()
  }

  private async stopChild(): Promise<void> {
    this.stopLoginProcess()
    this.stopIpnWatch()
    const child = this.child
    if (!child) return
    this.child = null

    if (child.exitCode === null) {
      try {
        child.kill()
      } catch {
        // 忽略
      }

      for (let attempt = 0; attempt < 10 && child.exitCode === null; attempt += 1) {
        await delay(200)
      }

      if (child.exitCode === null && child.pid) {
        if (process.platform === 'win32') {
          try {
            execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
              stdio: 'ignore',
              windowsHide: true
            })
          } catch {
            // 忽略
          }
        } else {
          try {
            child.kill('SIGKILL')
          } catch {
            // 忽略
          }
        }
      }
    }

    this.appendLog('system', '核心已停止')
    this.clearPidFile()
  }

  /**
   * 清除登录信息与本地缓存：
   * 1) 核心在运行时先执行 `tailscale logout` 让服务端也解除节点绑定
   * 2) 停止核心进程
   * 3) 删除 state 目录（tailscaled.state、socket 等），相当于恢复出厂设置
   */
  async resetIdentity(): Promise<TailscaleStatus> {
    this.intentionalStop = true
    this.stopLoginProcess()
    this.loginUrl = null
    this.lastError = null

    if (this.child && this.child.exitCode === null) {
      try {
        await this.execCli(['logout'], 8000)
      } catch {
        // 未登录时 logout 会失败，本地状态照常清理
      }
    }

    this.killRecordedDaemon()
    await this.stopChild()
    this.intentionalStop = false

    try {
      rmSync(this.ensureStateDir(), { recursive: true, force: true })
    } catch (error) {
      this.lastError = `清除本地状态失败：${describeError(error)}`
      this.appendLog('system', this.lastError)
      return this.getStatus()
    }

    this.logs = []
    this.appendLog('system', '已清除本机 Tailscale 登录信息与状态缓存')
    return this.getStatus()
  }

  async autoStart(): Promise<void> {
    const settings = getStoredTailscaleSettings()
    if (!settings.autoStart) return
    try {
      await this.start()
    } catch (error) {
      this.appendLog('system', `自动启动失败：${describeError(error)}`)
    }
  }

  /**
   * 应用退出时关闭内置核心：
   * 先执行 `down` 让节点在服务端优雅离线，再终止子进程
   * （Windows 上使用 taskkill /T 清理 tailscaled 的进程树）。
   */
  async shutdown(): Promise<void> {
    this.intentionalStop = true
    this.loginUrl = null
    this.stopLoginProcess()

    // 先清理孤儿核心（应用上次被强杀时留下的进程）
    this.killRecordedDaemon()

    if (this.starting) {
      try {
        await this.starting
      } catch {
        // 启动失败的场景无需处理，下面统一收尾
      }
    }

    if (this.child && this.child.exitCode === null) {
      try {
        await this.execCli(['down'], 4000)
      } catch {
        // 未登录或核心未就绪时 down 会失败，直接终止进程
      }
    }

    await this.stopChild()
  }
}

export const tailscaleManager = new TailscaleManager()
