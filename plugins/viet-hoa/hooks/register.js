// Việt hoá những dòng chữ Claude Code cho mod đổi: dòng "đang làm" (Spinner), dòng kết
// lượt (TurnDuration), dòng gợi ý dưới ô chat (PromptHint), nhãn chế độ (SessionMode),
// dòng gợi ý chạy nền (ToolProgress), thông báo dưới logo (InfoNotice), hàng công cụ (ToolUse).
// Câu nào chưa có trong từ điển thì giữ tiếng Anh và ghi vào chua-dich.txt để bổ sung sau.

// ---------- Từ điển cụm từ (thứ tự quan trọng: cụm dài trước) ----------
const PHRASES = [
  [/Press (.+?) again to exit/gi, 'Nhấn $1 lần nữa để thoát'],
  [/Press up to edit queued messages/gi, 'Nhấn ↑ để sửa tin nhắn đang chờ'],
  [/Context left until auto-compact:/gi, 'Ngữ cảnh còn trước khi tự nén:'],
  [/bypass permissions on/gi, 'bỏ qua xin quyền: bật'],
  [/accept edits on/gi, 'tự nhận sửa tệp: bật'],
  [/plan mode on/gi, 'lập kế hoạch: bật'],
  [/auto mode on/gi, 'tự động: bật'],
  [/for shortcuts/gi, 'xem phím tắt'],
  [/for agents/gi, 'xem trợ lý'],
  [/for newline/gi, 'để xuống dòng'],
  [/to run in background/gi, 'để chạy nền'],
  [/to show todos/gi, 'để hiện danh sách việc'],
  [/to hide todos/gi, 'để ẩn danh sách việc'],
  [/to show tasks/gi, 'để hiện việc'],
  [/to hide tasks/gi, 'để ẩn việc'],
  [/to interrupt/gi, 'để dừng'],
  [/to cycle/gi, 'để đổi'],
  [/to expand/gi, 'để mở rộng'],
  [/to collapse/gi, 'để thu gọn'],
  [/to cancel/gi, 'để huỷ'],
  [/to confirm/gi, 'để xác nhận'],
  [/to exit/gi, 'để thoát'],
  [/to edit/gi, 'để sửa'],
  [/to select/gi, 'để chọn'],
  [/to navigate/gi, 'để di chuyển'],
  [/to paste images?/gi, 'để dán ảnh'],
  [/to send/gi, 'để gửi'],
  [/to submit/gi, 'để gửi'],
  [/to retry/gi, 'để thử lại'],
  [/to queue/gi, 'để xếp hàng'],
  [/(\d+) shells?/gi, '$1 lệnh nền'],
  [/to manage/gi, 'để quản lý'],
  [/-- INSERT --/g, '-- NHẬP --'],
  [/-- NORMAL --/g, '-- LỆNH --'],
  [/-- VISUAL --/g, '-- CHỌN --'],
  [/\bmemory paused\b/gi, 'tạm dừng ghi nhớ'],
  [/\bfocus\b/gi, 'tập trung'],
  [/\bfast\b/gi, 'nhanh'],
]

// Câu trạng thái của Spinner khi có message riêng
const MESSAGES = [
  [/^Compacting conversation/i, 'Đang nén hội thoại'],
  [/^Running (.+?) hooks?/i, 'Đang chạy hook $1'],
  [/^Waiting for permission/i, 'Đang chờ cho phép'],
  [/^Retrying/i, 'Đang thử lại'],
  [/^Connecting/i, 'Đang kết nối'],
  [/^Loading/i, 'Đang tải'],
  [/^Thinking/i, 'Đang nghĩ'],
  [/^Waiting/i, 'Đang chờ'],
]

const MODE_WORD = {
  requesting: 'Đang gửi yêu cầu',
  responding: 'Đang viết trả lời',
  thinking: 'Đang suy nghĩ',
  'tool-input': 'Đang soạn lệnh',
  'tool-use': 'Đang làm việc',
}

// ---------- Ghi lại câu chưa dịch ----------
const daGhi = new Set()
async function ghiChuaDich($, noi, text) {
  const key = noi + '|' + text
  if (!text || daGhi.has(key)) return
  daGhi.add(key)
  try {
    const p = $.plugin.root + '/chua-dich.txt'
    const cu = (await $.fs.exists(p)) ? await $.fs.read(p) : ''
    if (cu.includes(key)) return
    await $.fs.write(p, cu + key + '\n')
  } catch (_) {}
}

// Còn chữ tiếng Anh: một từ nối tiếng Anh ngắn, hoặc từ Latin không dấu từ 4 chữ cái trở lên
// (trừ tên phím và vài từ tiếng Việt không dấu hay gặp).
const BO_QUA = new Set(['ctrl', 'shift', 'enter', 'option', 'meta', 'backspace', 'space', 'left',
  'right', 'down', 'pgup', 'pgdn', 'home', 'trung', 'nhanh', 'trong', 'theo', 'xong', 'thanh', 'chinh'])
function conTiengAnh(s) {
  const t = s.replace(/\/[\w:-]+/g, '')
  if (/(^|[^\p{L}])(to|for|on|off|the|and|or|is|in|of|with)(?![\p{L}])/iu.test(t)) return true
  const tu = t.match(/(?<![\p{L}])[A-Za-z]{4,}(?![\p{L}])/gu) || []
  return tu.some((w) => !BO_QUA.has(w.toLowerCase()))
}

function dich(s) {
  let out = s
  for (const [re, vi] of PHRASES) out = out.replace(re, vi)
  return out
}

async function dichCoGhi($, noi, s) {
  if (typeof s !== 'string' || !s) return s
  const out = dich(s)
  if (conTiengAnh(out)) await ghiChuaDich($, noi, s)
  return out
}

function thoiGian(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), g = s % 60
  if (h) return h + ' giờ ' + m + ' phút'
  if (m) return m + ' phút ' + g + ' giây'
  return g + ' giây'
}

// ---------- Hàng công cụ ----------
const TOOL_VI = {
  Bash: 'Chạy lệnh',
  Read: 'Đọc tệp',
  Edit: 'Sửa tệp',
  MultiEdit: 'Sửa tệp',
  Write: 'Ghi tệp',
  NotebookEdit: 'Sửa notebook',
  Grep: 'Tìm trong mã',
  Glob: 'Tìm tệp',
  WebFetch: 'Mở trang web',
  WebSearch: 'Tìm trên web',
  Agent: 'Giao việc cho trợ lý',
  Task: 'Giao việc cho trợ lý',
  TodoWrite: 'Cập nhật danh sách việc',
  Skill: 'Dùng kỹ năng',
  ToolSearch: 'Nạp công cụ',
}

function chiTiet(tool, input) {
  const i = input && typeof input === 'object' ? input : {}
  const v =
    i.description && (tool === 'Agent' || tool === 'Task') ? i.description :
    i.command || i.file_path || i.notebook_path || i.pattern || i.url || i.query ||
    i.skill || i.description || ''
  return String(v).replace(/\s+/g, ' ').trim()
}

function catNgan(s, n) {
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s
}

export function register(on) {
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    try {
      const p = e.props
      let message = p.message
      if (message) {
        let vi = null
        for (const [re, t] of MESSAGES) if (re.test(message)) { vi = message.replace(re, t); break }
        if (vi) message = vi
        else await ghiChuaDich($, 'Spinner.message', message)
      }
      return next({ ...e, props: { ...p, word: MODE_WORD[p.mode] || 'Đang làm', message } })
    } catch (_) { return next(e) }
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    try {
      const { Text } = $.ui.resolve(e)
      return Text({ dimColor: true, children: ['✻ Xong sau ' + thoiGian(e.props.durationMs)] })
    } catch (_) { return next(e) }
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    try {
      const hint = await dichCoGhi($, 'PromptHint', e.props.hint)
      return next({ ...e, props: { ...e.props, hint } })
    } catch (_) { return next(e) }
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    try {
      const modes = []
      for (const m of e.props.modes || []) modes.push(await dichCoGhi($, 'SessionMode', m))
      return next({ ...e, props: { ...e.props, modes } })
    } catch (_) { return next(e) }
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    try {
      const hint = await dichCoGhi($, 'ToolProgress', e.props.hint)
      return next({ ...e, props: { ...e.props, hint } })
    } catch (_) { return next(e) }
  })

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    try {
      const text = await dichCoGhi($, 'InfoNotice', e.props.text)
      return next({ ...e, props: { ...e.props, text } })
    } catch (_) { return next(e) }
  })

  // Dòng báo việc nền xong (chỉ dòng thông báo, không đụng tin Công tự gõ)
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    try {
      const o = e.props.origin
      if (!o || o.kind !== 'task-notification') return next(e)
      let text = e.props.text
      text = text
        .replace(/^Background command "(.*)" completed \(exit code (\d+)\)/s, 'Lệnh nền "$1" đã xong (mã thoát $2)')
        .replace(/^Background command "(.*)" failed with exit code (\d+)/s, 'Lệnh nền "$1" lỗi (mã thoát $2)')
        .replace(/^Background command "(.*)" was stopped/s, 'Lệnh nền "$1" đã bị dừng')
        .replace(/^Agent "(.*)" completed/s, 'Trợ lý "$1" đã xong')
        .replace(/^Agent "(.*)" failed/s, 'Trợ lý "$1" bị lỗi')
      if (text === e.props.text) await ghiChuaDich($, 'UserMessage', text.slice(0, 120))
      return next({ ...e, props: { ...e.props, text } })
    } catch (_) { return next(e) }
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    try {
      const p = e.props
      const nhan = TOOL_VI[p.tool]
      if (!nhan) return next(e)
      const { Box, Text } = $.ui.resolve(e)
      const cot = (e.viewport && e.viewport.columns) || 100
      const ct = catNgan(chiTiet(p.tool, p.input), Math.max(20, cot - nhan.length - 12))
      const mau = p.isErrored ? 'red' : p.isRunning ? undefined : 'green'
      const duoi = p.isInterrupted ? ' (đã ngắt)' : p.isErrored ? ' (lỗi)' : ''
      return Box({
        flexDirection: 'row',
        gap: 1,
        children: [
          Text({ color: mau, dimColor: p.isRunning, children: ['⏺'] }),
          Text({ bold: true, children: [nhan] }),
          ct ? Text({ dimColor: true, children: [ct] }) : null,
          duoi ? Text({ color: 'red', children: [duoi] }) : null,
        ].filter(Boolean),
      })
    } catch (_) { return next(e) }
  })
}
