import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10 }, view: {} },
}
const PANE = {
  component: 'Pane' as const,
  requestId: 'handoff',
  props: { bodyColumns: 60, scroll: { offset: 0, bodyRows: 30 }, view: {} },
}
const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
const DOC = '**Mục tiêu**\n- Làm tiếp tính năng căn cửa sổ'

test('nút handoff soạn, lưu file, HIỆN trên ô chat, copy sẵn và mở bảng; KHÔNG tự /clear', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-11-09T01:28:00Z') })
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('session.id', () => ({ value: 'f93feb33-aaaa' }))
  on('ui.toast', () => ({ value: undefined }))
  on('model.fork', () => ({ value: { isAnswered: true as const, text: DOC, usage: USAGE } }))
  on('env.get', () => ({ value: '/nha' }))
  const written: string[] = []
  on('fs.write', (_$, e) => {
    written.push(String((e as { path?: string }).path ?? JSON.stringify(e)))
    return { value: undefined }
  })
  const copied: string[] = []
  on('ui.copy', (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true as const } }
  })
  const commands: string[] = []
  on('command.run', (_$, e, next) => {
    commands.push(e.command)
    return next(e)
  })
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })

  const band = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...BAND })
  await band.press({ key: 'handoff' })
  await clock.advance(0)

  // Nội dung hiện ngay trên ô chat, kèm nút copy / dán / soạn lại / đóng.
  expect(await band.find({ type: 'Text', text: /^Bản handoff$/ })).toBeDefined()
  // Đang hiện bản handoff: nút tiến độ/lưu ý/copy ID/handoff nằm một hàng ngang, không chiếm cột bên phải.
  expect(await band.find({ key: 'nut-ngang' })).toBeDefined()
  expect(await band.find({ key: 'nut-doc' })).toBeUndefined()
  const md = (await band.findAll({ type: 'Markdown' })).map(x => String(x.props.text))
  expect(md.some(t => t.includes('Làm tiếp tính năng căn cửa sổ'))).toBe(true)
  // Nút thật, có icon và viết hoa: Copy là nút chính, còn lại nút viền.
  const copyBtn = await band.find({ key: 'handoff-copy' })
  expect(copyBtn?.props.label).toBe('📋 Copy')
  expect(copyBtn?.props.variant).toBe('primary')
  expect(copyBtn?.props.plain).toBeUndefined()
  for (const [key, label] of [['handoff-fill', '📥 Dán vào ô nhập'], ['handoff-redo', '🔄 Soạn lại'], ['handoff-close', '✖️ Đóng']]) {
    const b = await band.find({ key })
    expect(b?.props.label).toBe(label)
    expect(b?.props.variant).toBe('secondary')
  }
  await band.press({ key: 'handoff-close' })
  expect(await band.find({ type: 'Text', text: /^Bản handoff$/ })).toBeUndefined()
  expect(await band.find({ key: 'nut-ngang' })).toBeDefined()
  await band.unmount()

  expect(commands).not.toContain('clear')
  expect(written.some(p => /\/nha\/\.claude\/handoffs\/2026-11-09-01-28-/.test(p))).toBe(true)
  expect(copied).toHaveLength(1)
  expect(copied[0]).toContain('Làm tiếp tính năng căn cửa sổ')
  expect(copied[0]).toMatch(/^Tiếp tục công việc từ bản handoff/)
  expect(opened).toContain('handoff')

  const pane = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...PANE } as never)
  expect(String((await pane.find({ type: 'Markdown' }))?.props.text)).toContain('Làm tiếp tính năng căn cửa sổ')
  expect(await pane.find({ type: 'Text', text: /gõ \/clear/ })).toBeDefined()
  await pane.press({ key: 'handoff-copy' })
  expect(copied).toHaveLength(2)
  await pane.unmount()
})

test('chưa có lượt nào để fork thì báo, không mở bảng, không copy', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-11-09T01:28:00Z') })
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('session.id', () => ({ value: 'f93feb33-aaaa' }))
  on('ui.toast', () => ({ value: undefined }))
  on('model.fork', () => ({ value: { isAnswered: false as const, reason: 'nothing-to-fork' as const } }))
  const copied: string[] = []
  on('ui.copy', (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true as const } }
  })

  const band = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...BAND })
  await band.press({ key: 'handoff' })
  await clock.advance(0)
  expect(await band.find({ type: 'Text', text: /^Bản handoff$/ })).toBeUndefined()
  await band.unmount()
  expect(copied).toHaveLength(0)

  const pane = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...PANE } as never)
  expect(await pane.find({ type: 'Text', text: /^Chưa có bản handoff\.$/ })).toBeDefined()
  await pane.unmount()
})

const MODE = { component: 'SessionMode' as const, props: { modes: [] as string[] } }
const MEASURE = {
  context: { tokens: 394_000, window: 1_000_000, percent: 39 },
  rateLimits: [],
  cost: { usd: 0.5 },
  changed: ['context', 'cost'],
}

test('nút Nén cạnh thanh context chạy /compact ngay', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-11-09T01:28:00Z') })
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('command.list', () => ({ value: [{ name: 'compact', description: 'nén', source: 'builtin' as const }] }) as never)
  const runs: { command: string; args: string }[] = []
  on('command.run', (_$, e) => {
    runs.push({ command: e.command, args: e.args })
    return { text: 'Compacted' }
  })
  const filled: string[] = []
  on('prompt.fill', (_$, e) => {
    filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  await $.session.measure({ ...MEASURE, rateLimits: [], changed: [...MEASURE.changed] } as never)

  const ui = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...MODE } as never)
  expect(await ui.find({ type: 'Text', text: /^ 394k$/ })).toBeDefined()
  // 394k của mốc 600k là mức vàng: nút rõ bình thường, không mờ.
  const btn = await ui.find({ key: 'compact' })
  expect(btn?.props.label).toBe('Nén')
  expect(btn?.props.dimColor).toBe(false)
  await ui.press({ key: 'compact' })
  await clock.advance(0)
  await ui.unmount()

  expect(runs.map(r => r.command)).toEqual(['compact'])
  expect(runs[0]?.args).toMatch(/mục tiêu/)
  expect(filled).toHaveLength(0)
})

test('không chạy được /compact thì để sẵn /compact trong ô chat', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-11-09T01:28:00Z') })
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('command.list', () => ({ value: [] }) as never)
  const filled: string[] = []
  on('prompt.fill', (_$, e) => {
    filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  await $.session.measure({ ...MEASURE, rateLimits: [], changed: [...MEASURE.changed] } as never)

  const ui = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...MODE } as never)
  await ui.press({ key: 'compact' })
  await clock.advance(0)
  await ui.unmount()
  expect(filled).toEqual(['/compact'])
})

