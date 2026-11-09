import { expect, mock, test } from 'claude-code/testing'

const T0 = Date.parse('2026-10-11T09:03:00Z')
const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10 }, view: {} },
}

test('thanh trên ô nhập hiện cache, chi phí, gợi ý bấm được', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('model.complete', () => ({ value: {
    isAnswered: true as const,
    text: '1. Chạy test\n2. Mở PR\n3. Gộp nhánh vào main',
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } }))

  await $.session.measure({
    context: { tokens: 108000, window: 1_000_000, percent: 11 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 59, resetsAt: '2026-10-14T13:03:00Z' },
      { kind: 'five_hour', percentUsed: 9, resetsAt: '2026-10-11T11:17:00Z' },
    ],
    cost: { usd: 0.92 },
    changed: ['context', 'rateLimits', 'cost'],
  })
  await $.turn.complete({ answer: 'Đã xong.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(50)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'cache-keeper', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /^Cache ấm (59m|1h00m)$/ })).toBeDefined()
    // Hàng trên cùng không còn chữ "ctx"; ngữ cảnh/quota nằm ở hàng sát ô nhập (test riêng).
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Tiền \$0\.92/ })).toBeDefined()
    expect(await ui.find({ key: 'step-2' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...BAND })
  await ui.press({ key: 'dismiss' })
  expect(await ui.find({ key: 'step-0' })).toBeUndefined()
  await ui.unmount()
})

test('Cache ấm: ngọn lửa đỏ + chữ xanh; lúc đang chạy hiện đủ 1h00m', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('model.complete', () => ({ value: {
    isAnswered: true as const,
    text: '1. Chạy test',
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } }))

  const working = { ...BAND, props: { ...BAND.props, isWorking: true } }
  const d = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...working })
  expect(await d.find({ type: 'Text', text: /^Cache ấm 1h00m$/ })).toBeDefined()
  expect(await d.find({ type: 'Text', text: /đang chạy/ })).toBeUndefined()
  const flame = (await d.findAll({ type: 'Svg' })).find(x => x.props.alt === 'Lửa')
  expect(JSON.stringify(flame)).toContain('#ef4444')
  expect((await d.findAll({ type: 'Text', text: /^Cache ấm 1h00m$/ })).some(x => x.props.color === 'success')).toBe(true)
  await d.unmount()

  // Vừa xong một lượt: cache còn đủ 1 giờ, terminal vẽ 🔥 thay cho SVG.
  await $.turn.complete({ answer: 'Xong.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(50)
  const t = await $.ui.mount({ plugin: 'cache-keeper', surface: 'terminal', ...BAND })
  expect(await t.find({ type: 'Text', text: /^🔥$/ })).toBeDefined()
  expect(await t.find({ type: 'Text', text: /^Cache ấm (59m|1h00m)$/ })).toBeDefined()
  await t.unmount()
})
