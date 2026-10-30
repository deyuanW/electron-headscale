# macOS Intel 核心

Tailscale 官方没有为 macOS x64 提供独立 CLI 压缩包，Homebrew 当前也只提供 Apple Silicon bottle。

可选方案：

1. 在 Intel Mac 上安装官方 Tailscale 后，把 `/usr/local/bin/tailscale` 与 `/usr/local/bin/tailscaled` 复制到本目录；
2. 或在 Intel Mac 上执行 `npm run fetch:tailscale`，脚本会尝试复制本机 CLI；
3. 不放置时，应用会自动回退到系统已安装的 Tailscale CLI。

Apple Silicon 用户不需要本目录，使用 `darwin-arm64` 即可。
