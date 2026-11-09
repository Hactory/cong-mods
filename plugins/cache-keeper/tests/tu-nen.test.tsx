import { describe, expect, mock, test } from 'claude-code/testing'

import { AUTO_COMPACT_MIN_TOKENS, CACHE_TTL_MS, shouldAutoCompact } from '../hooks/lib'

const T0 = Date.parse('2026-11-09T09:00:00Z')
const MIN = 60_000
// Lượt chat xong lúc T0; tới phút 56 cache còn 4 phút.
const BASE = {
  isOn: true,
  lastAt: T0,
  now: T0 + CACHE_TTL_MS - 4 * MIN,
  compactedAt: null,
  isRunning: false,
  isBusy: false,
  tokens: 300_000,
}

describe('luật tự nén', () => {
  test('cache còn ≤5 phút, rảnh, context lớn thì nén', () => {
    expect(shouldAutoCompact(BASE)).toBe(true)
  })
  test('còn hơn 5 phút hoặc đã nguội thì chưa/không nén', () => {
    expect(shouldAutoCompact({ ...BASE, now: T0 + 30 * MIN })).toBe(false)
    expect(shouldAutoCompact({ ...BASE, now: T0 + CACHE_TTL_MS + MIN })).toBe(false)
  })
  test('tắt, đang chạy, đang bận việc khác, context nhỏ thì không nén', () => {
    expect(shouldAutoCompact({ ...BASE, isOn: false })).toBe(false)
    expect(shouldAutoCompact({ ...BASE, isRunning: true })).toBe(false)
    expect(shouldAutoCompact({ ...BASE, isBusy: true })).toBe(false)
    expect(shouldAutoCompact({ ...BASE, tokens: AUTO_COMPACT_MIN_TOKENS - 1 })).toBe(false)
    expect(shouldAutoCompact({ ...BASE, tokens: null })).toBe(false)
  })
  test('đã nén sau lượt chat cuối thì 1 giờ sau không nén lại', () => {
    expect(shouldAutoCompact({ ...BASE, compactedAt: T0 + 56 * MIN, now: T0 + 56 * MIN + CACHE_TTL_MS })).toBe(false)
    expect(shouldAutoCompact({ ...BASE, compactedAt: T0 + 5 * MIN })).toBe(false)
  })
  test('có lượt chat mới sau lần nén thì được nén lại', () => {
    expect(shouldAutoCompact({ ...BASE, compactedAt: T0 - 10 * MIN })).toBe(true)
  })
})

const MODE = { component: 'SessionMode' as const, props: { modes: [] as string[] } }
const MEASURE = {
  context: { tokens: 300_000, window: 1_000_000, percent: 30 },
  rateLimits: [],
  cost: { usd: 0.5 },
  changed: ['context'],
} as const

test('nút tích cạnh Nén: mặc định bật, bấm thì tắt, báo mô tả', async ($, on) => {
  mock.clock(on, { now: T0 })
  const toasts: string[] = []
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.toast', (_$, e) => {
    toasts.push(JSON.stringify(e))
    return { value: undefined }
  })
  await $.session.measure({ ...MEASURE, rateLimits: [], changed: [...MEASURE.changed] })

  const ui = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...MODE })
  const box = await ui.find({ key: 'auto-compact' })
  expect(box?.props.label).toBe('☑')
  expect(box?.props.dimColor).toBe(false)
  await ui.press({ key: 'auto-compact' })
  expect((await ui.find({ key: 'auto-compact' }))?.props.label).toBe('☐')
  expect(toasts.some(t => /TẮT tự nén/.test(t))).toBe(true)
  await ui.unmount()
})

const START = { cwd: '/tmp/x', surface: 'desktop' as const, isInteractive: true }

test('phiên mới theo lần bật/tắt cuối; reload không đè lựa chọn riêng của phiên', async ($, on) => {
  mock.clock(on, { now: T0 })
  const store: Record<string, unknown> = { autoCompact: false }
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { context: { tokens: 300_000 }, rateLimits: [], cost: { usd: 0 } } }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  on('command.register', () => ({ value: undefined }))
  on('store.get', (_$, e) => ({ value: store[e.key] }))
  on('store.set', (_$, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  await $.session.start(START)
  await $.session.measure({ ...MEASURE, rateLimits: [], changed: [...MEASURE.changed] })

  // Lần cuối (ở phiên khác) đã tắt → phiên mới cũng tắt.
  const ui = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...MODE })
  expect((await ui.find({ key: 'auto-compact' }))?.props.label).toBe('☐')
  await ui.press({ key: 'auto-compact' })
  expect((await ui.find({ key: 'auto-compact' }))?.props.label).toBe('☑')
  expect(store.autoCompact).toBe(true)

  // Phiên khác tắt đi: phiên này vẫn giữ lựa chọn riêng, kể cả sau /reload-plugins.
  store.autoCompact = false
  await $.session.start(START)
  expect((await ui.find({ key: 'auto-compact' }))?.props.label).toBe('☑')
  await ui.unmount()
})

test('ⓘ ở hàng cache (desktop) hiện mô tả tự nén khi trỏ chuột, đổi theo bật/tắt', async ($, on) => {
  mock.clock(on, { now: T0 })
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.measure({ ...MEASURE, rateLimits: [], changed: [...MEASURE.changed] })
  const BAND = {
    component: 'AbovePrompt' as const,
    props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
  }

  const band = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...BAND })
  const findInfo = async (ui: typeof band) =>
    (await ui.findAll({ type: 'Svg' })).find(x => /^Tự nén khi cache/.test(String(x.props.alt)))
  const info = await findInfo(band)
  expect(info?.props.isInteractive).toBe(true)
  expect(String(info?.props.source)).toContain('<title>Tự nén khi cache còn 5 phút: đang BẬT')
  expect(String(info?.props.source)).toContain('#22c55e')

  const mode = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...MODE })
  await mode.press({ key: 'auto-compact' })
  await mode.unmount()
  const after = await findInfo(band)
  expect(String(after?.props.source)).toContain('đang TẮT')
  expect(String(after?.props.source)).toContain('#9ca3af')
  await band.unmount()

  const t = await $.ui.mount({ plugin: 'cache-keeper', surface: 'terminal', ...BAND })
  expect(await t.find({ type: 'Text', text: /Tự nén khi cache/ })).toBeUndefined()
  await t.unmount()
})
