import { Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'

interface TrayActions {
  show: () => void
  quit: () => void
}

let tray: Tray | null = null

/** 托盘图标随应用一起打包，开发与生产使用同一相对路径 */
function trayIconPath(): string {
  return join(__dirname, '../../resources/icon.png')
}

export function isTrayActive(): boolean {
  return tray !== null
}

export function createTray(actions: TrayActions): void {
  if (tray) return

  const image = nativeImage.createFromPath(trayIconPath())
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip('Headscale Desktop')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: actions.show },
      { type: 'separator' },
      { label: '退出', click: actions.quit }
    ])
  )
  tray.on('click', actions.show)
  tray.on('double-click', actions.show)
}

export function destroyTray(): void {
  if (!tray) return
  tray.destroy()
  tray = null
}
