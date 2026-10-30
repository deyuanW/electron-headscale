<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h2>设置</h2>
        <p>控制桌面客户端的启动方式与关闭行为，这些开关由主进程直接作用于系统。</p>
      </div>
    </div>

    <el-alert
      v-if="appSettings.error || tailscale.error"
      class="settings-alert"
      type="error"
      :closable="false"
      show-icon
      :title="appSettings.error || tailscale.error || ''"
    />

    <section v-loading="appSettings.loading" class="surface settings-panel">
      <div class="panel-head">
        <div>
          <h3>启动与运行</h3>
          <p>应用自身与内置 Tailscale 核心的启动策略</p>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-copy">
          <span class="setting-title">开机自启</span>
          <span class="setting-desc">
            {{ launchAtLoginDesc }}
          </span>
        </div>
        <el-switch
          :model-value="appSettings.settings.launchAtLogin"
          :disabled="!appSettings.settings.launchAtLoginSupported || appSettings.saving"
          @change="toggleLaunchAtLogin"
        />
      </div>

      <div class="setting-row">
        <div class="setting-copy">
          <span class="setting-title">Tailscale 自启动</span>
          <span class="setting-desc">
            应用启动时自动拉起内置 Tailscale 核心（当前状态：{{ tailscale.stateLabel }}）
          </span>
        </div>
        <el-switch
          :model-value="tailscale.settings.autoStart"
          :disabled="tailscaleSaving"
          @change="toggleTailscaleAutoStart"
        />
      </div>

      <div class="setting-row">
        <div class="setting-copy">
          <span class="setting-title">后台运行</span>
          <span class="setting-desc">
            关闭窗口后保留后台进程与托盘图标，Tailscale 连接不会中断
          </span>
        </div>
        <el-switch
          :model-value="appSettings.settings.runInBackground"
          :disabled="appSettings.saving"
          @change="toggleRunInBackground"
        />
      </div>

      <div class="setting-row setting-row-block">
        <div class="setting-copy">
          <span class="setting-title">关闭窗口时</span>
          <span class="setting-desc">
            {{
              appSettings.settings.runInBackground
                ? '选择点击窗口关闭按钮后的行为'
                : '未开启后台运行，关闭窗口将直接退出应用'
            }}
          </span>
        </div>
        <el-radio-group
          :model-value="appSettings.settings.closeAction"
          :disabled="!appSettings.settings.runInBackground || appSettings.saving"
          @change="changeCloseAction"
        >
          <el-radio-button value="tray">最小化到托盘</el-radio-button>
          <el-radio-button value="quit">直接退出</el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="trayEnabled" class="tray-tip">
        <el-icon><CircleCheck /></el-icon>
        <span>托盘已启用：点击托盘图标可重新打开窗口，右键菜单可以退出应用。</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { AppSettings } from '@shared/types/settings'
import { useSettingsStore } from '@/stores/settings'
import { useTailscaleStore } from '@/stores/tailscale'

const appSettings = useSettingsStore()
const tailscale = useTailscaleStore()
const tailscaleSaving = ref(false)

const launchAtLoginDesc = computed(() =>
  appSettings.settings.launchAtLoginSupported
    ? '登录系统后自动启动 Headscale Desktop'
    : '当前系统暂不支持自动写入登录项，请手动添加到开机启动'
)

const trayEnabled = computed(
  () => appSettings.settings.runInBackground && appSettings.settings.closeAction === 'tray'
)

async function patch(partial: Partial<AppSettings>): Promise<void> {
  const ok = await appSettings.update(partial)
  if (ok) {
    ElMessage.success('设置已更新')
  } else if (appSettings.error) {
    ElMessage.error(appSettings.error)
  }
}

function toggleLaunchAtLogin(value: string | number | boolean): void {
  void patch({ launchAtLogin: Boolean(value) })
}

function toggleRunInBackground(value: string | number | boolean): void {
  void patch({ runInBackground: Boolean(value) })
}

function changeCloseAction(value: string | number | boolean): void {
  void patch({ closeAction: value === 'quit' ? 'quit' : 'tray' })
}

async function toggleTailscaleAutoStart(value: string | number | boolean): Promise<void> {
  tailscaleSaving.value = true
  const ok = await tailscale.save({
    ...tailscale.settings,
    autoStart: Boolean(value)
  })
  tailscaleSaving.value = false

  if (ok) {
    ElMessage.success('设置已更新')
  } else if (tailscale.error) {
    ElMessage.error(tailscale.error)
  }
}

onMounted(async () => {
  await Promise.all([appSettings.load(), tailscale.initialize()])
})

onBeforeUnmount(() => {
  tailscale.dispose()
})
</script>

<style scoped>
.page-heading {
  margin-bottom: 16px;
}

.settings-alert {
  margin-bottom: 14px;
}

.settings-panel {
  padding: 20px 22px;
  max-width: 880px;
}

.panel-head {
  margin-bottom: 6px;
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

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  border-bottom: 1px dashed var(--hs-border);
}

.setting-row-block {
  align-items: flex-start;
}

.setting-row:last-of-type {
  border-bottom: none;
}

.setting-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.setting-title {
  font-size: 13.5px;
  font-weight: 550;
}

.setting-desc {
  color: var(--hs-text-muted);
  font-size: 12px;
  line-height: 1.55;
}

.tray-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--hs-accent-soft);
  color: var(--hs-text-secondary);
  font-size: 12px;
}

.tray-tip .el-icon {
  color: var(--hs-accent);
  flex-shrink: 0;
}

@media (max-width: 760px) {
  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
}
</style>
