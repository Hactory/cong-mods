import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10 }, view: {} },
}
const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

test('nút lưu ý mở bảng, Haiku rút lưu ý từ cả phiên', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-13T10:00:00Z') })
  on('ui.render', () => ({ type: 'engine' as const, ref: 0 }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'Đẩy bản mới lên repo', toolUses: [] },
      { role: 'assistant', text: 'Đã đẩy, nhưng phần plugin công khai chưa chạy thử', toolUses: [] },
    ],
  }) as never)
  on('model.complete', () => ({
    value: {
      isAnswered: true as const,
      text: '{"items":[{"kind":"unverified","text":"Phần plugin công khai chưa chạy thử","why":"Người nhận có thể gặp lỗi"},{"kind":"decide","text":"Chưa chọn khởi động lại app hay gõ lệnh","why":"Phiên cũ vẫn chạy bản cũ"}]}',
      usage: USAGE,
    },
  }))

  const band = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...BAND })
  expect(await band.find({ key: 'notes' })).toBeDefined()
  await band.unmount()

  const ui = await $.ui.mount({
    plugin: 'cache-keeper',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'luu-y',
    props: { bodyColumns: 60, scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as never)
  await ui.press({ key: 'notes-refresh' })
  expect(await ui.find({ type: 'Text', text: /Chưa chọn khởi động lại app/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /cần anh quyết/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /chưa kiểm chứng/ })).toBeDefined()
  expect(await ui.find({ key: 'ask-0' })).toBeDefined()
  await ui.unmount()

  const again = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...BAND })
  expect(JSON.stringify(await again.find({ key: 'notes' }))).toContain('lưu ý (2)')
  await again.unmount()
})

test('thẻ Heads up của plugin bên dưới vẫn hiện, thay chỗ gợi ý', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-13T10:00:00Z') })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('model.complete', () => ({ value: { isAnswered: true as const, text: '1. Chạy test\n2. Mở PR\n3. Gộp', usage: USAGE } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>Heads up · Claude đã tắt bước kiểm tra</Text>
  })

  await $.turn.complete({ answer: 'Xong.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(50)

  const ui = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...BAND })
  expect(await ui.find({ type: 'Text', text: /Heads up · Claude đã tắt bước kiểm tra/ })).toBeDefined()
  expect(await ui.find({ key: 'step-0' })).toBeUndefined()
  expect(await ui.find({ key: 'handoff' })).toBeDefined()
  await ui.unmount()
})
