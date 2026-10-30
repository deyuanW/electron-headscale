<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h2>本机 Tailnet</h2>
        <p>
          使用随应用内置的 Tailscale 核心接入 Headscale，不依赖官方托盘界面；所有配置与启停都在这里完成。
        </p>
      </div>
      <div class="heading-actions">
        <span class="status-pill" :class="statusPillClass">
          <i></i>{{ store.stateLabel }}
        </span>
        <el-button :loading="store.loading" @click="store.refresh()">
          <el-icon><Refresh /></el-icon>
          <span>刷新状态</span>
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="!store.status.available"
      class="notice-alert"
      type="warning"
      :closable="false"
      show-icon
      title="未找到内置 Tailscale 核心"
      :description="`请将 ${platformHint} 放入 resources/tailscale 对应目录，或安装官方 Tailscale 后重试。`"
    />

    <el-alert
      v-else-if="store.error"
      class="notice-alert"
      type="error"
      :closable="false"
      show-icon
      :title="store.error"
    />

    <div class="tailnet-grid">
      <section class="surface panel">
        <div class="panel-head">
          <div>
            <h3>核心配置</h3>
            <p>认证密钥保存在主进程，不会回传到界面。</p>
          </div>
          <el-tag v-if="store.settings.hasAuthKey" type="success" effect="plain" size="small">
            密钥已保存
          </el-tag>
        </div>

        <el-form label-position="top" @submit.prevent>
          <el-form-item label="运行模式">
            <el-radio-group v-model="form.mode" class="mode-group">
              <el-radio-button value="userspace">用户态 · 免管理员</el-radio-button>
              <el-radio-button value="tun">系统 TUN · 需管理员</el-radio-button>
            </el-radio-group>
            <div class="hint">
              {{
                form.mode === 'userspace'
                  ? '用户态通过本地 SOCKS5 代理工作，不接管系统流量，不需要管理员权限。'
                  : '系统 TUN 会创建虚拟网卡并接管路由，支持入站、SSH、子网路由；Windows 需管理员身份运行本应用，且不能与官方 Tailscale 同时运行（Wintun 网卡冲突）。'
              }}
            </div>
          </el-form-item>

          <el-form-item label="Headscale 控制面地址">
            <el-input v-model="form.controlUrl" placeholder="https://headscale.example.com" clearable>
              <template #prefix>
                <el-icon><Link /></el-icon>
              </template>
            </el-input>
            <div class="hint">
              留空时自动使用「连接配置」中的服务器地址；当前回退值：
              <code>{{ connection.serverUrl || '未配置' }}</code>
            </div>
          </el-form-item>

          <div class="form-grid">
            <el-form-item label="节点主机名">
              <el-input v-model="form.hostname" placeholder="留空使用系统主机名" clearable>
                <template #prefix>
                  <el-icon><Monitor /></el-icon>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item label="预认证密钥">
              <el-input
                v-model="form.authKey"
                type="password"
                show-password
                :placeholder="store.settings.hasAuthKey ? '已保存，留空保持不变' : 'hskey-auth-...'"
              >
                <template #prefix>
                  <el-icon><Key /></el-icon>
                </template>
              </el-input>
            </el-form-item>
          </div>

          <div class="hint auth-hint">
            未填写密钥时，启动后会生成 Headscale 登录链接，需要手动在浏览器完成授权。
          </div>

          <el-divider content-position="left">高级选项</el-divider>

          <div class="switch-list">
            <div class="switch-row">
              <div>
                <span class="switch-label">接受子网路由</span>
                <span class="switch-desc">使用其他节点通告的网段</span>
              </div>
              <el-switch v-model="form.acceptRoutes" />
            </div>

            <div class="switch-row">
              <div>
                <span class="switch-label">启用 Tailscale SSH</span>
                <span class="switch-desc">仅系统 TUN 模式生效，Windows 不支持作为 SSH 目标</span>
              </div>
              <el-switch v-model="form.enableSsh" :disabled="form.mode !== 'tun'" />
            </div>
          </div>

          <div class="form-grid advanced-grid">
            <el-form-item v-if="form.mode === 'userspace'" label="本地 SOCKS5 端口">
              <el-input-number
                v-model="form.socksPort"
                :min="1"
                :max="65535"
                :step="1"
                controls-position="right"
                class="full-width"
              />
              <div class="hint">代理地址：socks5://127.0.0.1:{{ form.socksPort }}</div>
            </el-form-item>

            <el-form-item label="使用退出节点">
              <el-input v-model="form.exitNode" placeholder="节点名或 100.x 地址" clearable />
            </el-form-item>

            <el-form-item label="通告子网路由">
              <el-input
                v-model="form.advertiseRoutes"
                placeholder="192.168.1.0/24,10.0.0.0/16"
                clearable
              />
              <div class="hint">多个网段用英文逗号分隔，保存后仍需在「路由管理」批准。</div>
            </el-form-item>
          </div>

          <div class="form-actions">
            <el-button :loading="store.action === 'save'" @click="handleSave">
              保存配置
            </el-button>
            <el-button
              type="primary"
              :loading="store.action === 'start'"
              :disabled="!store.status.available || store.action === 'stop'"
              @click="handleStart"
            >
              <el-icon><VideoPlay /></el-icon>
              <span>{{ store.running ? '应用并重连' : '启动核心' }}</span>
            </el-button>
            <el-button
              v-if="store.running"
              type="danger"
              plain
              :loading="store.action === 'stop'"
              @click="handleStop"
            >
              停止核心
            </el-button>
            <el-button
              text
              type="danger"
              :loading="store.action === 'reset'"
              :disabled="store.action !== null"
              @click="handleReset"
            >
              清除登录信息
            </el-button>
          </div>
        </el-form>
      </section>

      <aside class="side-column">
        <section class="surface panel status-panel">
          <div class="panel-head">
            <div>
              <h3>运行状态</h3>
              <p>核心 {{ store.status.coreVersion || '版本未知' }}</p>
            </div>
            <span class="core-dot" :class="coreDotClass"></span>
          </div>

          <dl class="status-list">
            <div>
              <dt>后端状态</dt>
              <dd class="mono">{{ store.status.backendState }}</dd>
            </div>
            <div>
              <dt>节点名称</dt>
              <dd>{{ store.status.nodeName || '—' }}</dd>
            </div>
            <div>
              <dt>MagicDNS</dt>
              <dd class="mono">{{ store.status.dnsName || '—' }}</dd>
            </div>
            <div>
              <dt>Tailscale IP</dt>
              <dd>
                <template v-if="store.status.ips.length">
                  <span v-for="ip in store.status.ips" :key="ip" class="ip-chip">{{ ip }}</span>
                </template>
                <span v-else>—</span>
              </dd>
            </div>
            <div>
              <dt>运行模式</dt>
              <dd>{{ store.status.mode === 'tun' ? '系统 TUN' : '用户态' }}</dd>
            </div>
            <div v-if="store.status.socksProxy">
              <dt>本地代理</dt>
              <dd class="copy-line">
                <code>{{ store.status.socksProxy }}</code>
                <el-button link type="primary" @click="copyText(store.status.socksProxy || '')">
                  复制
                </el-button>
              </dd>
            </div>
            <div>
              <dt>控制面</dt>
              <dd class="mono ellipsis" :title="store.status.controlUrl">
                {{ store.status.controlUrl || '—' }}
              </dd>
            </div>
            <div>
              <dt>核心路径</dt>
              <dd class="mono ellipsis" :title="store.status.binaryPath || ''">
                {{ store.status.binaryPath || '未找到' }}
              </dd>
            </div>
          </dl>

          <el-alert
            v-if="store.status.loginUrl"
            class="login-alert"
            type="warning"
            :closable="false"
            show-icon
            title="需要完成 Headscale 登录"
          >
            <el-button type="warning" size="small" @click="openLoginUrl">打开登录页</el-button>
          </el-alert>

          <div v-if="store.status.health.length" class="health-list">
            <div v-for="item in store.status.health" :key="item" class="health-item">
              <el-icon><WarningFilled /></el-icon>
              <span>{{ item }}</span>
            </div>
          </div>
        </section>

        <section class="surface panel tips-panel">
          <h3>说明</h3>
          <ul>
            <li>核心独立运行，不会启动官方 Tailscale 托盘程序。</li>
            <li>用户态模式适合浏览器 / 应用通过 SOCKS5 代理访问 Tailnet。</li>
            <li>系统 TUN 模式会修改系统路由，需要管理员或 root 权限。</li>
            <li>不要与已安装的 Tailscale 服务同时使用 TUN，避免虚拟网卡冲突。</li>
          </ul>
        </section>
      </aside>
    </div>

    <section v-if="store.status.peers.length" class="surface panel peers-panel">
      <div class="panel-head">
        <div>
          <h3>Tailnet 节点</h3>
          <p>共 {{ store.status.peers.length }} 个节点，{{ onlinePeers }} 个在线。</p>
        </div>
      </div>
      <el-table :data="store.status.peers" max-height="300" class="data-table peer-table">
        <el-table-column label="主机名" min-width="180">
          <template #default="{ row }">
            <div class="peer-name">{{ row.hostName }}</div>
            <div v-if="row.dnsName" class="peer-dns mono">{{ row.dnsName }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Tailscale IP" min-width="180">
          <template #default="{ row }">
            <span v-for="ip in row.ips" :key="ip" class="ip-chip">{{ ip }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="os" label="系统" width="110" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span class="status-pill" :class="row.online ? 'online' : 'offline'">
              <i></i>{{ row.online ? '在线' : '离线' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="出口节点" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.exitNode" size="small" type="warning" effect="plain">使用中</el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="surface panel log-panel">
      <div class="panel-head">
        <div>
          <h3>核心日志</h3>
          <p>最近 {{ store.logs.length }} 条，最多保留 500 条。</p>
        </div>
        <el-button text @click="store.clearLogs()">清空</el-button>
      </div>
      <pre ref="logBox" class="log-view">{{ logText }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { TailscaleSettingsInput } from '@shared/types/tailscale'
import { useTailscaleStore } from '@/stores/tailscale'
import { useConnectionStore } from '@/stores/connection'

const store = useTailscaleStore()
const connection = useConnectionStore()
const logBox = ref<HTMLElement | null>(null)

let timer: number | undefined

const form = reactive({
  autoStart: false,
  mode: 'userspace' as 'userspace' | 'tun',
  controlUrl: '',
  hostname: '',
  authKey: '',
  acceptRoutes: false,
  enableSsh: false,
  exitNode: '',
  advertiseRoutes: '',
  socksPort: 1055
})

const platformHint = computed(() =>
  processPlatform() === 'win32' ? 'win32-x64/tailscaled.exe 等文件' : '对应平台目录中的 tailscaled/tailscale'
)

const statusPillClass = computed(() => {
  if (!store.status.available) return 'offline'
  if (store.connected) return 'online'
  if (store.running) return 'pending'
  return 'offline'
})

const coreDotClass = computed(() => ({
  online: store.connected,
  pending: store.running && !store.connected,
  offline: !store.running
}))

const onlinePeers = computed(() => store.status.peers.filter((peer) => peer.online).length)

const logText = computed(() => {
  if (!store.logs.length) return '暂无日志'
  return store.logs
    .map((entry) => `[${formatTime(entry.time)}] ${entry.stream.toUpperCase().padEnd(6)} ${entry.text}`)
    .join('\n')
})

function processPlatform(): string {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('windows')) return 'win32'
  if (ua.includes('mac')) return 'darwin'
  return 'linux'
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function syncForm(): void {
  form.autoStart = store.settings.autoStart
  form.mode = store.settings.mode
  form.controlUrl = store.settings.controlUrl
  form.hostname = store.settings.hostname
  form.authKey = ''
  form.acceptRoutes = store.settings.acceptRoutes
  form.enableSsh = store.settings.enableSsh
  form.exitNode = store.settings.exitNode
  form.advertiseRoutes = store.settings.advertiseRoutes
  form.socksPort = store.settings.socksPort
}

function buildPayload(): TailscaleSettingsInput {
  return {
    autoStart: form.autoStart,
    mode: form.mode,
    controlUrl: form.controlUrl.trim(),
    hostname: form.hostname.trim(),
    authKey: form.authKey.trim() || undefined,
    acceptRoutes: form.acceptRoutes,
    enableSsh: form.enableSsh,
    exitNode: form.exitNode.trim(),
    advertiseRoutes: form.advertiseRoutes.trim(),
    socksPort: form.socksPort
  }
}

async function handleSave(): Promise<void> {
  const ok = await store.save(buildPayload())
  if (!ok) {
    ElMessage.error(store.error || '保存失败')
    return
  }
  form.authKey = ''
  syncForm()
  ElMessage.success(store.running ? '配置已保存，重新启动核心后生效' : '配置已保存')
}

async function handleStart(): Promise<void> {
  if (!form.controlUrl.trim() && connection.serverUrl) {
    form.controlUrl = connection.serverUrl
  }
  if (!form.controlUrl.trim()) {
    ElMessage.warning('请先填写 Headscale 控制面地址')
    return
  }

  const saved = await store.save(buildPayload())
  if (!saved) {
    ElMessage.error(store.error || '保存配置失败')
    return
  }
  form.authKey = ''

  const result = await store.start()
  if (result.error) {
    ElMessage.error(result.error)
    return
  }
  if (result.loginUrl) {
    ElMessage.warning('核心已启动，请完成浏览器登录')
    return
  }
  ElMessage.success(result.loggedIn ? '核心已连接' : '核心已启动')
}

async function handleStop(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '停止后本机将断开 Tailnet 连接，系统 TUN 模式还会移除虚拟网卡。确定继续？',
      '停止 Tailscale 核心',
      { type: 'warning', confirmButtonText: '停止', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  const result = await store.stop()
  if (result.error) {
    ElMessage.error(result.error)
  } else {
    ElMessage.success('核心已停止')
  }
}

async function handleReset(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将退出当前登录并删除本机 Tailscale 状态缓存（含登录凭证），之后需要重新登录。确定继续？',
      '清除登录信息',
      { type: 'warning', confirmButtonText: '清除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  const result = await store.reset()
  if (result.error) {
    ElMessage.error(result.error)
  } else {
    ElMessage.success('已清除登录信息与本地状态缓存')
  }
}

async function copyText(text: string): Promise<void> {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择文本')
  }
}

function openLoginUrl(): void {
  if (store.status.loginUrl) {
    window.open(store.status.loginUrl, '_blank')
  }
}

function scrollLogs(): void {
  void nextTick(() => {
    if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight
  })
}

watch(
  () => store.logs.length,
  () => scrollLogs()
)

onMounted(async () => {
  await store.initialize()
  syncForm()
  if (!form.controlUrl) form.controlUrl = connection.serverUrl
  scrollLogs()
  timer = window.setInterval(() => {
    if (!store.loading && !store.action) void store.refresh()
  }, 5000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
  store.dispose()
})
</script>

<style scoped>
.heading-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.notice-alert {
  margin-bottom: 16px;
}

.tailnet-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.75fr);
  gap: 16px;
  align-items: start;
}

.panel {
  padding: 20px 22px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-head h3 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 620;
}

.panel-head p {
  margin: 0;
  font-size: 12px;
  color: var(--hs-text-muted);
}

.side-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mode-group {
  width: 100%;
}

.mode-group :deep(.el-radio-button) {
  flex: 1;
}

.mode-group :deep(.el-radio-button__inner) {
  width: 100%;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.advanced-grid {
  margin-top: 14px;
}

.full-width {
  width: 100%;
}

.auth-hint {
  margin-top: -8px;
  margin-bottom: 4px;
}

.switch-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--hs-border);
}

.switch-row:last-child {
  border-bottom: none;
}

.switch-label {
  display: block;
  font-size: 13px;
  color: var(--hs-text);
}

.switch-desc {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--hs-text-muted);
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--hs-border);
}

.status-panel {
  position: relative;
}

.core-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-top: 6px;
  background: var(--hs-text-muted);
}

.core-dot.online {
  background: var(--hs-success);
  box-shadow: 0 0 0 4px var(--hs-success-soft);
}

.core-dot.pending {
  background: var(--hs-warning);
  box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.12);
}

.core-dot.offline {
  background: var(--hs-text-muted);
}

.status-list {
  margin: 0;
  display: flex;
  flex-direction: column;
}

.status-list > div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  font-size: 12.5px;
}

.status-list dt {
  color: var(--hs-text-muted);
  flex-shrink: 0;
}

.status-list dd {
  margin: 0;
  text-align: right;
  color: var(--hs-text);
  min-width: 0;
}

.copy-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 190px;
}

.login-alert {
  margin-top: 12px;
}

.health-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.health-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(217, 119, 6, 0.08);
  color: var(--hs-warning);
  font-size: 12px;
  line-height: 1.5;
}

.tips-panel h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.tips-panel ul {
  margin: 0;
  padding-left: 18px;
  color: var(--hs-text-secondary);
  font-size: 12.5px;
  line-height: 1.8;
}

.peers-panel,
.log-panel {
  margin-top: 16px;
}

.peer-table {
  box-shadow: none;
  border: 1px solid var(--hs-border);
}

.peer-name {
  font-weight: 550;
}

.peer-dns {
  font-size: 11.5px;
  color: var(--hs-text-muted);
  margin-top: 2px;
}

.log-view {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  padding: 14px 16px;
  border-radius: 10px;
  background: #0c1424;
  color: #c8d6f0;
  font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-all;
}

.status-pill.pending {
  color: var(--hs-warning);
  background: rgba(217, 119, 6, 0.1);
}

.status-pill.pending i {
  background: var(--hs-warning);
  box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.12);
}

@media (max-width: 1100px) {
  .tailnet-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
