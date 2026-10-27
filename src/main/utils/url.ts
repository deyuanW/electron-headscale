/**
 * 服务器地址规范化：
 * - 允许用户只输入域名（默认补 https://）
 * - 去掉末尾斜杠以及误填的 /api/v1 后缀
 */
export function normalizeServerUrl(input: string | undefined | null): string {
  let url = (input ?? '').trim()
  if (!url) return ''

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`
  }

  url = url.replace(/\/+$/, '')
  url = url.replace(/\/api\/v1$/i, '')
  url = url.replace(/\/+$/, '')

  return url
}
