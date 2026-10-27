<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h2>节点管理</h2>
        <p>查看节点状态、重命名或移除节点，并批准 / 禁用节点通告的子网路由。</p>
      </div>
      <span class="count-text">最近更新：{{ updatedAtText }}</span>
    </div>

    <template v-if="connection.configured">
      <div class="stats-row">
        <div class="surface stat-tile">
          <span class="stat-label">节点总数</span>
          <strong class="stat-value">{{ nodesStore.nodes.length }}</strong>
        </div>
        <div class="surface stat-tile">
          <span class="stat-label">在线</span>
          <strong class="stat-value success">{{ nodesStore.onlineCount }}</strong>
        </div>
        <div class="surface stat-tile">
          <span class="stat-label">离线</span>
          <strong class="stat-value">{{ nodesStore.offlineCount }}</strong>
        </div>
        <div class="surface stat-tile">
          <span class="stat-label">已批准路由</span>
          <strong class="stat-value">{{ nodesStore.approvedRouteCount }}</strong>
        </div>
      </div>

      <div class="toolbar">
        <div class="toolbar-left">
          <el-input v-model="search" placeholder="搜索主机名 / IP / 用户" clearable class="search-input">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="status" class="status-select">
            <el-option label="全部状态" value="all" />
            <el-option label="在线" value="online" />
            <el-option label="离线" value="offline" />
          </el-select>
        </div>
        <div class="toolbar-right">
          <span class="count-text">显示 {{ filteredNodes.length }} 个节点</span>
          <el-button :loading="nodesStore.loading" @click="refresh">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
        </div>
      </div>

      <el-alert
        v-if="nodesStore.error"
        class="error-alert"
        type="error"
        :closable="false"
        show-icon
        :title="nodesStore.error"
      />

      <el-table
        v-loading="nodesStore.loading"
        :data="filteredNodes"
        row-key="id"
        class="data-table surface"
        :row-class-name="() => 'node-row'"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="route-panel">
              <div class="route-panel-title">
                <span>通告的子网路由</span>
                <span class="muted">
                  已批准 {{ row.approvedRoutes.length }} / 共 {{ routesOf(row).length }}
                </span>
              </div>

              <div v-if="routesOf(row).length === 0" class="route-empty">
                该节点未通告任何子网路由
              </div>

              <div
                v-for="route in routesOf(row)"
                :key="route.prefix"
                class="route-row"
              >
                <code class="route-prefix">{{ route.prefix }}</code>
                <el-tag
                  size="small"
                  :type="route.approved ? 'success' : 'info'"
                  effect="light"
                >
                  {{ route.approved ? '已批准' : '待批准' }}
                </el-tag>
                <el-tag v-if="!route.routeId" size="small" type="warning" effect="plain">
                  无路由 ID
                </el-tag>

                <div class="route-actions">
                  <el-button
                    v-if="!route.approved"
                    size="small"
                    type="primary"
                    plain
                    :loading="busyKey === routeKey(row, route)"
                    @click="approveRoute(row, route)"
                  >
                    批准路由
                  </el-button>
                  <el-tooltip
                    v-else
                    :disabled="Boolean(route.routeId)"
                    content="当前服务端未返回路由 ID，无法调用禁用接口"
                    placement="top"
                  >
                    <span>
                      <el-button
                        size="small"
                        type="danger"
                        plain
                        :disabled="!route.routeId"
                        :loading="busyKey === routeKey(row, route)"
                        @click="disableRoute(row, route)"
                      >
                        禁用路由
                      </el-button>
                    </span>
                  </el-tooltip>
                </div>
              </div>

              <div class="route-panel-footer">
                <span v-if="!routesStore.supported" class="muted">
                  当前服务端未提供路由 ID 列表接口，已根据节点数据推导路由。
                </span>
                <el-button
                  v-if="pendingRoutes(row).length"
                  size="small"
                  text
                  type="primary"
                  :loading="busyKey === `approve-all-${row.id}`"
                  @click="approveAllRoutes(row)"
                >
                  批准全部待批准路由（{{ pendingRoutes(row).length }}）
                </el-button>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="id" label="ID" width="72" />

        <el-table-column label="主机名" min-width="190">
          <template #default="{ row }">
            <div class="node-name">{{ row.name }}</div>
            <div v-if="row.hostname && row.hostname !== row.name" class="node-host">
              {{ row.hostname }}
            </div>
            <div v-if="row.tags.length" class="node-tags">
              <el-tag v-for="tag in row.tags" :key="tag" size="small" effect="plain">
                {{ tag }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="IP 地址" min-width="180">
          <template #default="{ row }">
            <span v-if="!row.ipAddresses.length" class="muted">—</span>
            <span v-for="ip in row.ipAddresses" :key="ip" class="ip-chip">{{ ip }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span class="status-pill" :class="row.online ? 'online' : 'offline'">
              <i></i>{{ row.online ? '在线' : '离线' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="最后在线" width="130">
          <template #default="{ row }">
            <el-tooltip :content="formatDateTime(row.lastSeen)" placement="top">
              <span>{{ formatRelative(row.lastSeen) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>

        <el-table-column label="操作系统" width="130">
          <template #default="{ row }">
            <span :class="{ muted: !row.os }">{{ row.os || '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="用户" width="110">
          <template #default="{ row }">
            {{ row.user?.name || '—' }}
          </template>
        </el-table-column>

        <el-table-column label="路由" width="150">
          <template #default="{ row }">
            <div class="route-summary">
              <el-tag
                v-if="row.approvedRoutes.length"
                size="small"
                type="success"
                effect="light"
              >
                {{ row.approvedRoutes.length }} 已批准
              </el-tag>
              <el-tag
                v-if="pendingRoutes(row).length"
                size="small"
                type="warning"
                effect="light"
              >
                {{ pendingRoutes(row).length }} 待批准
              </el-tag>
              <span v-if="!routesOf(row).length" class="muted">—</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="168" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button link type="primary" @click="openRename(row)">重命名</el-button>
              <el-dropdown trigger="click" @command="handleCommand($event, row)">
                <el-button link>
                  更多
                  <el-icon><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      command="approve-all"
                      :disabled="pendingRoutes(row).length === 0"
                    >
                      批准全部路由
                    </el-dropdown-item>
                    <el-dropdown-item command="expire">节点过期</el-dropdown-item>
                    <el-dropdown-item command="delete" divided>删除节点</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty
            :description="nodesStore.loaded ? '没有匹配的节点' : '暂无节点数据'"
            :image-size="88"
          >
            <el-button @click="refresh">刷新</el-button>
          </el-empty>
        </template>
      </el-table>
    </template>

    <section v-else class="surface empty-panel">
      <el-empty description="尚未配置 Headscale 连接" :image-size="96">
        <el-button type="primary" @click="router.push({ name: 'connection' })">
          前往连接配置
        </el-button>
      </el-empty>
    </section>

    <el-dialog
      v-model="renameDialog.visible"
      title="重命名节点"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="新名称">
          <el-input
            v-model="renameDialog.value"
            maxlength="63"
            show-word-limit
            placeholder="例如 macbook-pro"
            @keyup.enter="submitRename"
          />
        </el-form-item>
        <div class="hint">名称仅影响控制面展示，不会修改节点本地主机名。</div>
      </el-form>
      <template #footer>
        <el-button @click="renameDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="renaming" @click="submitRename">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { NodeResource } from '@shared/types/headscale'
import * as nodeApi from '@/api/nodes'
import * as routeApi from '@/api/routes'
import { useConnectionStore } from '@/stores/connection'
import { useNodesStore } from '@/stores/nodes'
import { useRoutesStore } from '@/stores/routes'
import { formatDateTime, formatRelative } from '@/utils/format'
import { showApiError } from '@/utils/message'

interface NodeRouteView {
  prefix: string
  approved: boolean
  routeId: string
}

const router = useRouter()
const connection = useConnectionStore()
const nodesStore = useNodesStore()
const routesStore = useRoutesStore()

const search = ref('')
const status = ref<'all' | 'online' | 'offline'>('all')
const busyKey = ref<string | null>(null)
const renaming = ref(false)
const lastUpdatedAt = ref<Date | null>(null)

const renameDialog = reactive({
  visible: false,
  node: null as NodeResource | null,
  value: ''
})

const updatedAtText = computed(() =>
  lastUpdatedAt.value ? formatDateTime(lastUpdatedAt.value.toISOString()) : '—'
)

const filteredNodes = computed(() => {
  const keyword = search.value.trim().toLowerCase()

  return nodesStore.nodes.filter((node) => {
    if (status.value === 'online' && !node.online) return false
    if (status.value === 'offline' && node.online) return false
    if (!keyword) return true

    const haystack = [
      node.name,
      node.hostname,
      node.user?.name ?? '',
      node.os ?? '',
      ...node.ipAddresses
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(keyword)
  })
})

function routesOf(node: NodeResource): NodeRouteView[] {
  const prefixes = Array.from(
    new Set([...node.availableRoutes, ...node.approvedRoutes])
  ).sort((left, right) => left.localeCompare(right))

  return prefixes.map((prefix) => ({
    prefix,
    approved: node.approvedRoutes.includes(prefix),
    routeId: routesStore.findRoute(node.id, prefix)?.id ?? ''
  }))
}

function pendingRoutes(node: NodeResource): string[] {
  return node.availableRoutes.filter((prefix) => !node.approvedRoutes.includes(prefix))
}

function routeKey(node: NodeResource, route: NodeRouteView): string {
  return `route-${node.id}-${route.prefix}`
}

async function refresh(): Promise<void> {
  if (!connection.configured) return

  await Promise.all([nodesStore.fetchNodes(), routesStore.fetchRoutes()])
  lastUpdatedAt.value = new Date()
}

watch(
  () => connection.configured,
  (configured) => {
    if (configured) void refresh()
  },
  { immediate: true }
)

onMounted(() => {
  // 从其他页面返回时也保持数据较新
  if (connection.configured && !nodesStore.loaded) void refresh()
})

function openRename(node: NodeResource): void {
  renameDialog.node = node
  renameDialog.value = node.name
  renameDialog.visible = true
}

async function submitRename(): Promise<void> {
  const node = renameDialog.node
  const newName = renameDialog.value.trim()

  if (!node) return
  if (!newName) {
    ElMessage.warning('请输入新的节点名称')
    return
  }
  if (newName === node.name) {
    renameDialog.visible = false
    return
  }

  renaming.value = true
  try {
    await nodeApi.renameNode(node.id, newName)
    ElMessage.success('节点已重命名')
    renameDialog.visible = false
    await refresh()
  } catch (error) {
    showApiError(error, '重命名失败')
  } finally {
    renaming.value = false
  }
}

async function approveAllRoutes(node: NodeResource): Promise<void> {
  const pending = pendingRoutes(node)
  if (!pending.length) {
    ElMessage.info('该节点没有待批准的路由')
    return
  }

  try {
    await ElMessageBox.confirm(
      `将为「${node.name}」批准 ${pending.length} 条路由：\n${pending.join('、')}`,
      '批准全部路由',
      {
        type: 'info',
        confirmButtonText: '批准',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }

  busyKey.value = `approve-all-${node.id}`
  try {
    await nodeApi.approveNodeRoutes(node.id, [...node.approvedRoutes, ...pending])
    ElMessage.success('路由已批准')
    await refresh()
  } catch (error) {
    showApiError(error, '批准路由失败')
  } finally {
    busyKey.value = null
  }
}

async function approveRoute(node: NodeResource, route: NodeRouteView): Promise<void> {
  busyKey.value = routeKey(node, route)
  try {
    await nodeApi.approveNodeRoutes(node.id, [
      ...new Set([...node.approvedRoutes, route.prefix])
    ])
    ElMessage.success(`已批准路由 ${route.prefix}`)
    await refresh()
  } catch (error) {
    showApiError(error, '批准路由失败')
  } finally {
    busyKey.value = null
  }
}

async function disableRoute(node: NodeResource, route: NodeRouteView): Promise<void> {
  if (!route.routeId) {
    ElMessage.warning('当前服务端未返回路由 ID，无法调用禁用接口')
    return
  }

  try {
    await ElMessageBox.confirm(
      `禁用后「${route.prefix}」将不再通过节点「${node.name}」转发，可随时重新批准。`,
      '禁用路由',
      {
        type: 'warning',
        confirmButtonText: '禁用',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    )
  } catch {
    return
  }

  busyKey.value = routeKey(node, route)
  try {
    await routeApi.disableRoute(route.routeId)
    ElMessage.success(`已禁用路由 ${route.prefix}`)
    await refresh()
  } catch (error) {
    showApiError(error, '禁用路由失败')
  } finally {
    busyKey.value = null
  }
}

async function expireNode(node: NodeResource): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `「${node.name}」将立即过期并断开连接，需要重新注册才能再次加入网络。\n\n注意：Headscale 官方 API 仅支持立即过期，暂不支持指定未来的过期时间。`,
      '节点过期',
      {
        type: 'warning',
        confirmButtonText: '立即过期',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    )
  } catch {
    return
  }

  busyKey.value = `node-${node.id}`
  try {
    await nodeApi.expireNode(node.id)
    ElMessage.success('节点已过期')
    await refresh()
  } catch (error) {
    showApiError(error, '节点过期操作失败')
  } finally {
    busyKey.value = null
  }
}

async function deleteNode(node: NodeResource): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除节点「${node.name}」后无法恢复，其子网路由也会立即失效。`,
      '删除节点',
      {
        type: 'error',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    )
  } catch {
    return
  }

  busyKey.value = `node-${node.id}`
  try {
    await nodeApi.deleteNode(node.id)
    ElMessage.success('节点已删除')
    await refresh()
  } catch (error) {
    showApiError(error, '删除节点失败')
  } finally {
    busyKey.value = null
  }
}

function handleCommand(command: string, node: NodeResource): void {
  if (command === 'approve-all') void approveAllRoutes(node)
  if (command === 'expire') void expireNode(node)
  if (command === 'delete') void deleteNode(node)
}
</script>

<style scoped>
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.stat-tile {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label {
  font-size: 12.5px;
  color: var(--hs-text-secondary);
}

.stat-value {
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.5px;
  line-height: 1;
}

.stat-value.success {
  color: var(--hs-success);
}

.search-input {
  width: 260px;
}

.status-select {
  width: 128px;
}

.error-alert {
  margin-bottom: 14px;
}

.node-row {
  cursor: default;
}

.node-name {
  font-weight: 600;
  color: var(--hs-text);
  line-height: 1.4;
}

.node-host {
  font-size: 12px;
  color: var(--hs-text-muted);
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.node-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.node-tags :deep(.el-tag) {
  height: 18px;
  font-size: 11px;
}

.route-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.route-panel {
  padding: 12px 22px 16px 56px;
  background: var(--hs-panel-soft);
}

.route-panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--hs-text-secondary);
  margin-bottom: 10px;
}

.route-empty {
  font-size: 12.5px;
  color: var(--hs-text-muted);
  padding: 6px 0;
}

.route-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 6px;
  border: 1px solid var(--hs-border);
  border-radius: 10px;
  background: var(--hs-panel);
}

.route-prefix {
  font-size: 12.5px;
  color: var(--hs-text);
  min-width: 140px;
}

.route-actions {
  margin-left: auto;
}

.route-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.empty-panel {
  padding: 40px 0;
}

@media (max-width: 1200px) {
  .stats-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
