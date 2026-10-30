<template>
  <div class="page overview">
    <section class="hero surface">
      <div class="hero-copy">
        <span class="eyebrow">CONTROL PLANE OVERVIEW</span>
        <h2>运行概览</h2>
        <p>集中查看 Headscale 控制面与内置 Tailscale 核心的运行情况。</p>
        <div class="hero-meta">
          <span class="status-pill" :class="connection.connected ? 'online' : 'offline'">
            <i></i>{{ connectionStatusText }}
          </span>
          <span class="meta-item">
            <el-icon><Clock /></el-icon>
            {{ lastUpdatedText }}
          </span>
        </div>
      </div>

      <div class="hero-actions">
        <el-button :loading="loading" @click="load(true)">
          <el-icon><Refresh /></el-icon>
          <span>刷新概览</span>
        </el-button>
        <el-button v-if="!connection.configured" type="primary" @click="router.push({ name: 'connection' })">
          配置连接
        </el-button>
        <el-button v-else type="primary" plain @click="router.push({ name: 'nodes' })">
          管理节点
        </el-button>
      </div>
    </section>

    <el-alert
      v-if="connection.error"
      class="overview-alert"
      type="error"
      :closable="false"
      show-icon
      :title="connection.error"
    />
    <el-alert
      v-else-if="dataErrors.length"
      class="overview-alert"
      type="warning"
      :closable="false"
      show-icon
      :title="`部分数据加载失败：${dataErrors[0]}`"
      :description="dataErrors.length > 1 ? `另有 ${dataErrors.length - 1} 项数据未成功加载` : undefined"
    />

    <div class="overview-grid">
      <section class="surface hs-card">
        <div class="hs-head">
          <div class="hs-title">
            <h3>Headscale 控制面</h3>
            <p>API 连接与服务端基础信息</p>
          </div>

          <div v-if="connection.configured" class="hs-metrics">
            <div class="hs-metric hs-metric-address">
              <span class="hs-metric-label">地址</span>
              <div class="hs-metric-value">
                <code class="ellipsis" :title="connection.serverUrl">{{ connection.serverUrl }}</code>
                <el-button link type="primary" @click="copyText(connection.serverUrl)">复制</el-button>
              </div>
            </div>
            <div class="hs-metric">
              <span class="hs-metric-label">连接状态</span>
              <span class="status-pill" :class="connection.connected ? 'online' : 'offline'">
                <i></i>{{ connectionStatusText }}
              </span>
            </div>
            <div class="hs-metric">
              <span class="hs-metric-label">版本</span>
              <strong class="hs-metric-strong">{{ connection.version || '—' }}</strong>
            </div>
            <div class="hs-metric">
              <span class="hs-metric-label">延迟</span>
              <strong class="hs-metric-strong">
                {{ connection.latencyMs != null ? `${connection.latencyMs} ms` : '—' }}
              </strong>
            </div>
          </div>
        </div>

        <div v-if="connection.configured" class="hs-stats">
          <div class="hs-stat">
            <span class="hs-stat-label">节点数</span>
            <strong class="hs-stat-value">{{ nodeTotal }}<small>个</small></strong>
            <span class="hs-stat-sub">{{ nodeOnline }} 在线 · {{ nodeOffline }} 离线</span>
          </div>
          <div class="hs-stat">
            <span class="hs-stat-label">用户</span>
            <strong class="hs-stat-value">{{ userTotal }}<small>个</small></strong>
            <span class="hs-stat-sub">已注册用户</span>
          </div>
          <div class="hs-stat">
            <span class="hs-stat-label">已批准路由</span>
            <strong class="hs-stat-value">{{ enabledRoutes }}<small>条</small></strong>
            <span class="hs-stat-sub">
              {{ pendingRoutes }} 条待批准 · 共 {{ routesStore.routes.length }} 条
            </span>
          </div>
        </div>

        <div v-else class="empty-state">
          <el-icon :size="24"><Connection /></el-icon>
          <p>还没有配置 Headscale 服务器</p>
          <el-button type="primary" @click="router.push({ name: 'connection' })">
            前往连接配置
          </el-button>
        </div>
      </section>

      <section class="surface panel panel-tailscale">
        <div class="panel-head">
          <div>
            <h3>本机 Tailscale</h3>
            <p>内置核心，不依赖官方托盘界面</p>
          </div>
          <span class="status-pill" :class="tailscaleClass">
            <i></i>{{ tailscale.stateLabel }}
          </span>
        </div>

        <div class="info-list">
          <div class="info-row">
            <span>核心版本</span>
            <strong>{{ tailscale.status.available ? tailscale.status.coreVersion || '未知' : '未找到' }}</strong>
          </div>
          <div class="info-row">
            <span>运行模式</span>
            <strong>{{ tailscale.status.mode === 'tun' ? '系统 TUN' : '用户态' }}</strong>
          </div>
          <div class="info-row">
            <span>后端状态</span>
            <strong>{{ tailscale.status.backendState }}</strong>
          </div>
          <div class="info-row">
            <span>节点名称</span>
            <strong>{{ tailscale.status.nodeName || '—' }}</strong>
          </div>
          <div class="info-row">
            <span>Tailscale IP</span>
            <div class="info-value">
              <template v-if="tailscale.status.ips.length">
                <span v-for="ip in tailscale.status.ips" :key="ip" class="ip-chip">{{ ip }}</span>
              </template>
              <strong v-else>—</strong>
            </div>
          </div>
          <div class="info-row">
            <span>Tailnet 节点</span>
            <strong>{{ tailscaleOnlinePeers }} / {{ tailscale.status.peers.length }} 在线</strong>
          </div>
          <div v-if="tailscale.status.socksProxy" class="info-row">
            <span>本地代理</span>
            <div class="info-value">
              <code class="ellipsis">{{ tailscale.status.socksProxy }}</code>
              <el-button link type="primary" @click="copyText(tailscale.status.socksProxy || '')">
                复制
              </el-button>
            </div>
          </div>
        </div>

        <div v-if="tailscale.status.loginUrl" class="login-strip">
          <span>需要完成 Headscale 登录授权</span>
          <el-button size="small" type="warning" @click="openLoginUrl">打开登录页</el-button>
        </div>

        <div class="panel-footer">
          <el-button text @click="router.push({ name: 'tailnet' })">
            打开本机 Tailnet 控制台
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
      </section>
    </div>

    <section class="surface panel quick-panel">
      <div class="panel-head">
        <div>
          <h3>快捷入口</h3>
          <p>常用管理操作</p>
        </div>
      </div>
      <div class="quick-grid">
        <RouterLink
          v-for="item in quickLinks"
          :key="item.name"
          :to="{ name: item.name }"
          class="quick-link"
        >
          <span class="quick-icon"><el-icon><component :is="item.icon" /></el-icon></span>
          <span class="quick-copy">
            <strong>{{ item.label }}</strong>
            <small>{{ item.description }}</small>
          </span>
          <el-icon class="quick-arrow"><ArrowRight /></el-icon>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { formatDateTime } from '@/utils/format'
import { useConnectionStore } from '@/stores/connection'
import { useNodesStore } from '@/stores/nodes'
import { useUsersStore } from '@/stores/users'
import { useRoutesStore } from '@/stores/routes'
import { usePolicyStore } from '@/stores/policy'
import { useTailscaleStore } from '@/stores/tailscale'

const router = useRouter()
const connection = useConnectionStore()
const nodesStore = useNodesStore()
const usersStore = useUsersStore()
const routesStore = useRoutesStore()
const policyStore = usePolicyStore()
const tailscale = useTailscaleStore()

const loading = ref(false)
const lastUpdated = ref<Date | null>(null)
let timer: number | undefined

const nodeTotal = computed(() => (connection.configured ? nodesStore.nodes.length : 0))
const nodeOnline = computed(() => (connection.configured ? nodesStore.onlineCount : 0))
const nodeOffline = computed(() => (connection.configured ? nodesStore.offlineCount : 0))
const userTotal = computed(() => (connection.configured ? usersStore.users.length : 0))
const pendingRoutes = computed(() =>
  connection.configured
    ? routesStore.routes.filter((route) => route.advertised && !route.enabled).length
    : 0
)
const enabledRoutes = computed(() =>
  connection.configured ? routesStore.routes.filter((route) => route.enabled).length : 0
)
const tailscaleOnlinePeers = computed(
  () => tailscale.status.peers.filter((peer) => peer.online).length
)

const connectionStatusText = computed(() => {
  if (connection.testing) return '检测中'
  if (connection.connected) return '控制面已连接'
  return connection.configured ? '控制面未连接' : '尚未配置'
})

const tailscaleClass = computed(() => {
  if (tailscale.connected) return 'online'
  if (tailscale.running) return 'pending'
  return 'offline'
})

const lastUpdatedText = computed(() =>
  lastUpdated.value ? `更新于 ${formatDateTime(lastUpdated.value.toISOString())}` : '尚未刷新'
)

const dataErrors = computed(() =>
  [nodesStore.error, usersStore.error, routesStore.error, policyStore.error].filter(
    (item): item is string => Boolean(item)
  )
)

const quickLinks = [
  { name: 'nodes', label: '节点管理', description: '重命名、过期、删除节点', icon: 'Monitor' },
  { name: 'tailnet', label: '本机 Tailnet', description: '启动内置 Tailscale 核心', icon: 'Cpu' },
  { name: 'routes', label: '路由管理', description: '批准或禁用子网路由', icon: 'Share' },
  { name: 'policy', label: 'ACL 策略', description: '图形化维护访问规则', icon: 'Lock' },
  { name: 'users', label: '用户管理', description: '创建与维护 Headscale 用户', icon: 'User' },
  { name: 'preauthkeys', label: '预认证密钥', description: '生成节点注册密钥', icon: 'Key' }
]

async function load(showMessage = false): Promise<void> {
  loading.value = true
  try {
    if (!connection.configured) {
      await connection.loadConfig()
    }

    const tasks: Promise<unknown>[] = [tailscale.initialize()]
    if (connection.configured) {
      tasks.push(
        connection.refreshStatus(),
        nodesStore.fetchNodes(),
        usersStore.fetchUsers(),
        routesStore.fetchRoutes(),
        policyStore.fetchPolicy()
      )
    } else {
      tasks.push(connection.refreshStatus())
    }

    await Promise.allSettled(tasks)
    lastUpdated.value = new Date()
    if (showMessage) ElMessage.success('概览已刷新')
  } finally {
    loading.value = false
  }
}

async function refreshLive(): Promise<void> {
  await Promise.allSettled([connection.refreshStatus(), tailscale.refresh()])
  lastUpdated.value = new Date()
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
  if (tailscale.status.loginUrl) {
    window.open(tailscale.status.loginUrl, '_blank')
  }
}

onMounted(async () => {
  await load()
  timer = window.setInterval(() => {
    if (!loading.value) void refreshLive()
  }, 20000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
  tailscale.dispose()
})
</script>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 24px 26px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--hs-accent) 8%, transparent), transparent 58%),
    var(--hs-panel);
}

.hero-copy {
  min-width: 0;
}

.eyebrow {
  display: inline-block;
  margin-bottom: 7px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 1.4px;
  color: var(--hs-accent);
}

.hero h2 {
  margin: 0 0 6px;
  font-size: 22px;
  letter-spacing: -0.4px;
}

.hero p {
  margin: 0;
  color: var(--hs-text-secondary);
  font-size: 13px;
}

.hero-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--hs-text-muted);
  font-size: 12px;
}

.meta-item code {
  color: var(--hs-text-secondary);
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.overview-alert {
  margin: 0;
}

.overview-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hs-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 22px;
}

.hs-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}

.hs-title {
  min-width: 0;
  flex-shrink: 0;
}

.hs-title h3 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 620;
}

.hs-title p {
  margin: 0;
  color: var(--hs-text-muted);
  font-size: 12px;
}

.hs-metrics {
  display: flex;
  align-items: stretch;
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
}

.hs-metric {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  padding: 0 20px;
  border-left: 1px solid var(--hs-border);
}

.hs-metric:first-child {
  border-left: none;
}

.hs-metric-address {
  flex: 1;
  min-width: 160px;
  max-width: 420px;
}

.hs-metric-label {
  color: var(--hs-text-muted);
  font-size: 11.5px;
  white-space: nowrap;
}

.hs-metric-value {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 24px;
}

.hs-metric-value .ellipsis {
  max-width: 100%;
}

.hs-metric-strong {
  font-size: 13px;
  font-weight: 550;
  line-height: 24px;
  white-space: nowrap;
}

.hs-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding-top: 16px;
  border-top: 1px solid var(--hs-border);
}

.hs-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 0 22px;
  border-left: 1px solid var(--hs-border);
}

.hs-stat:first-child {
  padding-left: 0;
  border-left: none;
}

.hs-stat-label {
  color: var(--hs-text-muted);
  font-size: 12px;
}

.hs-stat-value {
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: -0.5px;
}

.hs-stat-value small {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--hs-text-secondary);
}

.hs-stat-sub {
  color: var(--hs-text-secondary);
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel {
  display: flex;
  flex-direction: column;
  padding: 20px 22px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-head h3 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 620;
}

.panel-head p {
  margin: 0;
  color: var(--hs-text-muted);
  font-size: 12px;
}

.info-list {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.panel-tailscale .info-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 32px;
  align-content: start;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 34px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--hs-border);
  font-size: 12.5px;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row > span {
  color: var(--hs-text-muted);
  flex-shrink: 0;
}

.info-row strong {
  font-weight: 550;
  text-align: right;
  min-width: 0;
}

.info-value {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 230px;
}

.small {
  font-size: 11px;
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--hs-border);
}

.login-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: 9px;
  background: rgba(217, 119, 6, 0.08);
  color: var(--hs-warning);
  font-size: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 26px 10px;
  color: var(--hs-text-muted);
  text-align: center;
}

.empty-state p {
  margin: 0;
  font-size: 12.5px;
}

.quick-panel {
  margin-bottom: 4px;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.quick-link {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 13px;
  border: 1px solid var(--hs-border);
  border-radius: 11px;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.quick-link:hover {
  border-color: color-mix(in srgb, var(--hs-accent) 35%, var(--hs-border));
  background: var(--hs-panel-soft);
  transform: translateY(-1px);
}

.quick-icon {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--hs-accent);
  background: var(--hs-accent-soft);
}

.quick-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.quick-copy strong {
  font-size: 12.5px;
  font-weight: 550;
}

.quick-copy small {
  color: var(--hs-text-muted);
  font-size: 11px;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-arrow {
  color: var(--hs-text-muted);
}

@media (max-width: 1080px) {
  .hs-head {
    flex-direction: column;
    gap: 16px;
  }

  .hs-metrics {
    justify-content: flex-start;
    flex-wrap: wrap;
    row-gap: 12px;
  }

  .hs-metric-address {
    max-width: none;
    flex-basis: 100%;
  }
}

@media (max-width: 900px) {
  .hs-metrics {
    flex-direction: column;
    row-gap: 12px;
  }

  .hs-metric {
    padding: 0;
    border-left: none;
  }

  .hs-stats {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 14px;
  }

  .hs-stat {
    padding: 0;
    border-left: none;
  }
}

@media (max-width: 760px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .panel-tailscale .info-list,
  .quick-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
