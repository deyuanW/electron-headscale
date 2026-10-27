/** 绝对时间：2026/10/27 14:05 */
export function formatDateTime(value?: string | null): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

/** 相对时间：3 分钟前 / 2 天后 */
export function formatRelative(value?: string | null): string {
  if (!value) return '—'

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return '—'

  const diff = timestamp - Date.now()
  const abs = Math.abs(diff)
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000]
  ]

  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') {
      return formatter.format(Math.round(diff / ms), unit)
    }
  }

  return '—'
}

export function isExpired(value?: string | null): boolean {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  return !Number.isNaN(timestamp) && timestamp < Date.now()
}

/** 密钥在列表中脱敏展示，完整密钥只在创建成功时展示一次 */
export function maskKey(key: string): string {
  if (!key) return '—'
  if (key.length <= 20) return `${key.slice(0, 6)}…`
  return `${key.slice(0, 16)}…${key.slice(-4)}`
}
