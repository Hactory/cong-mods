import { expect, mock, test } from 'claude-code/testing'

const T0 = Date.parse('2026-10-11T09:03:00Z')
const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10 }, view: {} },
}

test('thanh hiện cache, quota kèm reset, gợi ý bấm được', async ($, on) => {
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
    expect(await ui.find({ type: 'Text', text: /cache ấm 59m|cache ấm 1h00m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^9%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^59%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /↻2h1[34]m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /↻3n4h/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /phiên \$0\.92/ })).toBeDefined()
    expect(await ui.find({ key: 'step-2' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...BAND })
  await ui.press({ key: 'dismiss' })
  expect(await ui.find({ key: 'step-0' })).toBeUndefined()
  await ui.unmount()
})
