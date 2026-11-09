import { expect, mock, test } from 'claude-code/testing'

const T0 = Date.parse('2026-10-11T09:03:00Z')
const MODE = {
  component: 'SessionMode' as const,
  props: { modes: ['focus'] },
}
const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
}
const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

const MEASURE = {
  context: { tokens: 510_000, window: 1_000_000, percent: 51 },
  rateLimits: [
    { kind: 'seven_day', percentUsed: 59, resetsAt: '2026-10-14T13:03:00Z' },
    { kind: 'five_hour', percentUsed: 9, resetsAt: '2026-10-11T11:17:00Z' },
  ],
  cost: { usd: 0.92 },
  changed: ['context', 'rateLimits', 'cost'],
} as const

test('hàng cache có vòng quota 5h/tuần kèm giờ reset; thanh token không nằm trên band', async ($, on) => {
  mock.clock(on, { now: T0 })
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.measure({ ...MEASURE, rateLimits: [...MEASURE.rateLimits], changed: [...MEASURE.changed] })

  const d = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...BAND })
  const svgs = await d.findAll({ type: 'Svg' })
  const svg = (alt: RegExp) => JSON.stringify(svgs.find(x => alt.test(String(x.props.alt))))
  expect(svg(/Quota 5h/)).toContain('9%</text>')
  expect(svg(/Quota 5h/)).toContain('#22c55e')
  expect(svg(/Quota tuần/)).toContain('59%</text>')
  expect(svg(/Quota tuần/)).toContain('#eab308')
  expect(svgs.some(x => /Ngữ cảnh/.test(String(x.props.alt)))).toBe(false)
  expect(await d.find({ type: 'Text', text: /^5h ↻2h1[34]m$/ })).toBeDefined()
  expect(await d.find({ type: 'Text', text: /^tuần ↻3n4h$/ })).toBeDefined()
  expect(await d.find({ type: 'Text', text: /▰/ })).toBeUndefined()
  expect(await d.find({ key: 'handoff' })).toBeDefined()
  await d.unmount()

  const t = await $.ui.mount({ plugin: 'cache-keeper', surface: 'terminal', ...BAND })
  expect((await t.find({ type: 'Text', text: /^○ 9%$/ }))?.props.color).toBe('success')
  expect((await t.find({ type: 'Text', text: /^◑ 59%$/ }))?.props.color).toBe('warning')
  await t.unmount()
})

test('dưới ô nhập: thanh token 10 ô cùng cỡ đổi màu + số dạng 510k, giữ nhãn chế độ', async ($, on) => {
  mock.clock(on, { now: T0 })
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.measure({ ...MEASURE, rateLimits: [...MEASURE.rateLimits], changed: [...MEASURE.changed] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'cache-keeper', surface, ...MODE })
    // 510k của mốc 600k = 85% → 9 ô sáng màu đỏ, 1 ô xám; cùng ký tự ▰ nên các ô bằng nhau.
    expect((await ui.find({ type: 'Text', text: /^▰{9}$/ }))?.props.color).toBe('error')
    expect((await ui.find({ type: 'Text', text: /^▰$/ }))?.props.dimColor).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^ 510k$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /600k|context|%/i })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /focus/ })).toBeDefined()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    // 85% là mức đỏ: nút Nén có chấm đỏ cho nổi hẳn.
    expect((await ui.find({ key: 'compact' }))?.props.label).toBe('🔴 Nén')
    await ui.unmount()
  }
})

test('chưa đo được gì thì vùng dưới ô nhập để nguyên như engine vẽ', async ($, on) => {
  mock.clock(on, { now: T0 })
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  const d = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...MODE })
  expect(await d.find({ type: 'Text', text: /▰/ })).toBeUndefined()
  await d.unmount()
})

test('thẻ You Should Know đứng riêng, vẽ lại theo bản mẫu, bấm vẫn về YSK', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  let pressed = ''
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('model.complete', () => ({ value: { isAnswered: true as const, text: '1. Chạy test\n2. Mở PR\n3. Gộp', usage: USAGE } }))
  // Đứng thay YSK: dựng đúng hình cây YSK 2.1.317 vẽ ở band trên ô nhập.
  on('ui.render', ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const btn = (hotkey: string, label: string, extra: { dimColor?: boolean; role?: 'dismiss' } = {}) => (
      <Box marginRight={3}>
        <Button hotkey={hotkey} plain {...extra} onPress={() => void (pressed = label)}>
          {label}
        </Button>
      </Box>
    )
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row" alignItems="flex-start">
          <Box key="about" flexShrink={0}>
            <Text>
              <Text color="subtle">✦</Text>
              <Text color="subtle"> You should know · </Text>
            </Text>
          </Box>
          <Text wrap="wrap">
            Làm lại cả video cần nạp thêm 65 credit. Seedance 2.5 720p cần khoảng 90 credit, tài khoản chỉ còn 24.66.
          </Text>
        </Box>
        <Box marginLeft={2} flexWrap="wrap">
          {btn('1', 'Learn more')}
          {btn('2', 'Knew this already')}
          {btn('3', 'What is this', { dimColor: true })}
          {btn('0', 'Dismiss', { role: 'dismiss' })}
        </Box>
      </Box>
    )
  })

  await $.turn.complete({ answer: 'Xong.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(50)

  const d = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...BAND })
  expect(await d.find({ type: 'Text', text: /^YOU SHOULD KNOW$/ })).toBeDefined()
  // Thẻ YSK: nút vẫn xếp cột dọc bên phải như cũ.
  expect(await d.find({ key: 'nut-doc' })).toBeDefined()
  expect(await d.find({ key: 'nut-ngang' })).toBeUndefined()
  expect(await d.find({ type: 'Text', text: /^Làm lại cả video cần nạp thêm 65 credit$/ })).toBeDefined()
  expect(await d.find({ type: 'Text', text: /^Seedance 2\.5 720p cần khoảng 90 credit/ })).toBeDefined()
  expect((await d.findAll({ type: 'Svg' })).some(x => x.props.alt === 'Bóng đèn')).toBe(true)
  const more = JSON.stringify(await d.find({ key: 'Learn more' }))
  expect(more).toContain('Tell me more')
  expect(more).toContain('primary')
  expect(JSON.stringify(await d.find({ key: 'Knew this already' }))).toContain('I knew this')
  // Gợi ý bước tiếp nhường chỗ cho thẻ; nút của cache-keeper vẫn còn.
  expect(await d.find({ key: 'step-0' })).toBeUndefined()
  expect(await d.find({ key: 'handoff' })).toBeDefined()
  // Nút vẫn thuộc YSK (ở đây là hook của test đứng thay): bấm phải về đúng hàm của nó.
  await d.press({ key: 'Learn more', plugin: 'test' })
  expect(pressed).toBe('Learn more')
  await d.unmount()

  // Terminal: giữ nguyên cây YSK, chỉ cho đứng riêng đủ chiều ngang.
  const t = await $.ui.mount({ plugin: 'cache-keeper', surface: 'terminal', ...BAND })
  expect(await t.find({ type: 'Text', text: /Làm lại cả video cần nạp thêm 65 credit\. Seedance/ })).toBeDefined()
  expect(await t.find({ type: 'Text', text: /^YOU SHOULD KNOW$/ })).toBeUndefined()
  await t.unmount()
})
