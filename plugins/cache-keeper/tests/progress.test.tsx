import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane' as const,
  requestId: 'tien-do',
  props: { bodyColumns: 60, scroll: { offset: 0, bodyRows: 30 }, view: {} },
}

test('bảng tiến độ đếm việc và subagent', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-11T10:00:00Z') })
  on('tool.call', (_$, e) =>
    e.tool === 'Agent' ? { result: { agentId: 'ag1' } } : { result: { oldTodos: [], newTodos: [] } },
  )

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
        { content: 'Quét repo', status: 'completed', activeForm: 'Đang quét repo' },
        { content: 'Viết plan', status: 'in_progress', activeForm: 'Đang viết plan' },
        { content: 'Code', status: 'pending', activeForm: 'Đang code' },
    ],
  } as never)
  await $.tool.call({ tool: 'Agent', description: 'scout repo', prompt: 'x', model: 'haiku' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'cache-keeper', surface, ...PANE } as never)
    expect(await ui.find({ type: 'Text', text: /1\/3 \(33%\)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Đang viết plan/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Subagent: 0 đang chạy \/ 1/ })).toBeDefined()
    await ui.unmount()
  }
})

test('thanh có nút tiến độ và copy ID', async $ => {
  const ui = await $.ui.mount({
    plugin: 'cache-keeper',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 140, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  })
  expect(await ui.find({ key: 'copy-id' })).toBeDefined()
  expect(await ui.find({ key: 'progress' })).toBeDefined()
  await ui.unmount()
})

test('chưa có danh sách việc thì Haiku tóm tắt và bảng vẫn hiện', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-11T10:00:00Z') })
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'Làm mod tiến độ', toolUses: [] },
      { role: 'assistant', text: 'Đã viết xong phần thanh', toolUses: [] },
    ],
  }) as never)
  on('model.complete', () => ({
    value: {
      isAnswered: true as const,
      text: '{"goal":"Làm mod tiến độ","done":["Viết thanh"],"doing":"Viết bảng","next":["Test"]}',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  }))

  const ui = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', ...PANE } as never)
  expect(await ui.find({ type: 'Text', text: /tóm tắt bằng Haiku/ })).toBeDefined()
  await ui.press({ key: 'ai-sum' })
  expect(await ui.find({ type: 'Text', text: /Làm mod tiến độ/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1\/3 \(33%\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /▶ Viết bảng/ })).toBeDefined()
  await ui.unmount()
})
