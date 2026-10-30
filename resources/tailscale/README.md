# Tailscale 核心二进制

本目录存放随应用分发的官方 Tailscale 客户端核心（`tailscaled` + `tailscale`），用于「本机 Tailnet」页面。

- 版本：**1.104.4**
- 来源：官方发行包 / Homebrew bottle
- 许可证：BSD-3-Clause，见各目录下的 `LICENSE`
- 二进制文件默认不提交到 Git，执行以下命令获取：

```bash
npm run fetch:tailscale
# 强制重新下载
npm run fetch:tailscale -- --force
```

目录约定：

| 目录 | 平台 |
| --- | --- |
| `win32-x64` | Windows x64（含 `wintun.dll`） |
| `darwin-arm64` | macOS Apple Silicon |
| `darwin-x64` | macOS Intel（官方无独立 CLI 包，可复制本机安装的 CLI） |
| `linux-x64` | Linux x64 |
| `linux-arm64` | Linux arm64 |

打包时只会把当前平台目录复制到安装包的 `resources/tailscale` 下；运行时由主进程查找对应目录并启动核心，不依赖官方 Tailscale GUI。
