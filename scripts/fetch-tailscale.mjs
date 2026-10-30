#!/usr/bin/env node

/**
 * 下载并整理随应用分发的 Tailscale 核心。
 *
 * 默认只处理当前平台，避免每次构建都下载全部平台：
 * - Windows: 官方 MSI（管理安装解包）
 * - Linux: 官方静态 tarball（amd64/arm64 都下载）
 * - macOS arm64: Homebrew bottle（内含 tailscale/tailscaled）
 * - macOS x64: 官方没有独立 CLI 包，优先复制本机已安装的 CLI，否则跳过
 *
 * 用法：
 *   node scripts/fetch-tailscale.mjs
 *   node scripts/fetch-tailscale.mjs --force
 *   TAILSCALE_VERSION=1.104.4 node scripts/fetch-tailscale.mjs
 */

import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const VERSION = process.env.TAILSCALE_VERSION || '1.104.4'
const FORCE = process.argv.includes('--force')
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(ROOT, 'resources', 'tailscale')
const TEMP = join(tmpdir(), `headscale-tailscale-${Date.now()}`)

const PKG_BASE = 'https://pkgs.tailscale.com/stable'
const LICENSE_URL = `https://raw.githubusercontent.com/tailscale/tailscale/v${VERSION}/LICENSE`

function log(message) {
  console.log(`[tailscale] ${message}`)
}

async function download(url, destination, headers = {}) {
  const response = await fetch(url, { headers, redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`下载失败 ${response.status} ${response.statusText}: ${url}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
}

function extractTarball(file, directory) {
  mkdirSync(directory, { recursive: true })
  execFileSync('tar', ['-xzf', file, '-C', directory], { stdio: 'inherit' })
}

function copyBinary(source, targetDirectory, name) {
  const target = join(targetDirectory, name)
  copyFileSync(source, target)
  if (process.platform !== 'win32') {
    chmodSync(target, 0o755)
  }
  log(`已写入 ${target}`)
}

function prepareDirectory(name) {
  const directory = join(OUTPUT, name)
  mkdirSync(directory, { recursive: true })
  return directory
}

function hasCore(directory) {
  if (process.platform === 'win32') {
    return (
      existsSync(join(directory, 'tailscale.exe')) &&
      existsSync(join(directory, 'tailscaled.exe'))
    )
  }
  return (
    existsSync(join(directory, 'tailscale')) && existsSync(join(directory, 'tailscaled'))
  )
}

async function copyLicense(targetDirectory) {
  const target = join(targetDirectory, 'LICENSE')
  try {
    await download(LICENSE_URL, target)
  } catch (error) {
    log(`许可证下载失败（可忽略）：${error.message}`)
  }
}

async function fetchWindows() {
  const target = prepareDirectory('win32-x64')
  if (hasCore(target) && !FORCE) {
    log('Windows 核心已存在，跳过（使用 --force 强制更新）')
    return
  }
  if (process.platform !== 'win32') {
    log('非 Windows 环境，跳过 Windows 核心')
    return
  }

  const msi = join(TEMP, `tailscale-setup-${VERSION}-amd64.msi`)
  log(`下载 Windows MSI ${VERSION}`)
  await download(`${PKG_BASE}/tailscale-setup-${VERSION}-amd64.msi`, msi)

  const extracted = join(TEMP, 'windows-msi')
  mkdirSync(extracted, { recursive: true })
  execFileSync(
    'msiexec.exe',
    ['/a', msi, '/qn', `TARGETDIR=${extracted}`],
    { stdio: 'inherit' }
  )

  const base = join(extracted, 'PFiles64', 'Tailscale')
  if (!existsSync(join(base, 'tailscaled.exe'))) {
    throw new Error('MSI 解包后未找到 Tailscale 二进制')
  }

  for (const name of ['tailscale.exe', 'tailscaled.exe', 'wintun.dll']) {
    copyBinary(join(base, name), target, name)
  }
  await copyLicense(target)
}

async function fetchLinux() {
  const arches = [
    { arch: 'amd64', folder: 'linux-x64' },
    { arch: 'arm64', folder: 'linux-arm64' }
  ]

  for (const item of arches) {
    const target = prepareDirectory(item.folder)
    if (hasCore(target) && !FORCE) {
      log(`${item.folder} 核心已存在，跳过（使用 --force 强制更新）`)
      continue
    }

    const tarball = join(TEMP, `tailscale_${VERSION}_${item.arch}.tgz`)
    log(`下载 Linux ${item.arch} ${VERSION}`)
    await download(`${PKG_BASE}/tailscale_${VERSION}_${item.arch}.tgz`, tarball)

    const extracted = join(TEMP, `linux-${item.arch}`)
    extractTarball(tarball, extracted)
    const base = join(extracted, `tailscale_${VERSION}_${item.arch}`)
    for (const name of ['tailscale', 'tailscaled']) {
      copyBinary(join(base, name), target, name)
    }
    await copyLicense(target)
  }
}

function copySystemMacBinary(target, name) {
  const candidates = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin'
  ]
  for (const directory of candidates) {
    const file = join(directory, name)
    if (existsSync(file)) {
      copyBinary(file, target, name)
      return true
    }
  }
  return false
}

async function fetchMac() {
  if (process.arch === 'x64') {
    const target = prepareDirectory('darwin-x64')
    if (hasCore(target) && !FORCE) {
      log('macOS x64 核心已存在，跳过')
      return
    }
    log('Homebrew 未提供 macOS x64 的 Tailscale bottle，尝试复制本机 CLI')
    const copied =
      copySystemMacBinary(target, 'tailscale') &&
      copySystemMacBinary(target, 'tailscaled')
    if (!copied) {
      log('未找到 macOS x64 核心。请在本机安装 Tailscale，或手动放入 resources/tailscale/darwin-x64')
    }
    return
  }

  const target = prepareDirectory('darwin-arm64')
  if (hasCore(target) && !FORCE) {
    log('macOS arm64 核心已存在，跳过（使用 --force 强制更新）')
    return
  }

  const formulaResponse = await fetch('https://formulae.brew.sh/api/formula/tailscale.json')
  if (!formulaResponse.ok) throw new Error('无法读取 Homebrew formula 信息')
  const formula = await formulaResponse.json()

  const files = formula?.bottle?.stable?.files ?? {}
  const preferred = ['arm64_sequoia', 'arm64_tahoe', 'arm64_golden_gate']
  const key =
    preferred.find((name) => files[name]) || Object.keys(files).find((name) => name.startsWith('arm64_'))
  if (!key) throw new Error('Homebrew 未提供 macOS arm64 bottle')

  const bottle = files[key]
  const tokenResponse = await fetch(
    'https://ghcr.io/token?service=ghcr.io&scope=repository:homebrew/core/tailscale:pull'
  )
  if (!tokenResponse.ok) throw new Error('无法获取 GHCR 匿名令牌')
  const { token } = await tokenResponse.json()

  const bottleFile = join(TEMP, 'tailscale-macos-bottle.tar.gz')
  log(`下载 macOS arm64 bottle ${formula.versions?.stable ?? VERSION}`)
  await download(bottle.url, bottleFile, { Authorization: `Bearer ${token}` })

  const extracted = join(TEMP, 'macos-arm64')
  extractTarball(bottleFile, extracted)
  const version = formula.versions?.stable ?? VERSION
  const base = join(extracted, 'tailscale', version, 'bin')

  for (const name of ['tailscale', 'tailscaled']) {
    copyBinary(join(base, name), target, name)
  }
  await copyLicense(target)
}

async function main() {
  mkdirSync(TEMP, { recursive: true })
  try {
    if (process.platform === 'win32') {
      await fetchWindows()
    } else if (process.platform === 'darwin') {
      await fetchMac()
    } else {
      await fetchLinux()
    }
    log('完成')
  } finally {
    rmSync(TEMP, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`[tailscale] 失败：${error.message}`)
  process.exitCode = 1
})
