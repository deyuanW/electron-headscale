<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h2>用户管理</h2>
        <p>创建、重命名或删除 Headscale 用户（节点归属以用户为维度划分）。</p>
      </div>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>
        <span>新建用户</span>
      </el-button>
    </div>

    <template v-if="connection.configured">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input v-model="search" placeholder="搜索用户名" clearable class="search-input">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
        <div class="toolbar-right">
          <span class="count-text">共 {{ filteredUsers.length }} 个用户</span>
          <el-button :loading="usersStore.loading" @click="refresh">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
        </div>
      </div>

      <el-alert
        v-if="usersStore.error"
        class="notice-alert"
        type="error"
        :closable="false"
        show-icon
        :title="usersStore.error"
      />

      <el-table
        v-loading="usersStore.loading"
        :data="filteredUsers"
        :row-key="userRowKey"
        class="data-table surface"
      >
        <el-table-column prop="id" label="ID" width="90" />

        <el-table-column label="用户名" min-width="200">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :size="26" class="user-avatar">
                {{ row.name.slice(0, 1).toUpperCase() }}
              </el-avatar>
              <div>
                <div class="user-name">{{ row.name }}</div>
                <div v-if="row.displayName && row.displayName !== row.name" class="muted small">
                  {{ row.displayName }}
                </div>
                <div v-if="row.email" class="muted small">{{ row.email }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">
            <span class="muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="节点数" width="110">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ nodeCount(row) }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openRename(row)">重命名</el-button>
            <el-button
              link
              type="danger"
              :loading="busyName === row.name"
              @click="removeUser(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty description="暂无用户，先创建一个吧" :image-size="88" />
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

    <el-dialog v-model="createVisible" title="新建用户" width="440px" :close-on-click-modal="false">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="用户名">
          <el-input
            v-model="createName"
            maxlength="63"
            show-word-limit
            placeholder="例如 alice"
            @keyup.enter="submitCreate"
          />
        </el-form-item>
        <div class="hint">用户名创建后仍可重命名；节点注册时会归属到对应用户。</div>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="renameDialog.visible"
      title="重命名用户"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="新用户名">
          <el-input
            v-model="renameDialog.value"
            maxlength="63"
            show-word-limit
            @keyup.enter="submitRename"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="renaming" @click="submitRename">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { HeadscaleUser } from '@shared/types/headscale'
import * as userApi from '@/api/users'
import { useConnectionStore } from '@/stores/connection'
import { useNodesStore } from '@/stores/nodes'
import { useUsersStore } from '@/stores/users'
import { formatDateTime } from '@/utils/format'
import { showApiError } from '@/utils/message'

const router = useRouter()
const connection = useConnectionStore()
const usersStore = useUsersStore()
const nodesStore = useNodesStore()

const search = ref('')
const createVisible = ref(false)
const createName = ref('')
const creating = ref(false)
const renaming = ref(false)
const busyName = ref<string | null>(null)

const renameDialog = reactive({
  visible: false,
  user: null as HeadscaleUser | null,
  value: ''
})

const filteredUsers = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return usersStore.users
  return usersStore.users.filter((user) => user.name.toLowerCase().includes(keyword))
})

function nodeCount(user: HeadscaleUser): number {
  return nodesStore.nodes.filter(
    (node) => node.user?.id === user.id || node.user?.name === user.name
  ).length
}

function userRowKey(user: HeadscaleUser): string {
  return user.id || user.name
}

function validateName(name: string, label: string): string | null {
  const value = name.trim()
  if (!value) return `请输入${label}`
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,62}$/.test(value)) {
    return `${label}只能包含字母、数字、下划线、点、@ 或短横线，且需以字母或数字开头`
  }
  return null
}

async function refresh(): Promise<void> {
  if (!connection.configured) return
  await Promise.all([usersStore.fetchUsers(), nodesStore.fetchNodes()])
}

watch(
  () => connection.configured,
  (configured) => {
    if (configured) void refresh()
  },
  { immediate: true }
)

function openCreate(): void {
  createName.value = ''
  createVisible.value = true
}

async function submitCreate(): Promise<void> {
  const message = validateName(createName.value, '用户名')
  if (message) {
    ElMessage.warning(message)
    return
  }

  creating.value = true
  try {
    await userApi.createUser(createName.value.trim())
    ElMessage.success('用户已创建')
    createVisible.value = false
    await usersStore.fetchUsers()
  } catch (error) {
    showApiError(error, '创建用户失败')
  } finally {
    creating.value = false
  }
}

function openRename(user: HeadscaleUser): void {
  renameDialog.user = user
  renameDialog.value = user.name
  renameDialog.visible = true
}

async function submitRename(): Promise<void> {
  const user = renameDialog.user
  if (!user) return

  const message = validateName(renameDialog.value, '用户名')
  if (message) {
    ElMessage.warning(message)
    return
  }

  const newName = renameDialog.value.trim()
  if (newName === user.name) {
    renameDialog.visible = false
    return
  }

  renaming.value = true
  try {
    await userApi.renameUser(user.name, newName)
    ElMessage.success('用户已重命名')
    renameDialog.visible = false
    await refresh()
  } catch (error) {
    showApiError(error, '重命名用户失败')
  } finally {
    renaming.value = false
  }
}

async function removeUser(user: HeadscaleUser): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除用户「${user.name}」后无法恢复。\n若该用户仍拥有节点，服务端可能拒绝删除，请先移除其节点。`,
      '删除用户',
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

  busyName.value = user.name
  try {
    await userApi.deleteUser(user.name)
    ElMessage.success('用户已删除')
    await refresh()
  } catch (error) {
    showApiError(error, '删除用户失败')
  } finally {
    busyName.value = null
  }
}
</script>

<style scoped>
.search-input {
  width: 260px;
}

.notice-alert {
  margin-bottom: 14px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  background: var(--hs-accent-soft);
  color: var(--hs-accent);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-name {
  font-weight: 550;
  line-height: 1.4;
}

.small {
  font-size: 12px;
}

.empty-panel {
  padding: 40px 0;
}
</style>
