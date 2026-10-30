# Headscale Desktop

跨平台的 Headscale 桌面管理客户端，基于 Electron + Vue 3 + TypeScript 构建，用于替代命令行管理节点、子网路由、用户与预认证密钥。

界面采用浅色 / 深色双主题，左侧导航、顶部居中标题，连接状态与 Headscale 版本常驻顶栏。

## 功能

- **概览**：汇总 Headscale 控制面状态、版本、延迟，节点在线率、用户与路由统计，内置 Tailscale 核心状态和快捷入口
- **连接配置**：服务器地址 + API Key，支持「测试连接」、持久化保存与一键清除
- **节点管理**：列表 / 搜索 / 在线状态筛选，重命名、过期、删除节点；展开查看通告路由并逐条批准、禁用
- **网络拓扑**：以关系图展示控制面与节点的连接、在线状态、用户分组和节点间逻辑互连，支持缩放、拖拽与详情面板
- **本机 Tailnet**：内置官方 Tailscale 核心，不启动官方 UI；支持用户态（免管理员，SOCKS5 代理）与系统 TUN 两种模式，可在应用内配置、启动、停止并查看状态与日志
- **路由管理**：汇总所有节点的子网路由，批准 / 禁用，显示通告状态与主路由标记
- **ACL 策略**：图形化维护用户组、标签、主机、ACL / SSH 规则与自动批准；支持查看、复制、下载策略文件，保存后立即生效
- **用户管理**：创建、重命名、删除用户，展示用户名下节点数量
- **预认证密钥**：按用户筛选，创建可复用 / 临时密钥（可设置过期时间），创建后一次性展示完整密钥，支持删除（服务端不支持删除时自动降级为置为过期）
- **通用体验**：危险操作二次确认、统一错误提示、操作后自动刷新、连接状态与版本展示

## 环境要求

| 依赖 | 版本 |
| --- | --- |
| Node.js | >= 18（推荐 20 LTS 及以上） |
| npm | >= 9 |
| Headscale 服务端 | >= 0.23（已按 0.23 ~ 0.27 的 API 结构做兼容；更老版本会做只读降级） |

无需 `.env` 文件：连接信息在应用内填写，并保存在系统用户目录。

## 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 启动开发模式（Electron + Vite HMR）
npm run dev

# 3. 类型检查
npm run typecheck

# 4. 构建渲染进程与主进程产物（out/）
npm run build

# 5. 下载随包分发的 Tailscale 核心（首次或打包前执行）
npm run fetch:tailscale
```

> 若 `npm install` 卡在下载 Electron 二进制，可使用镜像后重试：
>
> ```powershell
> $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
> npm install
> ```

## 打包

```bash
# Windows 安装包（NSIS，输出到 release/）
npm run build:win

# macOS dmg（需要在 macOS 上执行）
npm run build:mac

# Linux AppImage（需要在 Linux 上执行）
npm run build:linux

# 仅生成未打包目录，便于本地验证
npm run build:unpack
```

打包脚本会自动执行 `fetch:tailscale`，只把当前平台的 Tailscale 核心复制到安装包的 `resources/tailscale` 下。

打包后的 Windows 安装程序位于 `release/`，安装后可双击桌面快捷方式运行。

## 配置服务器地址与 API Key

1. 在 Headscale 服务器上创建一个 API Key：

   ```bash
   headscale apikeys create
   ```

2. 打开应用 → 左侧「连接配置」，填写服务器地址，例如：

   ```
   https://headscale.example.com
   ```

   只填域名也可以，应用会自动补全 `https://`；误填的 `/api/v1` 后缀会被自动去掉。

3. 粘贴 API Key，点击「测试连接」。连接成功后点击「保存并连接」。

4. 保存后 API Key 会写入系统用户目录下的 `headscale-desktop/config.json`（由 `electron-store` 管理）：

   - Windows：`%APPDATA%\headscale-desktop\config.json`
   - macOS：`~/Library/Application Support/headscale-desktop/config.json`

   渲染进程永远拿不到明文 Key，只显示「已保存 / 未配置」。

## 内置 Tailscale 核心

「本机 Tailnet」页面会把当前设备作为节点接入 Headscale，不需要安装或打开官方 Tailscale 托盘程序。

### 两种运行模式

| 模式 | 权限 | 能力 |
| --- | --- | --- |
| 用户态（默认） | 不需要管理员 | 提供本地 SOCKS5 代理（默认 `127.0.0.1:1055`），适合让浏览器 / 应用通过代理访问 Tailnet；不接管系统流量 |
| 系统 TUN | Windows 管理员 / macOS、Linux root | 创建虚拟网卡并接管路由，支持入站、Tailscale SSH、子网路由与出口节点 |

### 使用步骤

1. 在「预认证密钥」页面创建一个密钥，或留空密钥使用交互式登录；
2. 打开「本机 Tailnet」，控制面地址默认复用「连接配置」中的服务器地址；
3. 选择运行模式，填写主机名（可留空）和预认证密钥；
4. 点击「启动核心」，启动后可在右侧查看状态、Tailscale IP 和节点列表；
5. 用户态模式下，把应用的代理设置为页面显示的 `socks5://127.0.0.1:<端口>`。

### 说明

- 核心使用独立的 state 与 socket，不会启动官方 UI，也不会修改官方 Tailscale 服务的配置；
- **不要**与已安装的 Tailscale 服务同时使用系统 TUN，避免虚拟网卡 / 路由冲突；
- 认证密钥保存在主进程的用户目录配置中，不会通过 IPC 回传渲染进程；
- Windows 不支持作为 Tailscale SSH 服务端；macOS 的系统 TUN 模式仍受签名、网络权限与系统版本影响；
- 核心二进制默认不提交仓库，通过 `npm run fetch:tailscale` 获取（Tailscale 1.104.4，BSD-3-Clause，许可证见 `resources/tailscale/LICENSE`）；
- macOS Intel 官方没有独立 CLI 包，脚本会优先复制本机已安装的 CLI，否则在运行时回退到系统 Tailscale。

## 项目结构

```
electron-headscale/
├── electron.vite.config.ts        # 主进程 / preload / 渲染进程构建配置
├── package.json                   # 依赖、脚本、electron-builder 配置
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
├── src/
│   ├── main/                      # 主进程
│   │   ├── index.ts               # 窗口创建、单实例、安全策略
│   │   ├── menu.ts                # 原生菜单
│   │   ├── config.ts              # electron-store 读写
│   │   ├── ipc.ts                 # IPC 注册与操作分发
│   │   ├── tailscale/             # 内置 Tailscale 核心管理
│   │   │   ├── manager.ts         # 进程、状态、日志、启停
│   │   │   └── settings.ts        # 核心配置与密钥存储
│   │   ├── api/
│   │   │   ├── client.ts          # axios 统一封装（baseURL / 认证头 / 超时 / 错误）
│   │   │   ├── headscale.ts       # 节点、路由、用户、密钥业务接口
│   │   │   └── normalize.ts       # 各版本字段兼容与规范化
│   │   └── utils/url.ts           # 服务器地址规范化
│   ├── preload/
│   │   └── index.ts               # contextBridge 暴露最小 API
│   ├── shared/types/              # 集中类型定义
│   │   ├── headscale.ts           # 领域模型
│   │   ├── tailscale.ts           # 内置核心类型
│   │   └── ipc.ts                 # IPC 通道与操作注册表
│   └── renderer/                  # 渲染进程（Vue 3）
│       ├── index.html
│       ├── main.ts / App.vue
│       ├── router/index.ts
│       ├── api/                   # 渲染进程 API 层（统一 invoke 封装）
│       ├── stores/                # Pinia：连接、节点、路由、用户、密钥、核心、UI
│       ├── layouts/MainLayout.vue
│       ├── views/                 # 9 个页面（概览、节点、拓扑、Tailnet 等）
│       ├── utils/                 # 格式化、统一消息
│       └── styles/index.css       # 主题变量与全局样式
├── resources/tailscale/           # 内置核心二进制（fetch 脚本生成）
├── scripts/fetch-tailscale.mjs    # 下载/整理官方核心
└── README.md
```

## 架构与安全

- **进程职责**：主进程负责窗口、菜单、本地配置、所有 HTTP 请求；渲染进程只做 UI 与状态管理。
- **安全基线**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、CSP、外链交由系统浏览器打开。
- **最小暴露面**：preload 只通过 `contextBridge` 暴露 `config`（读写配置）与 `invoke`（白名单 action）。
- **为何请求放在主进程**：绕过浏览器 CORS 限制（Headscale 默认未必允许跨域），同时避免 API Key 进入渲染进程。
- **错误处理**：主进程 axios 拦截器把超时、网络错误、HTTP 错误统一转换为中文消息，IPC 以 `{ ok, data, error }` 返回，渲染进程统一用 `ElMessage` 展示。

## API 约定与版本兼容

所有业务接口都走 `{serverUrl}/api/v1`，请求头为 `Authorization: Bearer {apiKey}`，实现位于 `src/main/api/headscale.ts`。

| 功能 | 接口 | 兼容说明 |
| --- | --- | --- |
| 测试连接 | `GET /api/v1/node` | 校验 Key 有效性，并额外请求 `/version` 读取版本（失败静默） |
| 节点列表 | `GET /api/v1/node` | 状态筛选在客户端完成 |
| 重命名 / 删除 / 过期 | `POST /node/{id}/rename/{name}`、`DELETE /node/{id}`、`POST /node/{id}/expire` | 官方仅支持「立即过期」，暂不支持自定义未来过期时间（代码中有 TODO） |
| 批准路由 | `POST /node/{id}/approve_routes` | 请求体 `{ routes: [...] }`，传完整网段列表 |
| 路由列表 | `GET /api/v1/routes` | 老版本 404 时从节点数据推导，进入只读降级 |
| 启用 / 禁用路由 | `POST /api/v1/routes/{id}/enable`、`/disable` | 404/405 时回退尝试单数形式 `/route/{id}/...` |
| 用户 | `GET/POST /user`、`POST /user/{name}/rename/{newName}`、`DELETE /user/{name}` | 重命名与删除使用用户名 |
| 密钥列表 / 创建 | `GET /preauthkey`、`POST /preauthkey` | `user` 字段传用户名；过期时间为 RFC3339 |
| 删除密钥 | `DELETE /preauthkey` → 失败回退 `POST /preauthkey/expire` | 稳定版没有删除接口，此时按「置为过期」处理并在界面提示 |

字段差异（camelCase / snake_case、v0.26 前后 `machine` 嵌套结构）统一在 `normalize.ts` 处理。

### 关于「批准 / 拒绝节点」

Headscale REST API 没有单独的节点审批接口：节点通过预认证密钥或注册流程接入。因此界面中的对应关系为：

- **批准全部路由**：批准该节点通告的全部子网路由
- **节点过期**：让节点立即过期，等价于拒绝 / 停用该节点（需要重新注册）
- **删除节点**：从控制面彻底移除

## 常见问题

- **连接超时 / 无法连接**：检查地址是否可从本机访问、反向代理是否放行 `/api/v1`，以及自签名证书是否已加入系统信任列表。
- **401 / 403**：API Key 无效、已过期或权限不足；重新执行 `headscale apikeys create`。
- **路由无法禁用**：当前版本未返回路由 ID（`GET /routes` 不可用），只能按网段在节点页批准。
- **删除密钥提示「已置为过期」**：服务端版本没有删除接口，已通过 `expire` 使密钥立即失效。
- **看不到操作系统**：部分 Headscale 版本不下发该字段，界面显示 `—`，属正常降级。

## 开发说明

- 渲染进程路由使用 hash 模式，确保 `file://` 生产环境可直接加载。
- 主题偏好保存在 `localStorage`（`hs-theme`），支持浅色 / 深色 / 跟随系统。
- 所有危险操作（删除节点、删除用户、禁用路由、清除配置）均需二次确认。
