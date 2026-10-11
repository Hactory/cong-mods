export type Snap = {
  ctxTokens: number | null
  ctxPercent: number | null
  costUsd: number | null
  limits: { kind: string; percentUsed: number; resetsAt: string | null }[]
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type ProgTask = { id: string; text: string; active: string | null; status: TaskStatus }

export type ProgAgent = {
  key: string
  agentId: string | null
  desc: string
  kind: string
  model: string | null
  isBackground: boolean
  startedAt: number
  endedAt: number | null
  isError: boolean
}

export type ProgSession = { title: string; at: number }

export type Prog = {
  goal: { text: string; startedAt: number } | null
  tasks: ProgTask[]
  agents: ProgAgent[]
  sessions: ProgSession[]
}

/** Bản tóm tắt tiến độ Haiku soạn từ transcript khi phiên không có danh sách việc. */
export type AiSum = { goal: string; done: string[]; doing: string | null; next: string[]; at: number }

declare module 'claude-code' {
  interface PluginState {
    'cache-keeper': {
      lastAt: number | null
      tick: number
      snap: Snap | null
      steps: string[]
      busy: string | null
      prog: Prog
      aiSum: AiSum | null
      aiBusy: boolean
    }
  }
}
