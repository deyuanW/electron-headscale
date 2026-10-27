import { app, dialog, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { getStoredConfig } from './config'

/** 应用菜单（主进程负责），Windows/Linux 下默认隐藏，按 Alt 可唤出 */
export function buildApplicationMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const, label: `关于 ${app.name}` },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const, label: '隐藏' },
              { role: 'hideOthers' as const, label: '隐藏其他' },
              { role: 'unhide' as const, label: '显示全部' },
              { type: 'separator' as const },
              { role: 'quit' as const, label: '退出' }
            ]
          }
        ]
      : []),
    {
      label: '文件',
      submenu: [isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '打开 API 文档',
          click: () => {
            const { serverUrl } = getStoredConfig()
            if (!serverUrl) {
              dialog.showMessageBox({
                type: 'info',
                title: '尚未配置',
                message: '请先在应用内填写 Headscale 服务器地址',
                detail: '配置完成后，这里会打开 {服务器地址}/api/v1/docs'
              })
              return
            }
            void shell.openExternal(`${serverUrl}/api/v1/docs`)
          }
        },
        {
          label: `关于 ${app.name}`,
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: `关于 ${app.name}`,
              message: `${app.name} ${app.getVersion()}`,
              detail: `基于 Electron ${process.versions.electron} / Chromium ${process.versions.chrome}\nHeadscale 桌面管理客户端`
            })
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
