/** 关闭窗口时的行为：收进托盘继续后台运行，或直接退出应用 */
export type CloseAction = 'tray' | 'quit'

/**
 * 桌面客户端自身的运行设置。
 * 这些开关由主进程直接作用于操作系统（登录项、窗口、托盘），
 * 渲染进程只负责展示与提交。
 */
export interface AppSettings {
  /** 开机（登录系统）时自动启动本应用 */
  launchAtLogin: boolean
  /** 关闭窗口后是否保留后台进程 */
  runInBackground: boolean
  /** 关闭窗口时的行为，仅在开启后台运行时生效 */
  closeAction: CloseAction
}

export interface AppSettingsView extends AppSettings {
  /** 当前平台是否支持设置登录项（Linux 暂不支持） */
  launchAtLoginSupported: boolean
  /** 托盘是否已就绪（后台运行时才有托盘图标） */
  trayActive: boolean
}

export type AppSettingsInput = AppSettings

export const DEFAULT_APP_SETTINGS: AppSettings = {
  launchAtLogin: false,
  runInBackground: false,
  closeAction: 'tray'
}
