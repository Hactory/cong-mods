import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  On,
  Register,
  RenderElement,
  RenderSurface,
  SessionMeasureInput,
  SessionUsage,
} from 'claude-code'

import type { AiSum, Handoff, Notes, Prog, ProgAgent, ProgTask, Snap, TaskStatus } from '../types'
import {
  NOTE_LABEL,
  parseNotes,
  COLD_WARN_MS,
  autoCompactHint,
  autoCompactInfo,
  infoSvg,
  shouldAutoCompact,
  cacheColor,
  cacheLabel,
  cacheLeft,
  compactLook,
  snapAfterCompact,
  ctxCells,
  fmtDur,
  fmtTok,
  bar,
  limitLabel,
  parseAiSum,
  parseSteps,
  parseYsk,
  pctColor,
  ctxPct,
  progLabel,
  ringGlyph,
  ringSvg,
  RING_SIZE,
  FLAME_SVG,
  splitHeadline,
  textOf,
  yskLabel,
} from './lib'
import type { YskCard } from './lib'

const lastAt = atom({ plugin: 'cache-keeper', key: 'lastAt' } as const, null)
const tick = atom({ plugin: 'cache-keeper', key: 'tick' } as const, 0)
const snap = atom({ plugin: 'cache-keeper', key: 'snap' } as const, null)
const steps = atom({ plugin: 'cache-keeper', key: 'steps' } as const, [] as string[])
const busy = atom({ plugin: 'cache-keeper', key: 'busy' } as const, null)
/**
 * Nút tích "tự nén khi cache còn 5 phút" của RIÊNG phiên này; null là phiên chưa lấy giá trị.
 * Phiên mới lấy lần bật/tắt cuối cùng ở bất kỳ phiên nào ($.store), chưa từng bấm thì bật.
 */
const autoCompact = atom({ plugin: 'cache-keeper', key: 'autoCompact' } as const, null as boolean | null)
/** Lúc nén xong gần nhất (mọi kiểu nén): chưa có lượt chat mới sau mốc này thì không tự nén lại. */
const compactedAt = atom({ plugin: 'cache-keeper', key: 'compactedAt' } as const, null as number | null)
const AUTO_KEY = 'autoCompact'

// ---- Bảng "Tiến độ" mở bên cạnh: mục tiêu, danh sách việc, subagent, phiên phụ ----

const PANE = 'tien-do'
const PANE_TITLE = 'Tiến độ'

const EMPTY: Prog = { goal: null, tasks: [], agents: [], sessions: [] }
const prog = atom({ plugin: 'cache-keeper', key: 'prog' } as const, EMPTY)

const isStatus = (s: unknown): s is TaskStatus =>
  s === 'pending' || s === 'in_progress' || s === 'completed'

/** Đọc một trường lồng nhau từ kết quả tool mà không tin kiểu của nó. */
function pick(v: unknown, ...path: string[]): unknown {
  let cur = v
  for (const k of path) {
    if (typeof cur !== 'object' || cur === null || !(k in cur)) return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

const aiSum = atom({ plugin: 'cache-keeper', key: 'aiSum' } as const, null as AiSum | null)
const aiBusy = atom({ plugin: 'cache-keeper', key: 'aiBusy' } as const, false)

const SUM_PROMPT = (log: string) => `Dưới đây là nhật ký rút gọn của một phiên làm việc với Claude Code (U: người dùng, A: Claude, [tool] là công cụ đã gọi).
<log>
${log}
</log>

Tóm tắt TIẾN ĐỘ của phiên thành đúng một khối JSON, không viết gì khác:
{"goal": "mục tiêu chính hiện tại, một câu", "done": ["việc đã xong"], "doing": "việc đang làm dở hoặc null", "next": ["việc còn lại hoặc nên làm tiếp"]}
Tiếng Việt có dấu, mỗi mục dưới 80 ký tự, tối đa 8 mục mỗi danh sách, chỉ ghi điều có trong nhật ký.`

async function summarizeSession($: EngineInterface) {
  if (await read($, aiBusy)) return
  await update($, aiBusy, () => true)
  try {
    const msgs = await $.session.messages()
    if ('deny' in msgs) return
    const log = msgs
      .slice(-80)
      .map(m => {
        const tools = m.toolUses.length ? ` [${m.toolUses.map(t => t.tool).join(', ')}]` : ''
        return `${m.role === 'user' ? 'U' : 'A'}: ${m.text.replace(/\s+/g, ' ').slice(0, 400)}${tools}`
      })
      .filter(l => l.length > 4)
      .join('\n')
      .slice(-24000)
    if (!log) {
      $.ui.toast('Phiên chưa có nội dung để tóm tắt')
      return
    }
    const ask = (model: string) =>
      $.model.complete({ model, prompt: SUM_PROMPT(log), maxTokens: 900, timeoutMs: 60_000 })
    let r = await ask('claude-haiku-5-5').catch(() => ask('haiku'))
    if (!r.isAnswered && r.reason === 'api-error') r = await ask('haiku')
    const body = r.isAnswered ? parseAiSum(r.text) : null
    if (!body) {
      $.ui.toast(r.isAnswered ? 'Haiku trả lời sai định dạng, bấm tóm tắt lại' : `Haiku không trả lời: ${r.reason}`)
      return
    }
    const at = await $.clock.now()
    await update($, aiSum, () => ({ ...body, at }))
  } finally {
    await update($, aiBusy, () => false)
  }
}

/** Mở bảng; phiên chưa có danh sách việc thì nhờ Haiku tóm tắt (cũ quá 5 phút thì tóm lại). */
async function openProgress($: EngineInterface) {
  await $.ui.open({ id: PANE, title: PANE_TITLE })
  const p = await read($, prog)
  if (p.tasks.length > 0) return
  const s = await read($, aiSum)
  const now = await $.clock.now()
  if (s === null || now - s.at > 5 * 60 * 1000) $.clock.after(0, () => void summarizeSession($))
}

function summarize(p: Prog) {
  const done = p.tasks.filter(t => t.status === 'completed').length
  const running = p.agents.filter(a => a.endedAt === null).length
  return { done, total: p.tasks.length, running }
}

async function progressStart($: EngineInterface) {
  await $.command.register({ name: 'tien-do', description: 'Mở bảng tiến độ của phiên bên cạnh' })
  await $.command.register({ name: 'luu-y', description: 'Mở bảng những lưu ý có thể đã bị bỏ sót trong phiên' })
}

let lastAsk = ''
// Mục tiêu mới bắt đầu khi có prompt mới mà việc cũ đã xong hết.
let isStale = false

async function progressPrompt($: EngineInterface, text: string) {
  lastAsk = text
  const s = summarize(await read($, prog))
  if (s.done === s.total && s.running === 0) isStale = true
}

function registerProgress(on: On) {

  const startGoalIfNeeded = (p: Prog, now: number): Prog => {
    if (p.goal === null || isStale) {
      isStale = false
      return { goal: { text: lastAsk, startedAt: now }, tasks: [], agents: p.agents.filter(a => a.endedAt === null), sessions: [] }
    }
    return p
  }

  on('command.run', { command: 'tien-do' }, async $ => {
    await openProgress($)
    return { text: 'Đã mở bảng tiến độ.' }
  })

  // Danh sách việc kiểu TodoWrite: thay cả danh sách.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const now = await $.clock.now()
    const tasks: ProgTask[] = e.todos.map((t, i) => ({
      id: `todo-${i}`,
      text: t.content,
      active: t.activeForm || null,
      status: t.status,
    }))
    await update($, prog, p => ({ ...startGoalIfNeeded(p, now), tasks }))
    return next(e)
  })

  // Danh sách việc kiểu TaskCreate / TaskUpdate: từng mục một.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    const id = ran.deny === undefined ? pick(ran.result, 'task', 'id') : undefined
    if (typeof id === 'string') {
      const now = await $.clock.now()
      const task: ProgTask = { id, text: e.subject, active: e.activeForm ?? null, status: 'pending' }
      await update($, prog, p => {
        const base = startGoalIfNeeded(p, now)
        return { ...base, tasks: [...base.tasks, task] }
      })
    }
    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && pick(ran.result, 'success') === true) {
      await update($, prog, p => ({
        ...p,
        tasks:
          e.status === 'deleted'
            ? p.tasks.filter(t => t.id !== e.taskId)
            : p.tasks.map(t =>
                t.id !== e.taskId
                  ? t
                  : {
                      ...t,
                      text: e.subject ?? t.text,
                      active: e.activeForm ?? t.active,
                      status: isStatus(e.status) ? e.status : t.status,
                    },
              ),
      }))
    }
    return ran
  })

  // Subagent: ghi lúc giao, chốt lúc xong (chạy nền thì chốt ở SubagentStop).
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const now = await $.clock.now()
    const agent: ProgAgent = {
      key: e.tool_use_id,
      agentId: null,
      desc: e.description,
      kind: e.subagent_type ?? 'general-purpose',
      model: e.model ?? null,
      // Bản Claude Code mới bỏ trường này khỏi kiểu (subagent mặc định chạy nền); đọc lỏng để bản cũ vẫn đúng.
      isBackground: pick(e, 'run_in_background') === true,
      startedAt: now,
      endedAt: null,
      isError: false,
    }
    await update($, prog, p => {
      const base = startGoalIfNeeded(p, now)
      return { ...base, agents: [...base.agents, agent].slice(-50) }
    })
    const ran = await next(e)
    const end = await $.clock.now()
    const rawId = ran.deny === undefined ? pick(ran.result, 'agentId') : undefined
    const agentId = typeof rawId === 'string' ? rawId : null
    await update($, prog, p => ({
      ...p,
      agents: p.agents.map(a =>
        a.key !== agent.key
          ? a
          : {
              ...a,
              agentId: agentId ?? a.agentId,
              endedAt: a.isBackground && ran.deny === undefined && !ran.isError ? a.endedAt : end,
              isError: ran.deny !== undefined || ran.isError === true,
            },
      ),
    }))
    return ran
  })

  on('classic.SubagentStart', async ($, e, next) => {
    await update($, prog, p => {
      if (p.agents.some(a => a.agentId === e.agent_id)) return p
      const idx = [...p.agents].reverse().findIndex(a => a.agentId === null && a.endedAt === null)
      if (idx < 0) return p
      const at = p.agents.length - 1 - idx
      return { ...p, agents: p.agents.map((a, i) => (i === at ? { ...a, agentId: e.agent_id } : a)) }
    })
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, prog, p => ({
      ...p,
      agents: p.agents.map(a => (a.agentId === e.agent_id && a.endedAt === null ? { ...a, endedAt: now } : a)),
    }))
    return next(e)
  })

  // Phiên phụ mở ra từ phiên này (start_session của app desktop).
  on('tool.call', async ($, e, next) => {
    if (!e.tool.endsWith('start_session')) return next(e)
    const ran = await next(e)
    const rawTitle = pick(e, 'title')
    const title = typeof rawTitle === 'string' ? rawTitle : 'phiên phụ'
    if (ran.deny === undefined && !ran.isError) {
      const now = await $.clock.now()
      await update($, prog, p => ({ ...p, sessions: [...p.sessions, { title, at: now }].slice(-20) }))
    }
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const p = await read($, prog)
    const now = await read($, tick)
    const { done, total, running } = summarize(p)
    const width = Math.max(10, Math.min(30, (e.props.bodyColumns ?? 40) - 16))
    const current = p.tasks.find(t => t.status === 'in_progress')
    const ai = await read($, aiSum)
    const isAiBusy = await read($, aiBusy)
    const showAi = total === 0 && ai !== null
    const aiTotal = ai ? ai.done.length + (ai.doing ? 1 : 0) + ai.next.length : 0

    const icon = (s: TaskStatus) => (s === 'completed' ? '✓' : s === 'in_progress' ? '▶' : '○')
    const tone = (s: TaskStatus) => (s === 'completed' ? 'success' : s === 'in_progress' ? 'warning' : 'inactive')

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>Mục tiêu</Text>
          <Text wrap="wrap">
            {total === 0 && ai
              ? ai.goal
              : p.goal
                ? p.goal.text.slice(0, 300) || '(chưa có prompt)'
                : isAiBusy
                  ? 'Đang nhờ Haiku tóm tắt phiên…'
                  : 'Chưa có danh sách việc, bấm "tóm tắt bằng Haiku".'}
          </Text>
          {p.goal && (
            <Text dimColor>
              ⏱ {fmtDur(Math.max(0, now - p.goal.startedAt))}
              {current ? ` · đang: ${current.active ?? current.text}` : ''}
            </Text>
          )}
        </Box>

        {showAi && ai && (
          <Box flexDirection="column">
            <Text>
              <Text color={ai.next.length === 0 && !ai.doing ? 'success' : 'warning'}>{bar(ai.done.length, aiTotal, width)}</Text>
              {` ${ai.done.length}/${aiTotal}${aiTotal ? ` (${Math.round((ai.done.length / aiTotal) * 100)}%)` : ''}`}
            </Text>
            {ai.done.map((t, i) => (
              <Text key={`ad-${i}`} color="success" wrap="truncate-end">✓ {t}</Text>
            ))}
            {ai.doing && <Text key="ag" color="warning" wrap="truncate-end">▶ {ai.doing}</Text>}
            {ai.next.map((t, i) => (
              <Text key={`an-${i}`} color="inactive" wrap="truncate-end">○ {t}</Text>
            ))}
            <Text dimColor>
              Haiku tóm tắt {fmtDur(Math.max(0, now - ai.at))} trước
              {isAiBusy ? ' · đang tóm tắt lại…' : ''}
            </Text>
          </Box>
        )}

        {total > 0 && (
          <Box flexDirection="column">
            <Text>
              <Text color={done === total ? 'success' : 'warning'}>{bar(done, total, width)}</Text>
              {` ${done}/${total} (${Math.round((done / total) * 100)}%)`}
            </Text>
            {p.tasks.map(t => (
              <Text key={`t-${t.id}`} color={tone(t.status)} wrap="truncate-end">
                {icon(t.status)} {t.text}
              </Text>
            ))}
          </Box>
        )}

        {p.agents.length > 0 && (
          <Box flexDirection="column">
            <Text bold>
              Subagent: {running} đang chạy / {p.agents.length}
            </Text>
            {[...p.agents].reverse().slice(0, 15).map(a => (
              <Text
                key={`a-${a.key}`}
                color={a.endedAt === null ? 'warning' : a.isError ? 'error' : 'success'}
                wrap="truncate-end"
              >
                {a.endedAt === null ? '▶' : a.isError ? '✗' : '✓'} {a.desc}
                <Text dimColor>
                  {` · ${a.kind}${a.model ? `/${a.model}` : ''}${a.isBackground ? ' · nền' : ''} · ${fmtDur((a.endedAt ?? now) - a.startedAt)}`}
                </Text>
              </Text>
            ))}
          </Box>
        )}

        {p.sessions.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Phiên phụ đã mở: {p.sessions.length}</Text>
            {p.sessions.map((s, i) => (
              <Text key={`s-${i}`} dimColor wrap="truncate-end">
                • {s.title}
              </Text>
            ))}
          </Box>
        )}

        <Box flexDirection="row" gap={3}>
          <Button
            key="ai-sum"
            label={isAiBusy ? 'đang tóm tắt…' : 'tóm tắt bằng Haiku'}
            plain
            onPress={() => void summarizeSession($)}
          />
          <Button key="reset" label="làm mới mục tiêu" plain onPress={() => update($, prog, () => EMPTY)} />
        </Box>
      </Box>
    )
  })
}

// ---- Bảng "Lưu ý": những điều dễ bị bỏ sót trong cả phiên ----

const NOTES_PANE = 'luu-y'
const NOTES_TITLE = 'Lưu ý'

const notes = atom({ plugin: 'cache-keeper', key: 'notes' } as const, null as Notes | null)
const notesBusy = atom({ plugin: 'cache-keeper', key: 'notesBusy' } as const, false)

const NOTES_PROMPT = (log: string) => `Dưới đây là nhật ký một phiên làm việc dài với Claude Code (U: người dùng, A: Claude, [tool] là công cụ đã gọi).
Người dùng là chủ sản phẩm, không phải lập trình viên. Câu trả lời dài và liên tục nên họ hay bỏ sót những ý quan trọng nằm lẫn giữa chừng.
<log>
${log}
</log>

Liệt kê những LƯU Ý người dùng có thể đã bỏ sót, trong CẢ phiên chứ không chỉ cuối phiên:
- decide: Claude đã hỏi hoặc chờ người dùng quyết mà chưa thấy trả lời
- risk: rủi ro, cảnh báo, tác dụng phụ Claude đã nhắc qua
- todo: việc Claude nói sẽ làm, "làm sau", "chưa làm", hoặc bước người dùng phải tự làm mà chưa thấy làm
- unverified: kết quả Claude nói là chưa kiểm chứng, chỉ test giả lập, hoặc giả định
- changed: Claude tự đổi hướng, đổi cấu hình, hoặc chọn thay người dùng mà không nói rõ
Bỏ qua việc đã được xử lý xong ở đoạn sau của nhật ký. Không bịa: chỉ ghi điều có trong nhật ký.

Trả đúng một khối JSON, không viết gì khác:
{"items": [{"kind": "decide|risk|todo|unverified|changed", "text": "lưu ý, một câu dưới 110 ký tự", "why": "vì sao đáng để ý, dưới 110 ký tự"}]}
Tiếng Việt có dấu, viết đời thường, tối đa 10 mục, mục quan trọng trước. Không có gì thì {"items": []}.`

async function collectNotes($: EngineInterface) {
  if (await read($, notesBusy)) return
  await update($, notesBusy, () => true)
  try {
    const msgs = await $.session.messages()
    if ('deny' in msgs) return
    const log = msgs
      .map(m => {
        const tools = m.toolUses.length ? ` [${m.toolUses.map(t => t.tool).join(', ')}]` : ''
        const cap = m.role === 'user' ? 500 : 900
        return `${m.role === 'user' ? 'U' : 'A'}: ${m.text.replace(/\s+/g, ' ').slice(0, cap)}${tools}`
      })
      .filter(l => l.length > 4)
      .join('\n')
      .slice(-80000)
    if (!log) {
      $.ui.toast('Phiên chưa có nội dung để rút lưu ý')
      return
    }
    const ask = (model: string) =>
      $.model.complete({ model, prompt: NOTES_PROMPT(log), maxTokens: 1500, timeoutMs: 90_000 })
    let r = await ask('claude-haiku-5-5').catch(() => ask('haiku'))
    if (!r.isAnswered && r.reason === 'api-error') r = await ask('haiku')
    const items = r.isAnswered ? parseNotes(r.text) : null
    if (!items) {
      $.ui.toast(r.isAnswered ? 'Haiku trả lời sai định dạng, bấm rút lại' : `Haiku không trả lời: ${r.reason}`)
      return
    }
    const at = await $.clock.now()
    await update($, notes, () => ({ items, at }))
  } finally {
    await update($, notesBusy, () => false)
  }
}

/** Mở bảng lưu ý; chưa có hoặc đã có lượt mới từ lần rút trước thì nhờ Haiku rút lại. */
async function openNotes($: EngineInterface) {
  await $.ui.open({ id: NOTES_PANE, title: NOTES_TITLE })
  const n = await read($, notes)
  const at = await read($, lastAt)
  if (n === null || (at !== null && at > n.at)) $.clock.after(0, () => void collectNotes($))
}

function registerNotes(on: On) {
  on('command.run', { command: 'luu-y' }, async $ => {
    await openNotes($)
    return { text: 'Đã mở bảng lưu ý.' }
  })

  on('ui.render', { component: 'Pane', requestId: NOTES_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const n = await read($, notes)
    const isBusy = await read($, notesBusy)
    const now = await read($, tick)
    const tone = (k: string) => (k === 'decide' || k === 'risk' ? 'warning' : k === 'unverified' ? 'error' : 'inactive')

    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor wrap="wrap">
          Những điều có thể anh đã bỏ sót trong cả phiên, do Haiku rút từ cuộc chat.
        </Text>
        {n === null ? (
          <Text>{isBusy ? 'Đang nhờ Haiku đọc lại cả phiên…' : 'Chưa có, bấm "rút lại".'}</Text>
        ) : n.items.length === 0 ? (
          <Text color="success">Không thấy lưu ý nào bị bỏ sót.</Text>
        ) : (
          n.items.map((it, i) => (
            <Box key={`n-${i}`} flexDirection="column">
              <Text wrap="wrap">
                <Text color={tone(it.kind)} bold>[{NOTE_LABEL[it.kind]}]</Text> {it.text}
              </Text>
              {it.why !== '' && <Text dimColor wrap="wrap">  {it.why}</Text>}
              <Button
                key={`ask-${i}`}
                label="hỏi Claude về ý này"
                plain
                onPress={() => $.prompt.fill({ text: `Nói rõ giúp tôi lưu ý này và đề xuất cách xử lý: ${it.text}`, mode: 'replace' })}
              />
            </Box>
          ))
        )}
        {n !== null && (
          <Text dimColor>
            Rút {fmtDur(Math.max(0, now - n.at))} trước{isBusy ? ' · đang rút lại…' : ''}
          </Text>
        )}
        <Button key="notes-refresh" label={isBusy ? 'đang rút…' : 'rút lại'} plain onPress={() => void collectNotes($)} />
      </Box>
    )
  })
}

// ---- Thanh trên ô nhập ----

const STEPS_PROMPT = (ask: string, answer: string) => `Bạn gợi ý bước tiếp theo cho một phiên lập trình với Claude Code.
Người dùng vừa hỏi:
<ask>${ask.slice(0, 1500)}</ask>
Claude vừa trả lời:
<answer>${answer.slice(-4000)}</answer>

Viết đúng 3 câu lệnh ngắn mà người dùng nhiều khả năng sẽ gõ tiếp, viết như chính họ ra lệnh cho Claude.
Tiếng Việt có dấu, mỗi câu dưới 70 ký tự, mỗi câu một dòng, không đánh số, không giải thích.`

const HANDOFF_PROMPT = `Viết bản HANDOFF để dán vào một phiên mới sau khi /clear, sao cho phiên mới làm tiếp được ngay mà không cần đọc lại cuộc chat.
Gồm các mục: Mục tiêu · Đã xong (kèm file, commit, PR) · Đang dở · Bước tiếp theo cụ thể · Quyết định và ràng buộc người dùng đã chốt · File, đường dẫn, lệnh quan trọng.
Tiếng Việt có dấu, gạch đầu dòng, ngắn gọn, không lời mở đầu.`

// ---- Handoff: soạn bản bàn giao, HIỆN ngay trên ô chat, copy sẵn, KHÔNG tự /clear ----
// Bản cũ tự /clear rồi dán vào ô nhập: trên app desktop, /clear dựng phiên mới với ô nhập mới nên
// chữ dán không tới, người dùng chỉ thấy phiên bị xoá (09/11). Giờ để người dùng tự /clear rồi dán.
// Nút chỉ hẹn việc rồi trả lời ngay: app desktop báo "ui_press failed" khi nút chờ soạn lâu.

const HANDOFF_PANE = 'handoff'
const HANDOFF_TITLE = 'Handoff'
const handoffDoc = atom({ plugin: 'cache-keeper', key: 'handoff' } as const, null as Handoff | null)
const handoffOpen = atom({ plugin: 'cache-keeper', key: 'handoffOpen' } as const, false)
const HANDOFF_BUSY = 'Đang soạn bản handoff…'

const handoffDraft = (doc: Handoff) => `Tiếp tục công việc từ bản handoff dưới đây (bản lưu: ${doc.file}):\n\n${doc.text}`

async function copyHandoff($: EngineInterface, doc: Handoff, surface: RenderSurface) {
  const r = await $.ui.copy({ text: handoffDraft(doc), surface })
  $.ui.toast(
    r.isCopied
      ? 'Đã copy bản handoff. Gõ /clear (hoặc mở phiên mới) rồi dán ⌘V'
      : `Không copy được (${r.reason}). Nội dung đang hiện trên ô chat, bấm "dán vào ô nhập" hoặc chép tay`,
  )
}

/** Hẹn soạn handoff ở nền để nút bấm trả lời ngay. */
function startHandoff($: EngineInterface, surface: RenderSurface) {
  $.clock.after(0, () => void makeHandoff($, surface))
}

/** Soạn bản handoff từ cả cuộc chat, lưu file, hiện trên ô chat, mở bảng và copy sẵn. Không đụng tới phiên. */
async function makeHandoff($: EngineInterface, surface: RenderSurface) {
  if ((await read($, busy)) === HANDOFF_BUSY) return
  await update($, busy, () => HANDOFF_BUSY)
  try {
    const r = await $.model.fork({ prompt: HANDOFF_PROMPT })
    if (!r.isAnswered) {
      $.ui.toast(`Handoff không soạn được: ${r.reason}`)
      return
    }
    const home = (await $.env.get('HOME')) ?? ''
    const at = await $.clock.now()
    const stamp = new Date(at).toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const file = `${home}/.claude/handoffs/${stamp}-${(await $.session.id()).slice(0, 8)}.md`
    await $.fs.write(file, r.text)
    const doc: Handoff = { text: r.text, file, at }
    await update($, handoffDoc, () => doc)
    await update($, handoffOpen, () => true)
    await update($, busy, () => null)
    await $.ui.open({ id: HANDOFF_PANE, title: HANDOFF_TITLE })
    await copyHandoff($, doc, surface)
  } catch (err) {
    $.ui.toast(`Handoff lỗi: ${String(err instanceof Error ? err.message : err).slice(0, 120)}`)
  } finally {
    if ((await read($, busy)) === HANDOFF_BUSY) await update($, busy, () => null)
  }
}

/**
 * Các nút của bản handoff, dùng chung cho thẻ trên ô chat và bảng bên.
 * Vẽ thành nút thật (không `plain`): Copy là nút chính, còn lại nút viền. App desktop chỉ vẽ chữ của
 * nhãn (không nhận hình SVG trong nút) nên icon là emoji đứng đầu nhãn.
 */
function handoffActions(
  $: EngineInterface,
  ui: ReturnType<EngineInterface['ui']['resolve']>,
  doc: Handoff,
  surface: RenderSurface,
  opts: { withClose: boolean; isBusy: boolean },
) {
  const { Button } = ui
  return [
    <Button key="handoff-copy" label="📋 Copy" variant="primary" onPress={() => void copyHandoff($, doc, surface)} />,
    <Button
      key="handoff-fill"
      label="📥 Dán vào ô nhập"
      variant="secondary"
      onPress={() => $.prompt.fill({ text: handoffDraft(doc), mode: 'replace' })}
    />,
    <Button
      key="handoff-redo"
      label={opts.isBusy ? '⏳ Đang soạn…' : '🔄 Soạn lại'}
      variant="secondary"
      onPress={() => startHandoff($, surface)}
    />,
    ...(opts.withClose
      ? [
          <Button
            key="handoff-close"
            label="✖️ Đóng"
            variant="secondary"
            onPress={() => update($, handoffOpen, () => false)}
          />,
        ]
      : []),
  ]
}

function registerHandoff(on: On) {
  on('ui.render', { component: 'Pane', requestId: HANDOFF_PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button, Markdown } = ui
    const doc = await read($, handoffDoc)
    const isBusy = (await read($, busy)) === HANDOFF_BUSY
    if (doc === null) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text>{isBusy ? HANDOFF_BUSY : 'Chưa có bản handoff.'}</Text>
          {!isBusy && <Button key="handoff-redo" label="📝 Soạn handoff" variant="primary" onPress={() => startHandoff($, e.surface)} />}
        </Box>
      )
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor wrap="wrap">
          {isBusy ? `${HANDOFF_BUSY} ` : ''}Muốn làm tiếp ở phiên sạch: gõ /clear (hoặc mở phiên mới) rồi dán ⌘V.
        </Text>
        <Box flexDirection="row" gap="sm" flexWrap="wrap">
          {handoffActions($, ui, doc, e.surface, { withClose: false, isBusy })}
        </Box>
        <Text dimColor wrap="wrap">{doc.file}</Text>
        <Markdown key="handoff-md" text={doc.text} />
      </Box>
    )
  })
}

// ---- Nút "Nén" cạnh thanh context: chạy /compact; không chạy được thì để sẵn /compact trong ô chat ----

const COMPACT_BUSY = 'Đang nén cuộc chat…'
const COMPACT_FOCUS =
  'Giữ đủ: mục tiêu, việc đã xong (file, commit, PR), việc đang dở, bước tiếp theo, quyết định và ràng buộc người dùng đã chốt.'

/** Hẹn nén ở nền để nút bấm trả lời ngay (/compact chạy lâu, và chờ tới khi Claude rảnh). */
function startCompact($: EngineInterface) {
  $.clock.after(0, () => void compactNow($))
}

/** Giá trị của phiên này; chưa có thì theo lần bật/tắt cuối (mặc định bật). */
async function autoCompactOn($: EngineInterface): Promise<boolean> {
  const own = await read($, autoCompact)
  if (own !== null) return own
  const saved = await $.store.get(AUTO_KEY).catch(() => undefined)
  return typeof saved === 'boolean' ? saved : true
}

async function toggleAutoCompact($: EngineInterface) {
  const isOn = !(await autoCompactOn($))
  await update($, autoCompact, () => isOn)
  await $.store.set(AUTO_KEY, isOn).catch(() => undefined)
  $.ui.toast(autoCompactHint(isOn))
}

/** `isAuto`: tự nén lúc cache sắp nguội; lỗi thì chỉ báo, không đè chữ đang gõ trong ô chat. */
async function compactNow($: EngineInterface, isAuto = false) {
  if ((await read($, busy)) === COMPACT_BUSY) return
  await update($, busy, () => COMPACT_BUSY)
  // Lý do không tự nén được; null là đã nén xong.
  let why: string | null = null
  try {
    const names = (await $.command.list()).map(c => c.name)
    if (!names.includes('compact')) {
      why = 'không thấy lệnh compact'
    } else {
      const r = await $.command.run({ command: 'compact', args: COMPACT_FOCUS })
      if (r.text !== undefined && /error|failed|lỗi|không thể/i.test(r.text)) why = r.text.replace(/\s+/g, ' ').slice(0, 100)
    }
  } catch (err) {
    why = String(err instanceof Error ? err.message : err).slice(0, 100)
  } finally {
    if ((await read($, busy)) === COMPACT_BUSY) await update($, busy, () => null)
  }
  if (why === null) {
    const t = await $.clock.now()
    await update($, compactedAt, () => t)
    $.ui.toast('Đã nén cuộc chat')
    return
  }
  if (isAuto) {
    $.ui.toast(`Tự nén không chạy được (${why}). Gõ /compact nếu muốn nén`)
    return
  }
  const r = await $.prompt.fill({ text: '/compact', mode: 'replace' }).catch(() => null)
  $.ui.toast(
    r?.isFilled
      ? `Chưa tự nén được (${why}). Đã để sẵn /compact trong ô chat, bấm gửi để nén`
      : `Chưa nén được (${why}). Gõ /compact để nén`,
  )
}

// ---- Thẻ You Should Know vẽ lại theo bản mẫu (desktop) ----

/** Màu nền trong suốt nên hợp cả giao diện sáng lẫn tối. */
const YSK_INK = { bg: '#f59e0b14', border: '#f59e0b40', tag: '#d97706' } as const

const BULB_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">' +
  '<circle cx="18" cy="18" r="18" fill="#f59e0b" fill-opacity="0.16"/>' +
  '<g transform="translate(6 6)" fill="none" stroke="#d97706" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
  '<path d="M9 18h6"/><path d="M10 22h4"/></g></svg>'

/**
 * Nút của YSK đổi kiểu như bản mẫu: phím 1 nút đặc, phím 2 nút viền, còn lại chữ trơn.
 * Chỉ đổi phần hiển thị; `press` (chỗ YSK giữ hàm xử lý) giữ nguyên nên bấm vẫn về YSK.
 */
function yskButton(b: YskCard['buttons'][number]): RenderElement {
  const props = b.props ?? {}
  const label = yskLabel(typeof props.label === 'string' ? props.label : textOf(b))
  const variant = props.hotkey === '1' ? 'primary' : props.hotkey === '2' ? 'secondary' : undefined
  const { plain: _plain, ...chrome } = props
  const out = {
    ...b,
    props: variant ? { ...chrome, label, variant } : { ...props, label },
    ...(b.children !== undefined ? { children: [label] } : {}),
  }
  return out as unknown as RenderElement
}

function toSnap(u: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'> | SessionMeasureInput): Snap {
  const order = (k: string) => (k === 'five_hour' ? 0 : k === 'seven_day' ? 1 : 2)
  return {
    ctxTokens: u.context.tokens ?? null,
    ctxPercent: u.context.tokens != null ? ctxPct(u.context.tokens) : (u.context.percent ?? null),
    costUsd: u.cost?.usd ?? null,
    limits: [...u.rateLimits]
      .sort((a, b) => order(a.kind) - order(b.kind))
      .map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt ?? null })),
  }
}

export const register: Register = on => {
  registerProgress(on)
  registerNotes(on)
  registerHandoff(on)
  let lastAsk = ''
  let warnedFor: number | null = null
  // Claude đang chạy một lượt (từ lúc gửi tới turn.complete): khi đó không tự nén.
  let isRunning = false
  // Mỗi mốc lastAt chỉ thử tự nén một lần, kể cả khi lần đó không nén được.
  let autoTriedFor: number | null = null

  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, tick, () => now)
    await progressStart($)
    const u = await $.session.usage()
    await update($, snap, () => toSnap(u))
    // Chỉ lấy lần bật/tắt cuối khi phiên chưa có giá trị riêng: /reload-plugins chạy lại session.start
    // nhưng không được đè lựa chọn của chính phiên này.
    if ((await read($, autoCompact)) === null) {
      const isOn = await autoCompactOn($)
      await update($, autoCompact, () => isOn)
    }

    $.clock.every(30_000, async () => {
      const t = await $.clock.now()
      await update($, tick, () => t)
      const at = await read($, lastAt)
      const isAuto = shouldAutoCompact({
        isOn: await autoCompactOn($),
        lastAt: at,
        now: t,
        compactedAt: await read($, compactedAt),
        isRunning,
        isBusy: (await read($, busy)) !== null,
        tokens: (await read($, snap))?.ctxTokens ?? null,
      })
      if (isAuto && at !== autoTriedFor) {
        autoTriedFor = at
        warnedFor = at
        $.ui.toast('Cache còn 5 phút: đang tự nén cuộc chat (tắt ở dấu tích cạnh nút Nén)')
        $.clock.after(0, () => void compactNow($, true))
        return
      }
      const left = cacheLeft(at, t)
      if (at !== null && left !== null && left > 0 && left <= COLD_WARN_MS && warnedFor !== at) {
        warnedFor = at
        $.ui.toast(`Cache còn ${fmtDur(left)}: gửi một câu để giữ ấm, hoặc bấm handoff`)
      }
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, snap, () => toSnap(e))
    return next(e)
  })

  // Nén xong (nút Nén, /compact gõ tay hay tự nén) thì cập nhật thanh context ngay bằng cỡ sau nén,
  // khỏi chờ lượt chat sau mới đo lại.
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (r.skip !== undefined || e.agentId !== undefined || e.trigger === 'precompute') return r
    let tokens = r.tokensAfter ?? null
    if (tokens === null) {
      tokens = await $.session
        .usage({ breakdown: 'summary' })
        .then(u => u.context.tokens ?? null)
        .catch(() => null)
    }
    if (tokens !== null) {
      const t = tokens
      await update($, snap, s => snapAfterCompact(s, t))
    }
    const done = await $.clock.now()
    await update($, compactedAt, () => done)
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    lastAsk = e.text
    isRunning = true
    await progressPrompt($, e.text)
    await update($, steps, () => [])
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    isRunning = false

    const now = await $.clock.now()
    await update($, lastAt, () => now)
    await update($, tick, () => now)

    const answer = e.answer
    const ask = lastAsk
    if (e.reason === 'answer' && !e.isAborted && answer.trim().length > 0) {
      // Tách khỏi dispatch của turn để không làm chậm lúc kết thúc lượt.
      $.clock.after(10, async () => {
        const r = await $.model.complete({
          model: 'haiku',
          prompt: STEPS_PROMPT(ask, answer),
          maxTokens: 300,
          timeoutMs: 30_000,
        })
        if (r.isAnswered) await update($, steps, () => parseSteps(r.text))
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    // Plugin bên dưới (vd. You should know) có thẻ cần hiện thì nhường chỗ cho thẻ đó,
    // thay cho danh sách gợi ý (cùng dùng phím 1, 2, 0). Phần engine tự vẽ thì bỏ qua.
    const below = await next(e)
    const belowCard = 'type' in below && below.type === 'engine' ? null : below

    const { Box, Button, Text, Markdown } = $.ui.resolve(e)
    const surface = e.surface
    // tick = 0 khi mod vừa nạp lại mà chưa có nhịp đếm: lấy giờ thật cho giờ reset.
    const now = (await read($, tick)) || (await $.clock.now())
    const at = await read($, lastAt)
    const s = await read($, snap)
    const list = await read($, steps)
    const working = await read($, busy)
    const pg = summarize(await read($, prog))
    const noteCount = (await read($, notes))?.items.length ?? 0

    const left = cacheLeft(at, now)
    // Cache ấm: ngọn lửa đỏ + chữ xanh (vàng/đỏ khi sắp nguội); nguội hoặc chưa rõ: vòng xám.
    const isWarm = e.props.isWorking || (left !== null && left > 0)
    const cacheText = cacheLabel(left, e.props.isWorking)
    const cacheTone = e.props.isWorking ? 'success' : cacheColor(left)
    const cacheIcon = (() => {
      if (!isWarm) return <Text key="cache-icon" color={cacheTone}>○</Text>
      if (e.surface === 'desktop') {
        const { Svg } = $.ui.resolve(e)
        return <Svg key="cache-icon" source={FLAME_SVG} alt="Lửa" width={16} height={16} />
      }
      return <Text key="cache-icon">🔥</Text>
    })()

    const costText = s?.costUsd != null ? ` · Tiền $${s.costUsd.toFixed(2)}` : ''

    // Vòng quota 5h/tuần nằm cùng hàng cache: desktop vẽ SVG (% giữa vòng), terminal dùng ký tự ◔◑◕.
    const quotas = (s?.limits ?? []).map(l => ({
      kind: l.kind,
      label: limitLabel(l.kind),
      pct: Math.round(l.percentUsed),
      left: l.resetsAt ? ` ↻${fmtDur(Date.parse(l.resetsAt) - now)}` : '',
    }))
    const quotaBlock = (() => {
      if (quotas.length === 0) return null
      if (e.surface === 'desktop') {
        const { Svg } = $.ui.resolve(e)
        return quotas.map(q => (
          <Box key={`quota-${q.kind}`} flexDirection="row" alignItems="center" gap="xs">
            <Svg source={ringSvg(q.pct)} alt={`Quota ${q.label} ${q.pct}%`} width={RING_SIZE} height={RING_SIZE} />
            <Text key={`qt-${q.kind}`} tabular>
              <Text dimColor>{q.label}</Text>
              {q.left}
            </Text>
          </Box>
        ))
      }
      return (
        <Text key="quota" wrap="truncate-end">
          {quotas.map(q => [
            <Text key={`q-${q.kind}`} color={pctColor(q.pct)}>{`${ringGlyph(q.pct)} ${q.pct}%`}</Text>,
            <Text key={`qt-${q.kind}`} dimColor>{` ${q.label}${q.left}   `}</Text>,
          ])}
        </Text>
      )
    })()

    // ⓘ mô tả dấu tích tự nén: dòng dưới ô nhập không hiện được chữ khi trỏ chuột, nên đặt ở đây (chỉ desktop,
    // Svg isInteractive mới hiện <title>).
    const autoInfo = await (async () => {
      if (e.surface !== 'desktop') return null
      const { Svg } = $.ui.resolve(e)
      const isOn = await autoCompactOn($)
      const text = autoCompactInfo(isOn)
      return <Svg key="auto-info" source={infoSvg(isOn, text)} alt={text} width={16} height={16} isInteractive />
    })()

    // Thẻ của plugin bên dưới (You Should Know) đứng riêng một khối, đủ chiều ngang.
    // Desktop: vẽ lại theo bản mẫu (bóng đèn, nhãn cam, tiêu đề đậm, dòng phụ, nút đặc/viền/trơn).
    const ysk = belowCard !== null ? parseYsk(belowCard) : null
    const cardBlock = (() => {
      if (belowCard === null) return null
      if (e.surface !== 'desktop' || ysk === null) {
        return (
          <Box key="ysk" flexDirection="column">
            {belowCard}
          </Box>
        )
      }
      const { Svg } = $.ui.resolve(e)
      const split = ysk.line !== null ? splitHeadline(ysk.line) : null
      return (
        <Box key="ysk" flexDirection="column" gap="sm">
          <Box
            flexDirection="row"
            alignItems="center"
            gap="md"
            borderStyle="round"
            borderColor={YSK_INK.border}
            backgroundColor={YSK_INK.bg}
            paddingX="md"
            paddingY="sm"
          >
            <Svg source={BULB_SVG} alt="Bóng đèn" width={36} height={36} />
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text size="caption" weight="semibold" color={YSK_INK.tag}>
                {ysk.tag.toUpperCase()}
              </Text>
              {split !== null
                ? [
                    <Text key="ysk-head" weight="semibold" wrap="wrap">
                      {split.headline}
                    </Text>,
                    split.detail !== '' ? (
                      <Text key="ysk-detail" size="footnote" dimColor wrap="wrap">
                        {split.detail}
                      </Text>
                    ) : null,
                  ]
                : (ysk.body as RenderElement)}
            </Box>
          </Box>
          <Box flexDirection="row" alignItems="center" gap="sm" flexWrap="wrap">
            {ysk.buttons.map(yskButton)}
          </Box>
        </Box>
      )
    })()

    const handoff = () => startHandoff($, surface)

    // Bản handoff vừa soạn hiện ngay trên ô chat (vùng này cuộn được trên app desktop).
    const hDoc = await read($, handoffDoc)
    const handoffCard =
      hDoc !== null && (await read($, handoffOpen)) ? (
        <Box
          key="handoff-card"
          flexDirection="column"
          gap="sm"
          {...(surface === 'desktop'
            ? { borderStyle: 'round' as const, borderColor: '#3b82f640', backgroundColor: '#3b82f60f', paddingX: 'md' as const, paddingY: 'sm' as const }
            : {})}
        >
          <Box flexDirection="row" gap={2} flexWrap="wrap" alignItems="center">
            <Text weight="semibold" bold>Bản handoff</Text>
            <Text dimColor size="footnote" wrap="truncate-middle">{hDoc.file}</Text>
          </Box>
          <Markdown key="handoff-card-md" text={hDoc.text} />
          <Box flexDirection="row" gap="sm" flexWrap="wrap" alignItems="center">
            {handoffActions($, $.ui.resolve(e), hDoc, surface, { withClose: true, isBusy: working === HANDOFF_BUSY })}
          </Box>
          <Text dimColor size="footnote" wrap="wrap">
            Đã copy sẵn. Muốn làm tiếp ở phiên sạch: gõ /clear (hoặc mở phiên mới) rồi dán ⌘V.
          </Text>
        </Box>
      ) : null

    const buttons = [
      <Button
        key="progress"
        label={progLabel(pg.done, pg.total, pg.running)}
        hotkey="t"
        plain
        onPress={() => void openProgress($)}
      />,
      <Button
        key="notes"
        label={noteCount > 0 ? `lưu ý (${noteCount})` : 'lưu ý'}
        hotkey="l"
        plain
        onPress={() => void openNotes($)}
      />,
      <Button
        key="copy-id"
        label="copy ID"
        hotkey="c"
        plain
        onPress={async () => {
          const id = await $.session.id()
          const r = await $.ui.copy({ text: id, surface })
          $.ui.toast(r.isCopied ? `Đã copy session ID: ${id}` : `Không copy được (${r.reason}). ID: ${id}`)
        }}
      />,
      <Button key="handoff" label="handoff" hotkey="h" plain onPress={handoff} />,
    ]
    // Thẻ YSK thay chỗ danh sách gợi ý (cùng dùng phím 1, 2, 0).
    const body =
      handoffCard !== null ? (
        working !== null ? [<Text key="busy" dimColor>{working}</Text>, handoffCard] : handoffCard
      ) : cardBlock !== null ? (
        cardBlock
      ) : working !== null ? (
        <Text dimColor>{working}</Text>
      ) : list.length > 0 ? (
        [
          ...list.map((t, i) => (
            <Button
              key={`step-${i}`}
              label={t}
              hotkey={String(i + 1)}
              plain
              onPress={async () => {
                await $.prompt.fill({ text: t, mode: 'replace' })
                await update($, steps, () => [])
              }}
            />
          )),
          <Button key="dismiss" label="bỏ qua" hotkey="0" plain onPress={() => update($, steps, () => [])} />,
        ]
      ) : null

    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        <Box flexDirection="row" alignItems="center" flexWrap="wrap" columnGap="lg">
          <Box flexDirection="row" alignItems="center" gap="xs" flexShrink={1}>
            {cacheIcon}
            <Text wrap="truncate-end">
              <Text color={cacheTone}>{cacheText}</Text>
              {costText !== '' ? <Text dimColor>{costText}</Text> : ''}
            </Text>
          </Box>
          {quotaBlock}
          {autoInfo}
        </Box>
        {/* Không có gì bên dưới, hoặc đang hiện bản handoff: nút xếp một hàng ngang sát phải để bản handoff
            chiếm trọn bề ngang. Có gợi ý hoặc thẻ YSK: nút xếp cột dọc bên phải. */}
        {body === null || handoffCard !== null ? (
          <Box flexDirection="column" gap="sm">
            <Box key="nut-ngang" flexDirection="row" gap={3} justifyContent="flex-end" flexWrap="wrap">
              {buttons}
            </Box>
            {body}
          </Box>
        ) : (
          <Box flexDirection="row" gap={2}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              {body}
            </Box>
            <Box key="nut-doc" flexDirection="column" flexShrink={0}>
              {buttons}
            </Box>
          </Box>
        )}
      </Box>
    )
  })

  // ---- Dưới ô nhập: thanh token ----
  // App desktop (4.23): dưới ô nhập phiên local chỉ có vùng SessionMode (cạnh tên model), tối đa 24 ký tự,
  // dồn phải, chỉ vẽ chữ có màu (bỏ Svg). Nên vẽ 10 ô ▰ cùng ký tự đổi màu + số gọn "394k".
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const s = await read($, snap)
    const tokens = s?.ctxTokens ?? null
    if (tokens === null) return next(e)
    const pct = s?.ctxPercent ?? ctxPct(tokens)
    const cells = ctxCells(pct)
    const { Box, Text, Button } = $.ui.resolve(e)
    const modes = e.props.modes
    const look = compactLook(pct, (await read($, busy)) === COMPACT_BUSY)
    const isAuto = await autoCompactOn($)
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text wrap="truncate-end">
          <Text key="ctx-on" color={pctColor(pct)}>{cells.on}</Text>
          <Text key="ctx-off" dimColor>{cells.off}</Text>
          <Text key="ctx-num" dimColor>{` ${fmtTok(tokens)}`}</Text>
        </Text>
        <Button key="compact" label={look.label} plain dimColor={look.dim} onPress={() => startCompact($)} />
        <Button
          key="auto-compact"
          label={isAuto ? '☑' : '☐'}
          plain
          dimColor={!isAuto}
          onPress={() => void toggleAutoCompact($)}
        />
        {modes.length > 0 ? <Text key="modes" dimColor>{modes.join(' & ')}</Text> : null}
      </Box>
    )
  })
}
