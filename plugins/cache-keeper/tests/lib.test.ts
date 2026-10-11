import { describe, expect, test } from 'claude-code/testing'

import { cacheColor, parseAiSum, pctColor, cacheLeft, fmtDur, fmtTok, limitLabel, parseSteps } from '../hooks/lib'

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
