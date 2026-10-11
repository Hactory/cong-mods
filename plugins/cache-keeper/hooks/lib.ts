// Các hàm thuần, không đụng `$`, để test được riêng.

export const CACHE_TTL_MS = 60 * 60 * 1000 // cache prompt 1 giờ của gói subscription
export const COLD_WARN_MS = 5 * 60 * 1000 // báo khi còn 5 phút

/** 3n4h, 2h14m, 57m, 40s */
export function fmtDur(ms: number): string {
  if (ms <= 0) return '0m'
  const m = Math.floor(ms / 60000)
  if (m < 1) return `${Math.floor(ms / 1000)}s`
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  if (d > 0) return `${d}n${h}h`
  if (h > 0) return `${h}h${String(mm).padStart(2, '0')}m`
  return `${mm}m`
}

/** 108k, 1.2M, 900 */
export function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export function cacheLeft(lastAt: number | null, now: number): number | null {
  if (lastAt === null) return null
  return Math.max(0, lastAt + CACHE_TTL_MS - now)
}

/** Màu chấm cache theo thời gian còn lại. */
export function cacheColor(left: number | null): 'success' | 'warning' | 'error' | 'inactive' {
  if (left === null || left === 0) return 'inactive'
  if (left <= COLD_WARN_MS) return 'error'
  if (left <= 15 * 60 * 1000) return 'warning'
  return 'success'
}

export function limitLabel(kind: string): string {
  if (kind === 'five_hour') return '5h'
  if (kind === 'seven_day') return 'tuần'
  if (kind === 'spend_limit') return 'chi'
  return kind.replace(/_/g, ' ')
}

/** Bóc tối đa 3 gợi ý từ câu trả lời của model, mỗi dòng một gợi ý. */
export function parseSteps(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["“]|["”]$/g, '').trim())
    .filter(l => l.length >= 4 && l.length <= 120)
    .slice(0, 3)
}

/** Màu theo mức dùng: xanh dưới 50%, cam dưới 80%, đỏ từ 80% trở lên. */
export function pctColor(pct: number): 'success' | 'warning' | 'error' {
  if (pct >= 80) return 'error'
  if (pct >= 50) return 'warning'
  return 'success'
}

/** [██████░░░░] theo tỉ lệ xong. */
export function bar(done: number, total: number, width = 20): string {
  if (total <= 0) return '░'.repeat(width)
  const n = Math.round((done / total) * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

/** Một dòng tóm tắt cho nút trên thanh: "tiến độ 3/7" hoặc "tiến độ · 2 agent". */
export function progLabel(done: number, total: number, running: number): string {
  const parts: string[] = []
  if (total > 0) parts.push(`${done}/${total}`)
  if (running > 0) parts.push(`${running} agent`)
  return parts.length ? `tiến độ ${parts.join(' · ')}` : 'tiến độ'
}

export type AiSumBody = { goal: string; done: string[]; doing: string | null; next: string[] }

/** Bóc khối JSON {goal, done, doing, next} từ câu trả lời của model; hỏng thì null. */
export function parseAiSum(text: string): AiSumBody | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  let raw: unknown
  try {
    raw = JSON.parse(m[0])
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const strs = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, 12) : []
  const goal = typeof o.goal === 'string' ? o.goal.trim() : ''
  if (!goal) return null
  const doing = typeof o.doing === 'string' && o.doing.trim() ? o.doing.trim() : null
  return { goal, done: strs(o.done), doing, next: strs(o.next) }
}
