import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ThemeMode } from '@shared/types/headscale'

const THEME_KEY = 'hs-theme'
const SIDEBAR_KEY = 'hs-sidebar-collapsed'

function readTheme(): ThemeMode {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export const useUiStore = defineStore('ui', () => {
  const theme = ref<ThemeMode>(readTheme())
  const sidebarCollapsed = ref(localStorage.getItem(SIDEBAR_KEY) === '1')
  const prefersDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)

  const resolvedTheme = computed<'light' | 'dark'>(() =>
    theme.value === 'light' || theme.value === 'dark'
      ? theme.value
      : prefersDark.value
        ? 'dark'
        : 'light'
  )
  const isDark = computed(() => resolvedTheme.value === 'dark')

  function applyTheme(): void {
    document.documentElement.classList.toggle('dark', isDark.value)
  }

  function setTheme(next: ThemeMode): void {
    theme.value = next
    localStorage.setItem(THEME_KEY, next)
    applyTheme()
  }

  function toggleTheme(): void {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
    localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed.value ? '1' : '0')
  }

  function initTheme(): void {
    applyTheme()

    // 跟随系统时，系统主题变化要实时生效
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (event) => {
        prefersDark.value = event.matches
        if (theme.value === 'system') applyTheme()
      })
  }

  return {
    theme,
    isDark,
    sidebarCollapsed,
    setTheme,
    toggleTheme,
    toggleSidebar,
    initTheme
  }
})
