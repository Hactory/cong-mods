// Các hàm thuần, không đụng `$`, để test được riêng.

export const CACHE_TTL_MS = 60 * 60 * 1000 // cache prompt 1 giờ của gói subscription
export const COLD_WARN_MS = 5 * 60 * 1000 // báo khi còn 5 phút
// Mốc % ngữ cảnh = ngưỡng tự tóm tắt `autoCompactWindow` trong ~/.claude/settings.json (Công chốt 600k, 14/10/2026).
// 100% nghĩa là phiên sắp tự tóm tắt; đổi setting thì đổi số này theo.
export const CTX_MOC = 600_000

/** % ngữ cảnh theo mốc tóm tắt, làm tròn; có thể vượt 100 khi phiên chưa kịp tóm tắt. */
export function ctxPct(tokens: number, moc: number = CTX_MOC): number {
  return Math.round((tokens / moc) * 100)
}

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

/**
 * Nút "Nén" dưới ô nhập theo mức context. App desktop ép mọi nút ở vùng này cùng màu nền và chữ,
 * chỉ còn mờ/rõ, nên: xanh thì mờ đi, vàng rõ bình thường, đỏ thêm chấm đỏ (emoji giữ màu riêng) cho nổi hẳn.
 */
export function compactLook(pct: number, isCompacting: boolean): { label: string; dim: boolean } {
  if (isCompacting) return { label: 'Đang nén…', dim: false }
  const level = pctColor(pct)
  if (level === 'error') return { label: '🔴 Nén', dim: false }
  return { label: 'Nén', dim: level === 'success' }
}

/** Số đo context sau khi nén: thay cỡ context, giữ nguyên quota và chi phí đã đo. */
export function snapAfterCompact<S extends { ctxTokens: number | null; ctxPercent: number | null }>(
  s: S | null,
  tokens: number,
): S | { ctxTokens: number; ctxPercent: number; costUsd: null; limits: [] } {
  if (s === null) return { ctxTokens: tokens, ctxPercent: ctxPct(tokens), costUsd: null, limits: [] }
  return { ...s, ctxTokens: tokens, ctxPercent: ctxPct(tokens) }
}

// ---- Dòng dưới ô nhập: thanh ngữ cảnh + vòng quota ----

/** Mã màu thật cho SVG (SVG vẽ như ảnh nên không đọc được màu theme). */
export const LEVEL_HEX = { success: '#22c55e', warning: '#eab308', error: '#ef4444' } as const
const TRACK_HEX = '#9ca3af'

export const CTX_SEGS = 10

/** Số ô sáng của thanh ngữ cảnh: làm tròn, nhưng đã dùng chút nào thì sáng ít nhất 1 ô. */
export function ctxFilled(pct: number, segs: number = CTX_SEGS): number {
  if (pct <= 0) return 0
  return Math.min(segs, Math.max(1, Math.round((pct / 100) * segs)))
}

/** Thanh ngữ cảnh dạng 10 ô bo góc như bản mẫu; ô đã dùng tô theo mức xanh, vàng, đỏ, ô trống xám, mọi ô cùng cỡ. */
export function ctxBarSvg(pct: number): { source: string; width: number; height: number } {
  const w = 14
  const h = 10
  const gap = 3
  const on = ctxFilled(pct)
  const fill = LEVEL_HEX[pctColor(pct)]
  const width = CTX_SEGS * w + (CTX_SEGS - 1) * gap
  const cells = Array.from({ length: CTX_SEGS }, (_, i) => {
    const x = i * (w + gap)
    return i < on
      ? `<rect x="${x}" y="0" width="${w}" height="${h}" rx="2.5" fill="${fill}"/>`
      : `<rect x="${x}" y="0" width="${w}" height="${h}" rx="2.5" fill="${TRACK_HEX}" fill-opacity="0.35"/>`
  }).join('')
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">${cells}</svg>`,
    width,
    height: h,
  }
}

/** Vòng quota: cung tô theo mức dùng, % nằm giữa vòng. */
export const RING_SIZE = 24

export function ringSvg(pct: number, size = RING_SIZE): string {
  const p = Math.max(0, Math.min(100, pct))
  const c = size / 2
  const sw = 2.5
  const r = c - sw / 2 - 0.5
  const len = 2 * Math.PI * r
  const color = LEVEL_HEX[pctColor(p)]
  const dash = ((p / 100) * len).toFixed(2)
  // Chữ % nhỏ cho vừa lòng vòng; 100% dài hơn nên nhỏ thêm.
  const font = p >= 100 ? 5.6 : 6.5
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${TRACK_HEX}" stroke-opacity="0.3" stroke-width="${sw}"/>` +
    (p > 0
      ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash} ${len.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`
      : '') +
    `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" font-family="-apple-system, system-ui, sans-serif" font-size="${font}" font-weight="700" fill="${color}">${Math.round(p)}%</text>` +
    `</svg>`
  )
}

/**
 * Thanh ngữ cảnh bằng ký tự (vùng dưới ô nhập chỉ vẽ chữ). Ô sáng và ô tối dùng CÙNG một ký tự,
 * khác màu, để các ô bằng nhau (▰ và ▱ khác cỡ trong font của app).
 */
export function ctxCells(pct: number): { on: string; off: string } {
  const n = ctxFilled(pct)
  return { on: '▰'.repeat(n), off: '▰'.repeat(CTX_SEGS - n) }
}

/** Số ngữ cảnh gọn: nghìn token, không đơn vị (347 = 347k). */
export function ctxShort(tokens: number): string {
  return String(Math.round(tokens / 1000))
}

export function ringGlyph(pct: number): string {
  if (pct < 12.5) return '○'
  if (pct < 37.5) return '◔'
  if (pct < 62.5) return '◑'
  if (pct < 87.5) return '◕'
  return '●'
}

/** Ngọn lửa đỏ đứng trước chữ "Cache ấm" (lucide flame, tô đặc). */
export const FLAME_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">' +
  '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" ' +
  'fill="#ef4444" stroke="#ef4444" stroke-width="1.5" stroke-linejoin="round"/></svg>'

/** Chữ trạng thái cache (không kèm icon). Lúc đang chạy cache liên tục được làm mới nên hiện đủ 1 giờ. */
export function cacheLabel(left: number | null, isWorking: boolean): string {
  if (isWorking) return `Cache ấm ${fmtDur(CACHE_TTL_MS)}`
  if (left === null) return 'Cache chưa rõ'
  if (left === 0) return 'Cache nguội'
  return `Cache ấm ${fmtDur(left)}`
}

// ---- Thẻ You Should Know ----

/** Tách câu của YSK thành tiêu đề đậm + dòng phụ như bản mẫu; không tách được thì chỉ có tiêu đề. */
export function splitHeadline(line: string): { headline: string; detail: string } {
  const text = line.trim()
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase('vi') + s.slice(1)
  // Ưu tiên ranh giới câu, rồi tới dấu hai chấm, chấm phẩy, gạch dài.
  const hard = text.match(/^(.{12,}?[^\d\s][.!?:;])\s+(\S[\s\S]*)$/) ?? text.match(/^(.{12,}?)\s+[—–]\s+(\S[\s\S]*)$/)
  if (hard?.[1] !== undefined && hard[2] !== undefined) return { headline: hard[1].replace(/[.:;]$/, ''), detail: cap(hard[2]) }
  // Câu dài một mạch: cắt ở dấu phẩy đầu tiên sau ít nhất 25 ký tự (", " có dấu cách, nên 0,25 không bị cắt).
  if (text.length > 70) {
    const i = text.indexOf(', ', 25)
    if (i > 0 && i < text.length - 15) return { headline: text.slice(0, i), detail: cap(text.slice(i + 2)) }
  }
  return { headline: text.replace(/\.$/, ''), detail: '' }
}

type Node = { type?: unknown; props?: Record<string, unknown>; children?: unknown }

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Con của một phần tử, đã trải phẳng mảng lồng và bỏ chỗ trống. */
export function kids(n: unknown): unknown[] {
  if (!isNode(n) || n.children === undefined) return []
  const out: unknown[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v !== null && v !== undefined && v !== false && v !== '') out.push(v)
  }
  walk(n.children)
  return out
}

/** Toàn bộ chữ trong một nhánh, nối lại theo thứ tự vẽ. */
export function textOf(n: unknown): string {
  if (typeof n === 'string') return n
  return kids(n).map(textOf).join('')
}

export type YskCard = {
  /** "You should know" hoặc "Heads up". */
  tag: string
  /** Câu nhắc khi là chuỗi thuần; null khi YSK đang mở phần giải thích (nhiều đoạn chữ). */
  line: string | null
  /** Nhánh câu nhắc nguyên gốc, để vẽ lại khi không phải chuỗi thuần. */
  body: unknown
  /** Các nút nguyên gốc của YSK (giữ nguyên chỗ gọi xử lý bấm). */
  buttons: Node[]
}

/**
 * Nhận ra thẻ "đề xuất" của plugin You Should Know trong cây nó vẽ ở band trên ô nhập:
 * hộp `key="about"` chứa ✦ + nhãn, kế bên là câu nhắc, dưới là hàng nút. Cây khác thì null.
 */
export function parseYsk(tree: unknown): YskCard | null {
  let about: Node | null = null
  let row: Node | null = null
  const buttons: Node[] = []
  const walk = (n: unknown, parent: Node | null) => {
    if (!isNode(n)) return
    if (n.type === 'Button') {
      buttons.push(n)
      return
    }
    if (n.type === 'Box' && n.props?.key === 'about' && about === null) {
      about = n
      row = parent
    }
    for (const c of kids(n)) walk(c, n)
  }
  walk(tree, null)
  if (about === null || row === null) return null
  const lead = textOf(kids(about)[0])
  if (!lead.includes('✦')) return null
  const tag = lead.replace(/[✦·]/g, '').replace(/\s+/g, ' ').trim()
  const rest = kids(row)
  const body = rest[rest.indexOf(about) + 1]
  if (body === undefined) return null
  const parts = kids(body)
  const line = parts.every(p => typeof p === 'string') ? parts.join('').trim() : null
  return { tag: tag || 'You should know', line, body, buttons }
}

/** Nhãn nút theo bản mẫu; nút khác giữ nguyên. */
export function yskLabel(label: string): string {
  if (/^learn more$/i.test(label)) return 'Tell me more'
  if (/^knew this already$/i.test(label)) return 'I knew this'
  return label
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

export const NOTE_KINDS = ['decide', 'risk', 'todo', 'unverified', 'changed'] as const
export type NoteKindLib = (typeof NOTE_KINDS)[number]

export const NOTE_LABEL: Record<NoteKindLib, string> = {
  decide: 'cần anh quyết',
  risk: 'rủi ro',
  todo: 'còn treo',
  unverified: 'chưa kiểm chứng',
  changed: 'Claude tự đổi',
}

/** Bóc danh sách lưu ý từ câu trả lời JSON của Haiku; sai định dạng thì null. */
export function parseNotes(text: string): { kind: NoteKindLib; text: string; why: string }[] | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  let raw: unknown
  try {
    raw = JSON.parse(m[0])
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const items = (raw as Record<string, unknown>).items
  if (!Array.isArray(items)) return null
  const order = (k: NoteKindLib) => NOTE_KINDS.indexOf(k)
  return items
    .flatMap(it => {
      if (typeof it !== 'object' || it === null) return []
      const o = it as Record<string, unknown>
      const kind = NOTE_KINDS.find(k => k === o.kind) ?? 'risk'
      const t = typeof o.text === 'string' ? o.text.trim() : ''
      const why = typeof o.why === 'string' ? o.why.trim() : ''
      return t ? [{ kind, text: t, why }] : []
    })
    .sort((a, b) => order(a.kind) - order(b.kind))
    .slice(0, 12)
}
