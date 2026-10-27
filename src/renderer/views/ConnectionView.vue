<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h2>连接 Headscale</h2>
        <p>填写控制面地址与 API Key，桌面端将通过 /api/v1 直连你的 Headscale 服务。</p>
      </div>
      <el-tag :type="statusTagType" effect="light" round>{{ statusLabel }}</el-tag>
    </div>

    <div class="connection-grid">
      <section class="surface form-panel">
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="服务器地址">
            <el-input
              v-model="form.serverUrl"
              placeholder="https://headscale.example.com"
              clearable
              size="large"
            >
              <template #prefix>
                <el-icon><Link /></el-icon>
              </template>
            </el-input>
            <div class="hint">
              支持只填域名（自动补全 https://）；误填的 <code>/api/v1</code> 后缀会自动去掉。
            </div>
          </el-form-item>

          <el-form-item label="API Key">
            <el-input
              v-model="form.apiKey"
              type="password"
              show-password
              size="large"
              :placeholder="connection.hasApiKey ? '已保存，留空则保持不变' : 'headscale apikeys create 生成的密钥'"
              @keyup.enter="handleTest"
            >
              <template #prefix>
                <el-icon><Key /></el-icon>
              </template>
            </el-input>
            <div class="hint">
              在服务器上执行 <code>headscale apikeys create</code> 获取。密钥使用 electron-store
              保存在本机用户目录，渲染进程只能获知「是否已配置」。
            </div>
          </el-form-item>

          <div class="actions">
            <el-button :loading="connection.testing" @click="handleTest">
              <el-icon><Connection /></el-icon>
              <span>测试连接</span>
            </el-button>
            <el-button type="primary" :loading="saving" @click="handleSave">
              保存并连接
            </el-button>
            <el-button
              text
              type="danger"
              :disabled="!connection.configured"
              @click="handleClear"
            >
              清除配置
            </el-button>
          </div>
        </el-form>

        <el-alert
          v-if="connection.error"
          class="status-alert"
          type="error"
          :closable="false"
          show-icon
          :title="connection.error"
        />
        <el-alert
          v-else-if="connection.connected"
          class="status-alert"
          type="success"
          :closable="false"
          show-icon
          :title="`连接正常，API 响应耗时约 ${connection.latencyMs ?? 0} ms`"
        />
      </section>

      <aside class="side-column">
        <section class="surface status-card">
          <h3>当前连接</h3>
          <dl class="status-list">
            <div>
              <dt>服务端</dt>
              <dd class="mono">{{ connection.serverUrl || '—' }}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>
                <span class="status-pill" :class="connection.connected ? 'online' : 'offline'">
                  <i></i>{{ connection.connected ? '已连接' : '未连接' }}
                </span>
              </dd>
            </div>
            <div>
              <dt>Headscale 版本</dt>
              <dd>{{ connection.version || '—' }}</dd>
            </div>
            <div>
              <dt>API Key</dt>
              <dd>{{ connection.hasApiKey ? '已保存' : '未配置' }}</dd>
            </div>
          </dl>
        </section>

        <section class="surface tips-card">
          <h3>连接提示</h3>
          <ul>
            <li>服务器需要开启并暴露 Headscale 的 HTTP API。</li>
            <li>自签名证书需先加入系统信任列表，否则请求会被拒绝。</li>
            <li>API Key 默认 90 天过期，可在服务端执行 <code>headscale apikeys list</code> 查看。</li>
            <li>网络请求由主进程发出，不受浏览器 CORS 限制。</li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConnectionStore } from '@/stores/connection'
import { showApiError } from '@/utils/message'

const connection = useConnectionStore()

const form = reactive({
  serverUrl: '',
  apiKey: ''
})
const saving = ref(false)

const statusLabel = computed(() => {
  if (!connection.configured) return '未配置'
  if (connection.testing) return '检测中'
  return connection.connected ? '已连接' : '未连接'
})

const statusTagType = computed<'success' | 'danger' | 'info' | 'warning'>(() => {
  if (!connection.configured) return 'info'
  if (connection.testing) return 'warning'
  return connection.connected ? 'success' : 'danger'
})

function validate(): string | null {
  const serverUrl = form.serverUrl.trim()
  if (!serverUrl) return '请输入服务器地址'
  if (!/^(https?:\/\/)?[\w.-]+(:\d+)?(\/.*)?$/i.test(serverUrl)) {
    return '服务器地址格式不正确，例如 https://headscale.example.com'
  }
  if (!form.apiKey.trim() && !connection.hasApiKey) {
    return '请输入 API Key'
  }
  return null
}

async function handleTest(): Promise<void> {
  const message = validate()
  if (message) {
    ElMessage.warning(message)
    return
  }

  const ok = await connection.test({
    serverUrl: form.serverUrl.trim(),
    apiKey: form.apiKey.trim() || undefined
  })

  if (ok) {
    ElMessage.success('连接成功，凭据有效')
  } else {
    showApiError(connection.error, '连接失败')
  }
}

async function handleSave(): Promise<void> {
  const message = validate()
  if (message) {
    ElMessage.warning(message)
    return
  }

  saving.value = true
  try {
    const ok = await connection.save({
      serverUrl: form.serverUrl.trim(),
      apiKey: form.apiKey.trim() || undefined
    })

    if (ok) {
      form.apiKey = ''
      form.serverUrl = connection.serverUrl
      ElMessage.success('配置已保存，连接正常')
    } else {
      showApiError(connection.error, '配置已保存，但连接失败')
    }
  } finally {
    saving.value = false
  }
}

async function handleClear(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '清除后将删除本机保存的服务器地址与 API Key，需要重新配置才能继续管理。',
      '清除连接配置',
      {
        type: 'warning',
        confirmButtonText: '清除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    )
  } catch {
    return
  }

  await connection.clear()
  form.serverUrl = ''
  form.apiKey = ''
  ElMessage.success('本地配置已清除')
}

onMounted(async () => {
  await connection.loadConfig()
  form.serverUrl = connection.serverUrl
})

// 保存后主进程会规范化地址（补 https、去 /api/v1），这里同步回表单
watch(
  () => connection.serverUrl,
  (value) => {
    if (value && !form.serverUrl) form.serverUrl = value
  }
)
</script>

<style scoped>
.connection-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, 0.9fr);
  gap: 20px;
  align-items: start;
}

.form-panel {
  padding: 26px 28px 24px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.status-alert {
  margin-top: 20px;
}

.side-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-card,
.tips-card {
  padding: 20px 22px;
}

.status-card h3,
.tips-card h3 {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
}

.status-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--hs-border);
}

.status-list > div:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.status-list dt {
  color: var(--hs-text-secondary);
  font-size: 13px;
  flex-shrink: 0;
}

.status-list dd {
  margin: 0;
  font-size: 13px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tips-card ul {
  margin: 0;
  padding-left: 18px;
  color: var(--hs-text-secondary);
  font-size: 12.5px;
  line-height: 1.9;
}

.tips-card code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--hs-panel-soft);
  border: 1px solid var(--hs-border);
  font-size: 11.5px;
}

@media (max-width: 1100px) {
  .connection-grid {
    grid-template-columns: 1fr;
  }
}
</style>
