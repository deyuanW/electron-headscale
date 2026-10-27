<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h2>预认证密钥</h2>
        <p>使用预认证密钥可以让节点免交互注册，支持可复用与临时节点。</p>
      </div>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>
        <span>新建密钥</span>
      </el-button>
    </div>

    <template v-if="connection.configured">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-select
            v-model="selectedUser"
            placeholder="全部用户"
            clearable
            class="user-select"
            @change="handleUserFilterChange"
          >
            <el-option
              v-for="user in usersStore.users"
              :key="user.id || user.name"
              :label="user.name"
              :value="user.name"
            />
          </el-select>
          <el-input v-model="search" placeholder="搜索密钥或用户" clearable class="search-input">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
        <div class="toolbar-right">
          <span class="count-text">共 {{ filteredKeys.length }} 个密钥</span>
          <el-button :loading="keysStore.loading" @click="refresh">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
        </div>
      </div>

      <el-alert
        v-if="keysStore.error"
        class="notice-alert"
        type="error"
        :closable="false"
        show-icon
        :title="keysStore.error"
      />

      <el-table
        v-loading="keysStore.loading"
        :data="filteredKeys"
        :row-key="keyRowKey"
        class="data-table surface"
      >
        <el-table-column label="密钥" min-width="230">
          <template #default="{ row }">
            <el-tooltip content="完整密钥仅在创建时展示一次" placement="top">
              <code class="key-text">{{ maskKey(row.key) }}</code>
            </el-tooltip>
          </template>
        </el-table-column>

        <el-table-column label="用户" width="130">
          <template #default="{ row }">
            {{ row.user?.name || '—' }}
          </template>
        </el-table-column>

        <el-table-column label="可复用" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.reusable ? 'success' : 'info'" effect="plain">
              {{ row.reusable ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="临时节点" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.ephemeral ? 'warning' : 'info'" effect="plain">
              {{ row.ephemeral ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="keyStatus(row).type" effect="light">
              {{ keyStatus(row).label }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            <span class="muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="过期时间" width="160">
          <template #default="{ row }">
            <el-tooltip :content="formatDateTime(row.expiration)" placement="top">
              <span :class="{ muted: !row.expiration }">
                {{ row.expiration ? formatRelative(row.expiration) : '服务端默认' }}
              </span>
            </el-tooltip>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="danger"
              :loading="busyKey === row.key"
              :disabled="isExpired(row.expiration)"
              @click="revokeKey(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty description="暂无预认证密钥" :image-size="88">
            <el-button type="primary" @click="openCreate">新建密钥</el-button>
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
      v-model="createVisible"
      title="新建预认证密钥"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="所属用户">
          <el-select v-model="form.user" placeholder="选择用户" class="full-width">
            <el-option
              v-for="user in usersStore.users"
              :key="user.id || user.name"
              :label="user.name"
              :value="user.name"
            />
          </el-select>
          <div v-if="!usersStore.users.length" class="hint">
            还没有用户，请先在「用户管理」中创建。
          </div>
        </el-form-item>

        <el-form-item label="过期时间">
          <el-date-picker
            v-model="form.expiration"
            type="datetime"
            placeholder="不选则使用服务端默认（通常 1 小时）"
            class="full-width"
            :shortcuts="expirationShortcuts"
            :disabled-date="disablePastDate"
          />
        </el-form-item>

        <div class="switch-row">
          <div class="switch-item">
            <span>可复用</span>
            <el-switch v-model="form.reusable" />
            <span class="hint">允许同一密钥注册多个节点</span>
          </div>
          <div class="switch-item">
            <span>临时节点</span>
            <el-switch v-model="form.ephemeral" />
            <span class="hint">节点离线后自动从控制面移除</span>
          </div>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建密钥</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="createdKeyVisible"
      title="预认证密钥已创建"
      width="620px"
      :close-on-click-modal="false"
      @closed="createdKey = ''"
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="请立即复制保存：关闭本窗口后将无法再次查看完整密钥"
      />

      <div class="key-box">
        <code>{{ createdKey }}</code>
      </div>

      <div class="key-actions">
        <el-button type="primary" @click="copyCreatedKey">
          <el-icon><CopyDocument /></el-icon>
          <span>复制密钥</span>
        </el-button>
        <span v-if="createdKeyUser" class="muted">所属用户：{{ createdKeyUser }}</span>
      </div>

      <div class="hint">
        在节点上执行：
        <code>tailscale up --login-server={{ connection.serverUrl || 'https://headscale.example.com' }} --authkey=&lt;密钥&gt;</code>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { PreAuthKey } from '@shared/types/headscale'
import * as preAuthKeyApi from '@/api/preauthkeys'
import { useConnectionStore } from '@/stores/connection'
import { usePreAuthKeysStore } from '@/stores/preauthkeys'
import { useUsersStore } from '@/stores/users'
import { formatDateTime, formatRelative, isExpired, maskKey } from '@/utils/format'
import { showApiError } from '@/utils/message'

const router = useRouter()
const connection = useConnectionStore()
const usersStore = useUsersStore()
const keysStore = usePreAuthKeysStore()

const selectedUser = ref<string>('')
const search = ref('')
const createVisible = ref(false)
const creating = ref(false)
const busyKey = ref<string | null>(null)

const createdKeyVisible = ref(false)
const createdKey = ref('')
const createdKeyUser = ref('')

const form = reactive({
  user: '',
  reusable: false,
  ephemeral: false,
  expiration: null as Date | null
})

const expirationShortcuts = [
  { text: '1 小时后', value: () => new Date(Date.now() + 60 * 60 * 1000) },
  { text: '24 小时后', value: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  { text: '7 天后', value: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  { text: '30 天后', value: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
]

const filteredKeys = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return keysStore.keys

  return keysStore.keys.filter((key) => {
    const haystack = [key.key, key.user?.name ?? ''].join(' ').toLowerCase()
    return haystack.includes(keyword)
  })
})

function disablePastDate(date: Date): boolean {
  return date.getTime() < Date.now() - 24 * 60 * 60 * 1000
}

function keyRowKey(key: PreAuthKey): string {
  return key.id || key.key
}

function keyStatus(key: PreAuthKey): { label: string; type: 'success' | 'info' | 'danger' } {
  if (key.used) return { label: '已使用', type: 'info' }
  if (isExpired(key.expiration)) return { label: '已过期', type: 'danger' }
  return { label: '有效', type: 'success' }
}

async function refresh(): Promise<void> {
  if (!connection.configured) return
  await Promise.all([
    usersStore.fetchUsers(),
    keysStore.fetchKeys(selectedUser.value || undefined)
  ])
}

async function handleUserFilterChange(): Promise<void> {
  await keysStore.fetchKeys(selectedUser.value || undefined)
}

watch(
  () => connection.configured,
  (configured) => {
    if (configured) void refresh()
  },
  { immediate: true }
)

async function openCreate(): Promise<void> {
  if (!usersStore.users.length) {
    const ok = await usersStore.fetchUsers()
    if (!ok || !usersStore.users.length) {
      ElMessage.warning('请先在「用户管理」中创建用户')
      return
    }
  }

  form.user = selectedUser.value || usersStore.users[0]?.name || ''
  form.reusable = false
  form.ephemeral = false
  form.expiration = new Date(Date.now() + 24 * 60 * 60 * 1000)
  createVisible.value = true
}

async function submitCreate(): Promise<void> {
  if (!form.user) {
    ElMessage.warning('请选择所属用户')
    return
  }

  if (form.expiration && form.expiration.getTime() <= Date.now()) {
    ElMessage.warning('过期时间必须晚于当前时间')
    return
  }

  creating.value = true
  try {
    const created = await preAuthKeyApi.createPreAuthKey({
      user: form.user,
      reusable: form.reusable,
      ephemeral: form.ephemeral,
      // Headscale 使用 RFC3339 时间字符串
      expiration: form.expiration ? form.expiration.toISOString() : undefined
    })

    createVisible.value = false
    await refresh()

    if (created?.key) {
      createdKey.value = created.key
      createdKeyUser.value = created.user?.name || form.user
      createdKeyVisible.value = true
    } else {
      ElMessage.warning('密钥已创建，但服务端未返回密钥内容，请在列表中确认')
    }
  } catch (error) {
    showApiError(error, '创建密钥失败')
  } finally {
    creating.value = false
  }
}

async function copyCreatedKey(): Promise<void> {
  if (!createdKey.value) return

  try {
    await navigator.clipboard.writeText(createdKey.value)
    ElMessage.success('密钥已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动选中密钥复制')
  }
}

async function revokeKey(key: PreAuthKey): Promise<void> {
  const userName = key.user?.name || selectedUser.value
  if (!userName) {
    ElMessage.warning('无法确认密钥所属用户，请先按用户筛选后再操作')
    return
  }

  try {
    await ElMessageBox.confirm(
      '删除后该密钥将立即失效，已注册的节点不受影响。\n部分 Headscale 版本仅支持将密钥置为过期，操作结果会给出提示。',
      '删除预认证密钥',
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

  busyKey.value = key.key
  try {
    const result = await preAuthKeyApi.revokePreAuthKey(userName, key.key)
    if (result.mode === 'deleted') {
      ElMessage.success('密钥已删除')
    } else {
      ElMessage.warning('服务端不支持删除密钥，已将其置为过期')
    }
    await keysStore.fetchKeys(selectedUser.value || undefined)
  } catch (error) {
    showApiError(error, '删除密钥失败')
  } finally {
    busyKey.value = null
  }
}
</script>

<style scoped>
.user-select {
  width: 160px;
}

.search-input {
  width: 240px;
}

.notice-alert {
  margin-bottom: 14px;
}

.key-text {
  font-size: 12.5px;
  color: var(--hs-text-secondary);
}

.full-width {
  width: 100%;
}

.switch-row {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.switch-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.switch-item .hint {
  margin-top: 0;
}

.key-box {
  margin: 18px 0 14px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px dashed var(--hs-accent);
  background: var(--hs-accent-soft);
  word-break: break-all;
}

.key-box code {
  font-size: 13px;
  line-height: 1.7;
  color: var(--hs-text);
}

.key-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 8px;
}

.empty-panel {
  padding: 40px 0;
}
</style>
