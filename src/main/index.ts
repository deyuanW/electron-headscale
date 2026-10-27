import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { buildApplicationMenu } from './menu'

let mainWindow: BrowserWindow | null = null

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

  registerIpcHandlers()
  buildApplicationMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
