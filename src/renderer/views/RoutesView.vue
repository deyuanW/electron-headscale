<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h2>路由管理</h2>
        <p>汇总所有节点通告的子网路由，批准后即可在 Tailnet 内转发对应网段。</p>
      </div>
      <span class="count-text">最近更新：{{ updatedAtText }}</span>
    </div>

    <template v-if="connection.configured">
      <div class="stats-row">
        <div class="surface stat-tile">
          <span class="stat-label">路由总数</span>
          <strong class="stat-value">{{ routesStore.routes.length }}</strong>
        </div>
        <div class="surface stat-tile">
          <span class="stat-label">已批准</span>
          <strong class="stat-value success">{{ enabledCount }}</strong>
        </div>
        <div class="surface stat-tile">
          <span class="stat-label">待批准</span>
          <strong class="stat-value warning">{{ routesStore.routes.length - enabledCount }}</strong>
        </div>
      </div>

      <el-alert
        v-if="!routesStore.supported"
        class="notice-alert"
        type="warning"
        :closable="false"
        show-icon
        title="当前 Headscale 版本未提供 /api/v1/routes 接口，已根据节点数据推导路由列表"
        description="由于拿不到路由 ID，启用 / 禁用操作不可用，请升级服务端或在节点管理页按网段批准路由。"
      />

      <div class="toolbar">
        <div class="toolbar-left">
          <el-input v-model="search" placeholder="搜索网段或节点" clearable class="search-input">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
        <div class="toolbar-right">
          <span class="count-text">显示 {{ filteredRoutes.length }} 条路由</span>
          <el-button :loading="routesStore.loading" @click="refresh">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
        </div>
      </div>

      <el-alert
        v-if="routesStore.error"
        class="notice-alert"
        type="error"
        :closable="false"
        show-icon
        :title="routesStore.error"
      />

      <el-table v-loading="routesStore.loading" :data="filteredRoutes" row-key="routeKey" class="data-table surface">
        <el-table-column label="路由 ID" width="100">
          <template #default="{ row }">
            <span :class="['mono', { muted: !row.id }]">{{ row.id || '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="所属节点" min-width="200">
          <template #default="{ row }">
            <div class="node-cell">
              <span class="node-name">{{ row.nodeName || '—' }}</span>
              <span v-if="row.nodeId" class="muted mono">#{{ row.nodeId }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="网段" min-width="180">
          <template #default="{ row }">
            <code class="prefix">{{ row.prefix }}</code>
          </template>
        </el-table-column>

        <el-table-column label="节点通告" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.advertised ? 'info' : 'warning'" effect="plain">
              {{ row.advertised ? '已通告' : '未通告' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="服务状态" width="130">
          <template #default="{ row }">
            <span class="status-pill" :class="row.enabled ? 'online' : 'offline'">
              <i></i>{{ row.enabled ? '正在服务' : '未批准' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="主路由" width="100">
          <template #default="{ row }">
            <span :class="{ muted: !row.isPrimary }">{{ row.isPrimary ? '是' : '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="!row.enabled"
              link
              type="primary"
              :loading="busyId === row.id && Boolean(row.id)"
              @click="approveRoute(row)"
            >
              批准
            </el-button>
            <el-tooltip
              v-else
              :disabled="Boolean(row.id)"
              content="缺少路由 ID，无法调用禁用接口"
              placement="top"
            >
              <span>
                <el-button
                  link
                  type="danger"
                  :disabled="!row.id"
                  :loading="busyId === row.id && Boolean(row.id)"
                  @click="disableRoute(row)"
                >
                  禁用
                </el-button>
              </span>
            </el-tooltip>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty description="暂无子网路由" :image-size="88">
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { RouteResource } from '@shared/types/headscale'
import * as nodeApi from '@/api/nodes'
import * as routeApi from '@/api/routes'
import { useConnectionStore } from '@/stores/connection'
import { useNodesStore } from '@/stores/nodes'
import { useRoutesStore } from '@/stores/routes'
import { formatDateTime } from '@/utils/format'
import { showApiError } from '@/utils/message'

const router = useRouter()
const connection = useConnectionStore()
const routesStore = useRoutesStore()
const nodesStore = useNodesStore()

const search = ref('')
const busyId = ref<string | null>(null)
const lastUpdatedAt = ref<Date | null>(null)

const updatedAtText = computed(() =>
  lastUpdatedAt.value ? formatDateTime(lastUpdatedAt.value.toISOString()) : '—'
)

const enabledCount = computed(() => routesStore.routes.filter((route) => route.enabled).length)

/** 老版本没有路由 ID 时，用节点 + 网段作为稳定 key */
const filteredRoutes = computed(() => {
  const keyword = search.value.trim().toLowerCase()

  return routesStore.routes
    .filter((route) => {
      if (!keyword) return true
      return (
        route.prefix.toLowerCase().includes(keyword) ||
        route.nodeName.toLowerCase().includes(keyword)
      )
    })
    .map((route) => ({
      ...route,
      routeKey: route.id || `${route.nodeId}:${route.prefix}`
    }))
})

async function refresh(): Promise<void> {
  if (!connection.configured) return

  await Promise.all([routesStore.fetchRoutes(), nodesStore.fetchNodes()])
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
  if (connection.configured && !nodesStore.loaded) void refresh()
})

async function approveRoute(route: RouteResource): Promise<void> {
  if (!route.nodeId) {
    ElMessage.warning('缺少节点 ID，无法批准该路由')
    return
  }

  busyId.value = route.id
  try {
    // 按节点批准路由：传该网段即可，服务端会把它加入 approvedRoutes
    await nodeApi.approveNodeRoutes(route.nodeId, [route.prefix])
    ElMessage.success(`已批准路由 ${route.prefix}`)
    await refresh()
  } catch (error) {
    showApiError(error, '批准路由失败')
  } finally {
    busyId.value = null
  }
}

async function disableRoute(route: RouteResource): Promise<void> {
  if (!route.id) {
    ElMessage.warning('当前服务端未返回路由 ID，无法调用禁用接口')
    return
  }

  try {
    await ElMessageBox.confirm(
      `禁用后「${route.prefix}」将不再通过节点「${route.nodeName}」转发，可随时重新批准。`,
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

  busyId.value = route.id
  try {
    await routeApi.disableRoute(route.id)
    ElMessage.success(`已禁用路由 ${route.prefix}`)
    await refresh()
  } catch (error) {
    showApiError(error, '禁用路由失败')
  } finally {
    busyId.value = null
  }
}
</script>

<style scoped>
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

.stat-value.warning {
  color: var(--hs-warning);
}

.search-input {
  width: 260px;
}

.notice-alert {
  margin-bottom: 14px;
}

.node-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.node-name {
  font-weight: 550;
}

.prefix {
  font-size: 12.5px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--hs-panel-soft);
  border: 1px solid var(--hs-border);
}

.empty-panel {
  padding: 40px 0;
}
</style>
