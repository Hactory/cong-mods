import { describe, expect, test } from 'claude-code/testing'

import { cacheColor, ctxPct, CTX_MOC, parseAiSum, pctColor, cacheLeft, fmtDur, fmtTok, limitLabel, parseSteps } from '../hooks/lib'
import { cacheLabel, compactLook, snapAfterCompact, ctxBarSvg, ctxFilled, ringGlyph, ringSvg, splitHeadline } from '../hooks/lib'

describe('định dạng', () => {
  test('đếm ngược', async () => {
    expect(fmtDur(57 * 60000)).toBe('57m')
    expect(fmtDur(2 * 3600000 + 14 * 60000)).toBe('2h14m')
    expect(fmtDur(3 * 86400000 + 4 * 3600000)).toBe('3n4h')
    expect(fmtDur(-5)).toBe('0m')
    expect(fmtTok(108_400)).toBe('108k')
    expect(limitLabel('seven_day')).toBe('tuần')
  })

  test('cache ấm, sắp nguội, nguội', async () => {
    expect(cacheLeft(null, 0)).toBe(null)
    expect(cacheColor(cacheLeft(0, 3 * 60000))).toBe('success')
    expect(cacheColor(cacheLeft(0, 50 * 60000))).toBe('warning')
    expect(cacheColor(cacheLeft(0, 56 * 60000))).toBe('error')
    expect(cacheColor(cacheLeft(0, 61 * 60000))).toBe('inactive')
  })

  test('màu theo mức %', async () => {
    expect(pctColor(9)).toBe('success')
    expect(pctColor(49.9)).toBe('success')
    expect(pctColor(50)).toBe('warning')
    expect(pctColor(79)).toBe('warning')
    expect(pctColor(80)).toBe('error')
  })

  test('bóc tóm tắt của Haiku', async () => {
    const r = parseAiSum('Đây:\n{"goal":"Làm mod","done":["A",""],"doing":"B","next":["C"]}')
    expect(r).toEqual({ goal: 'Làm mod', done: ['A'], doing: 'B', next: ['C'] })
    expect(parseAiSum('không có json')).toBe(null)
    expect(parseAiSum('{"goal":""}')).toBe(null)
  })

  test('bóc gợi ý', async () => {
    expect(parseSteps('1. Chạy test\n- Mở PR\n\n• Gộp nhánh vào main\nthừa')).toEqual([
      'Chạy test',
      'Mở PR',
      'Gộp nhánh vào main',
    ])
  })
})

describe('ctxPct', () => {
  test('tính % theo mốc tóm tắt 600k, không theo trần 1M', () => {
    expect(CTX_MOC).toBe(600_000)
    expect(ctxPct(585_000)).toBe(98)
    expect(ctxPct(300_000)).toBe(50)
    expect(ctxPct(0)).toBe(0)
    expect(ctxPct(660_000)).toBe(110)
  })
})

describe('dòng dưới ô nhập và thẻ YSK', () => {
  test('tách câu YSK thành tiêu đề + dòng phụ', async () => {
    expect(splitHeadline('Làm lại cả video cần nạp thêm 65 credit. Seedance 2.5 720p cần khoảng 90 credit.')).toEqual({
      headline: 'Làm lại cả video cần nạp thêm 65 credit',
      detail: 'Seedance 2.5 720p cần khoảng 90 credit.',
    })
    // Câu một mạch: cắt ở dấu phẩy sau ít nhất 25 ký tự; 0,0026 không bị cắt.
    const one = splitHeadline('Dù Haiku 5.5 đo ra tốt, muốn dùng thật vẫn phải viết thêm code, vì luận giải tarot hiện chỉ gọi model qua OpenRouter.')
    expect(one.headline).toBe('Dù Haiku 5.5 đo ra tốt, muốn dùng thật vẫn phải viết thêm code')
    expect(one.detail).toBe('Vì luận giải tarot hiện chỉ gọi model qua OpenRouter.')
    expect(splitHeadline('Cổng tạm vẫn bật.')).toEqual({ headline: 'Cổng tạm vẫn bật', detail: '' })
  })
  test('thanh ngữ cảnh và vòng quota', async () => {
    expect(ctxFilled(0)).toBe(0)
    expect(ctxFilled(2)).toBe(1)
    expect(ctxFilled(57)).toBe(6)
    expect(ctxFilled(130)).toBe(10)
    expect(ringGlyph(9)).toBe('○')
    expect(ringGlyph(59)).toBe('◑')
    expect(ringSvg(100)).toContain('100%</text>')
    expect(ctxBarSvg(30).source).toContain('#22c55e')
  })
})

describe('chữ trạng thái cache', () => {
  test('ấm, đang chạy, nguội, chưa rõ', async () => {
    expect(cacheLabel(56 * 60000, false)).toBe('Cache ấm 56m')
    expect(cacheLabel(5 * 60000, true)).toBe('Cache ấm 1h00m')
    expect(cacheLabel(0, false)).toBe('Cache nguội')
    expect(cacheLabel(null, false)).toBe('Cache chưa rõ')
  })
})

describe('nút Nén theo mức context', () => {
  test('xanh mờ, vàng rõ, đỏ thêm chấm đỏ, đang nén thì báo', () => {
    expect(compactLook(30, false)).toEqual({ label: 'Nén', dim: true })
    expect(compactLook(65, false)).toEqual({ label: 'Nén', dim: false })
    expect(compactLook(85, false)).toEqual({ label: '🔴 Nén', dim: false })
    expect(compactLook(85, true)).toEqual({ label: 'Đang nén…', dim: false })
  })
})

describe('số đo sau khi nén', () => {
  test('thay cỡ context, giữ quota và chi phí', () => {
    const before = { ctxTokens: 159_000, ctxPercent: 27, costUsd: 162.56, limits: [{ kind: 'five_hour', percentUsed: 6, resetsAt: null }] }
    const after = snapAfterCompact(before, 21_000)
    expect(after.ctxTokens).toBe(21_000)
    expect(after.ctxPercent).toBe(ctxPct(21_000))
    expect(after.costUsd).toBe(162.56)
    expect(after.limits).toEqual(before.limits)
    expect(snapAfterCompact(null, 21_000)).toEqual({ ctxTokens: 21_000, ctxPercent: ctxPct(21_000), costUsd: null, limits: [] })
  })
})
