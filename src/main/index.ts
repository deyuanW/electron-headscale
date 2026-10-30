import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { buildApplicationMenu } from './menu'
import { tailscaleManager } from './tailscale/manager'
import { createTray, destroyTray, isTrayActive } from './tray'
import {
  applyLaunchAtLogin,
  getAppSettings,
  setAppSettingsRuntimeListener,
  setTrayActive
} from './settings'
import type { AppSettings } from '../shared/types/settings'

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let cleaningUp = false
let appSettings: AppSettings = getAppSettings()

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** 托盘只在「后台运行」开启时存在，关闭窗口的行为在 close 事件里读取最新设置 */
function applyRuntimeSettings(settings: AppSettings): void {
  appSettings = settings

  if (settings.runInBackground) {
    createTray({
      show: showMainWindow,
      quit: () => {
        isQuitting = true
        app.quit()
      }
    })
  } else {
    destroyTray()
  }

  setTrayActive(isTrayActive())
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6fb',
    title: 'Headscale Desktop',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 安全基线：隔离上下文、禁用 Node 集成、开启沙箱
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 「后台运行 + 关闭到托盘」时拦截关闭，仅隐藏窗口；托盘菜单里的退出会走 app.quit()
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    if (appSettings.runInBackground && appSettings.closeAction === 'tray') {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // 外链一律用系统浏览器打开，禁止在应用内导航
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServerUrl = process.env['ELECTRON_RENDERER_URL']
    const isDevNavigation = devServerUrl ? url.startsWith(devServerUrl) : false
    if (!isDevNavigation) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) {
        void shell.openExternal(url)
      }
    }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 注意：这里没有使用 app.requestSingleInstanceLock()。
 * 在 Windows 上强制结束进程或覆盖升级后，曾出现残留单实例锁导致应用启动即静默退出的问题；
 * 本客户端允许多开，因此直接创建窗口，避免因锁状态异常无法启动。
 */
app.whenReady().then(() => {
  app.setAppUserModelId('com.headscale.desktop')

  setAppSettingsRuntimeListener(applyRuntimeSettings)
  registerIpcHandlers()
  buildApplicationMenu()
  createWindow()

  // 应用可能被升级或移动过，启动时按当前设置重新写入登录项
  applyLaunchAtLogin(appSettings.launchAtLogin)
  applyRuntimeSettings(appSettings)

  // 配置了「随应用启动」时异步拉起内置核心，不阻塞窗口显示
  void tailscaleManager.autoStart()

  app.on('activate', () => {
    showMainWindow()
  })
})

// 退出前先关闭内置 Tailscale 核心：down → 终止进程，最多等待 8 秒兜底退出
app.on('before-quit', (event) => {
  if (cleaningUp) return

  cleaningUp = true
  isQuitting = true
  event.preventDefault()
  destroyTray()

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 8000))
  void Promise.race([tailscaleManager.shutdown(), timeout]).finally(() => {
    app.exit(0)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
