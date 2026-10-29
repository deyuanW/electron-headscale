<template>
  <div class="layout" :class="{ collapsed: ui.sidebarCollapsed }">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">HS</div>
        <div v-if="!ui.sidebarCollapsed" class="brand-text">
          <span class="brand-title">Headscale</span>
          <span class="brand-sub">Desktop Console</span>
        </div>
      </div>

      <nav class="nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="nav-item"
          :title="item.label"
        >
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
          <span v-if="!ui.sidebarCollapsed" class="nav-label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div v-if="!ui.sidebarCollapsed" class="sidebar-footer">
        <span class="footer-dot" :class="{ online: connection.connected }"></span>
        <span class="footer-text">{{ connection.configured ? connection.serverUrl : '尚未配置服务器' }}</span>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar-left">
          <el-tooltip :content="ui.sidebarCollapsed ? '展开侧栏' : '收起侧栏'" placement="bottom">
            <el-button text circle @click="ui.toggleSidebar()">
              <el-icon :size="18">
                <component :is="ui.sidebarCollapsed ? 'Expand' : 'Fold'" />
              </el-icon>
            </el-button>
          </el-tooltip>
        </div>

        <h1 class="topbar-title">{{ route.meta.title }}</h1>

        <div class="topbar-right">
          <button
            class="conn-chip"
            :class="statusClass"
            type="button"
            title="前往连接配置"
            @click="router.push({ name: 'connection' })"
          >
            <span class="conn-dot"></span>
            <span>{{ statusText }}</span>
            <span v-if="connection.version" class="conn-version">v{{ connection.version }}</span>
          </button>

          <el-tooltip :content="ui.isDark ? '切换到浅色主题' : '切换到深色主题'" placement="bottom">
            <el-button text circle @click="ui.toggleTheme()">
              <el-icon :size="18">
                <component :is="ui.isDark ? 'Sunny' : 'Moon'" />
              </el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </header>

      <main class="content">
        <RouterView v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'

const ui = useUiStore()
const connection = useConnectionStore()
const route = useRoute()
const router = useRouter()

const navItems = [
  { name: 'nodes', label: '节点管理', icon: 'Monitor' },
  { name: 'topology', label: '网络拓扑', icon: 'DataLine' },
  { name: 'routes', label: '路由管理', icon: 'Share' },
  { name: 'policy', label: 'ACL 策略', icon: 'Lock' },
  { name: 'users', label: '用户管理', icon: 'User' },
  { name: 'preauthkeys', label: '预认证密钥', icon: 'Key' },
  { name: 'connection', label: '连接配置', icon: 'Connection' }
]

const statusText = computed(() => {
  if (connection.testing) return '检测中'
  if (connection.connected) return '已连接'
  return connection.configured ? '未连接' : '未配置'
})

const statusClass = computed(() => ({
  'is-online': connection.connected,
  'is-offline': connection.configured && !connection.connected && !connection.testing,
  'is-idle': !connection.configured && !connection.connected
}))
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--hs-bg);
}

.sidebar {
  width: 232px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--hs-sidebar);
  color: #dbe4ff;
  transition: width 0.22s ease;
  overflow: hidden;
}

.collapsed .sidebar {
  width: 76px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px 20px 18px;
  min-height: 78px;
}

.collapsed .brand {
  padding: 22px 0 18px;
  justify-content: center;
}

.brand-mark {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: #fff;
  background: linear-gradient(135deg, #4f7cff, #8b5cf6);
  box-shadow: 0 6px 16px rgba(79, 124, 255, 0.35);
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  white-space: nowrap;
}

.brand-title {
  font-size: 15px;
  font-weight: 650;
  color: #f2f6ff;
  letter-spacing: 0.2px;
}

.brand-sub {
  font-size: 11px;
  color: rgba(219, 228, 255, 0.55);
  margin-top: 3px;
  letter-spacing: 0.3px;
}

.nav {
  flex: 1;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 42px;
  padding: 0 12px;
  border-radius: 9px;
  color: rgba(219, 228, 255, 0.72);
  font-size: 13.5px;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.collapsed .nav-item {
  justify-content: center;
  padding: 0;
}

.nav-item:hover {
  background: var(--hs-sidebar-hover);
  color: #fff;
}

.nav-item.router-link-active {
  background: var(--hs-sidebar-active);
  color: #fff;
  font-weight: 560;
  box-shadow: inset 2px 0 0 var(--hs-accent);
}

.collapsed .nav-item.router-link-active {
  box-shadow: inset 0 0 0 1px rgba(107, 143, 255, 0.35);
}

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11.5px;
  color: rgba(219, 228, 255, 0.5);
}

.footer-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #64748b;
  flex-shrink: 0;
}

.footer-dot.online {
  background: #34d399;
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.15);
}

.footer-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  position: relative;
  height: 62px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid var(--hs-border);
  background: color-mix(in srgb, var(--hs-panel) 88%, transparent);
  backdrop-filter: blur(10px);
  z-index: 10;
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 2;
}

.topbar-title {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--hs-text);
  pointer-events: none;
  white-space: nowrap;
}

.conn-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid var(--hs-border);
  background: var(--hs-panel-soft);
  color: var(--hs-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.conn-chip:hover {
  border-color: var(--hs-border-strong);
}

.conn-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--hs-text-muted);
}

.conn-chip.is-online {
  color: var(--hs-success);
  border-color: rgba(22, 163, 74, 0.28);
  background: var(--hs-success-soft);
}

.conn-chip.is-online .conn-dot {
  background: var(--hs-success);
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.14);
}

.conn-chip.is-offline {
  color: var(--hs-danger);
  border-color: rgba(220, 38, 38, 0.24);
  background: rgba(220, 38, 38, 0.06);
}

.conn-chip.is-offline .conn-dot {
  background: var(--hs-danger);
}

.conn-version {
  padding-left: 7px;
  border-left: 1px solid currentColor;
  opacity: 0.7;
  font-size: 11px;
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
