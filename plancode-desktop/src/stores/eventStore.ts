import { create } from 'zustand'
import type {
  AgentEvent,
  GeneralMessage,
  GeneralRound,
  GeneralThread,
  PipelineRun,
  PipelineStage,
  RunStatus,
  Session,
} from '../types'

const GENERAL_THREADS_STORAGE_KEY = 'plancode-general-threads'
const PIPELINE_RUNS_STORAGE_KEY = 'plancode-pipeline-runs'
const ACTIVE_GENERAL_THREAD_STORAGE_KEY = 'plancode-active-general-thread'

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function now() {
  return Date.now()
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function normalizeGeneralThreads(threads: GeneralThread[]): GeneralThread[] {
  return threads.map((thread) => {
    if (thread.status !== 'running') return thread
    return {
      ...thread,
      status: 'error',
      updatedAt: now(),
      messages: [
        ...thread.messages,
        {
          id: generateId('msg'),
          role: 'system',
          content: '上一次会话在应用关闭前未正常结束，已恢复为可继续输入状态。',
          timestamp: now(),
        },
      ],
      rounds: thread.rounds.map((round, index, rounds) =>
        index === rounds.length - 1 && round.status === 'running'
          ? {
              ...round,
              status: 'error',
              endedAt: now(),
              errorMessage: round.errorMessage || '应用重启后已中断上一轮运行。',
            }
          : round,
      ),
    }
  })
}

function normalizePipelineRuns(runs: PipelineRun[]): PipelineRun[] {
  return runs.map((run) =>
    run.status === 'running'
      ? {
          ...run,
          status: 'error',
          updatedAt: now(),
          finalContent:
            run.finalContent || '该 Pipeline 在应用关闭前未正常结束，已恢复为可重新运行状态。',
        }
      : run,
  )
}

function deriveTitle(prompt: string) {
  const normalized = prompt.trim().replace(/\s+/g, ' ')
  if (!normalized) return '新对话'
  return normalized.length > 24 ? `${normalized.slice(0, 24)}...` : normalized
}

function createEmptyThread(): GeneralThread {
  const timestamp = now()
  return {
    id: generateId('thread'),
    title: '新对话',
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'idle',
    messages: [],
    rounds: [],
  }
}

interface EventStore {
  generalThreads: GeneralThread[]
  activeGeneralThreadId: string | null
  pipelineRuns: PipelineRun[]
  activePipelineRunId: string | null
  loadSessions: () => void
  createGeneralThread: () => string
  selectGeneralThread: (threadId: string) => void
  deleteGeneralThread: (threadId: string) => void
  clearGeneralThread: (threadId: string) => void
  startGeneralRound: (threadId: string, prompt: string, runId: string) => { threadId: string; roundId: string }
  pushGeneralEvent: (threadId: string, runId: string, event: AgentEvent) => void
  finishGeneralRound: (threadId: string, runId: string, status: RunStatus, content?: string) => void
  createPipelineRun: (params: { stage: PipelineStage; goal?: string; planContent?: string; designContent?: string }) => string
  setActivePipelineRun: (runId: string) => void
  deletePipelineRun: (runId: string) => void
  updatePipelineRun: (runId: string, patch: Partial<PipelineRun>) => void
  pushPipelineEvent: (runId: string, event: AgentEvent) => void
  finishPipelineRun: (runId: string, status: RunStatus, patch?: Partial<PipelineRun>) => void
  listSessionSummaries: () => Session[]
}

export const useEventStore = create<EventStore>((set, get) => ({
  generalThreads: [],
  activeGeneralThreadId: null,
  pipelineRuns: [],
  activePipelineRunId: null,

  loadSessions: () => {
    const generalThreads = normalizeGeneralThreads(safeRead<GeneralThread[]>(GENERAL_THREADS_STORAGE_KEY, []))
    const pipelineRuns = normalizePipelineRuns(safeRead<PipelineRun[]>(PIPELINE_RUNS_STORAGE_KEY, []))
    const activeGeneralThreadId = safeRead<string | null>(ACTIVE_GENERAL_THREAD_STORAGE_KEY, null)

    const threads = generalThreads.length > 0 ? generalThreads : [createEmptyThread()]
    const activeThreadId = threads.some((thread) => thread.id === activeGeneralThreadId)
      ? activeGeneralThreadId
      : threads[0].id

    set({
      generalThreads: threads,
      activeGeneralThreadId: activeThreadId,
      pipelineRuns,
      activePipelineRunId: pipelineRuns[0]?.id ?? null,
    })
    localStorage.setItem(GENERAL_THREADS_STORAGE_KEY, JSON.stringify(threads))
    localStorage.setItem(PIPELINE_RUNS_STORAGE_KEY, JSON.stringify(pipelineRuns))
  },

  createGeneralThread: () => {
    const thread = createEmptyThread()
    set((state) => {
      const generalThreads = [thread, ...state.generalThreads]
      localStorage.setItem(GENERAL_THREADS_STORAGE_KEY, JSON.stringify(generalThreads))
      localStorage.setItem(ACTIVE_GENERAL_THREAD_STORAGE_KEY, JSON.stringify(thread.id))
      return { generalThreads, activeGeneralThreadId: thread.id }
    })
    return thread.id
  },

  selectGeneralThread: (threadId) => {
    localStorage.setItem(ACTIVE_GENERAL_THREAD_STORAGE_KEY, JSON.stringify(threadId))
    set({ activeGeneralThreadId: threadId })
  },

  deleteGeneralThread: (threadId) => {
    set((state) => {
      const filtered = state.generalThreads.filter((thread) => thread.id !== threadId)
      const generalThreads = filtered.length > 0 ? filtered : [createEmptyThread()]
      const activeGeneralThreadId =
        state.activeGeneralThreadId === threadId ? generalThreads[0].id : state.activeGeneralThreadId

      localStorage.setItem(GENERAL_THREADS_STORAGE_KEY, JSON.stringify(generalThreads))
      localStorage.setItem(ACTIVE_GENERAL_THREAD_STORAGE_KEY, JSON.stringify(activeGeneralThreadId))
      return { generalThreads, activeGeneralThreadId }
    })
  },

  clearGeneralThread: (threadId) => {
    set((state) => {
      const generalThreads = state.generalThreads.map((thread) =>
        thread.id === threadId
          ? { ...thread, updatedAt: now(), status: 'idle' as RunStatus, messages: [], rounds: [], title: '新对话' }
          : thread,
      )
      localStorage.setItem(GENERAL_THREADS_STORAGE_KEY, JSON.stringify(generalThreads))
      return { generalThreads }
    })
  },

  startGeneralRound: (threadId, prompt, runId) => {
    const roundId = generateId('round')
    const messageId = generateId('msg')
    const timestamp = now()
    const userMessage: GeneralMessage = {
      id: messageId,
      role: 'user',
      content: prompt,
      timestamp,
    }
    const round: GeneralRound = {
      id: roundId,
      runId,
      prompt,
      startedAt: timestamp,
      status: 'running',
      events: [],
    }

    set((state) => {
      const generalThreads = state.generalThreads.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              title: thread.messages.length === 0 ? deriveTitle(prompt) : thread.title,
              updatedAt: timestamp,
              status: 'running' as RunStatus,
              messages: [...thread.messages, userMessage],
              rounds: [...thread.rounds, round],
            }
          : thread,
      )
      localStorage.setItem(GENERAL_THREADS_STORAGE_KEY, JSON.stringify(generalThreads))
      return { generalThreads }
    })

    return { threadId, roundId }
  },

  pushGeneralEvent: (threadId, runId, event) => {
    const eventWithTimestamp = { ...event, timestamp: event.timestamp ?? now() }
    set((state) => {
      const generalThreads = state.generalThreads.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              updatedAt: now(),
              rounds: thread.rounds.map((round) =>
                round.runId === runId ? { ...round, events: [...round.events, eventWithTimestamp] } : round,
              ),
            }
          : thread,
      )
      localStorage.setItem(GENERAL_THREADS_STORAGE_KEY, JSON.stringify(generalThreads))
      return { generalThreads }
    })
  },

  finishGeneralRound: (threadId, runId, status, content) => {
    const timestamp = now()
    set((state) => {
      const generalThreads = state.generalThreads.map((thread) => {
        if (thread.id !== threadId) return thread

        const assistantMessageId = content ? generateId('msg') : undefined
        const nextMessages = content
          ? [
              ...thread.messages,
              {
                id: assistantMessageId!,
                role: status === 'error' ? 'system' : 'assistant',
                content,
                timestamp,
              } satisfies GeneralMessage,
            ]
          : thread.messages

        return {
          ...thread,
          updatedAt: timestamp,
          status,
          messages: nextMessages,
          rounds: thread.rounds.map((round) =>
            round.runId === runId
              ? {
                  ...round,
                  endedAt: timestamp,
                  status,
                  finalMessageId: assistantMessageId,
                  errorMessage: status === 'error' ? content : round.errorMessage,
                }
              : round,
          ),
        }
      })
      localStorage.setItem(GENERAL_THREADS_STORAGE_KEY, JSON.stringify(generalThreads))
      return { generalThreads }
    })
  },

  createPipelineRun: ({ stage, goal = '', planContent = '', designContent = '' }) => {
    const timestamp = now()
    const run: PipelineRun = {
      id: generateId('pipeline'),
      stage,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'running',
      goal,
      planContent,
      designContent,
      finalContent: '',
      events: [],
    }

    set((state) => {
      const pipelineRuns = [run, ...state.pipelineRuns].slice(0, 20)
      localStorage.setItem(PIPELINE_RUNS_STORAGE_KEY, JSON.stringify(pipelineRuns))
      return { pipelineRuns, activePipelineRunId: run.id }
    })

    return run.id
  },

  setActivePipelineRun: (runId) => set({ activePipelineRunId: runId }),

  deletePipelineRun: (runId) => {
    set((state) => {
      const filtered = state.pipelineRuns.filter((run) => run.id !== runId)
      const nextActivePipelineRunId =
        state.activePipelineRunId === runId ? filtered[0]?.id ?? null : state.activePipelineRunId
      localStorage.setItem(PIPELINE_RUNS_STORAGE_KEY, JSON.stringify(filtered))
      return { pipelineRuns: filtered, activePipelineRunId: nextActivePipelineRunId }
    })
  },

  updatePipelineRun: (runId, patch) => {
    set((state) => {
      const pipelineRuns = state.pipelineRuns.map((run) =>
        run.id === runId ? { ...run, ...patch, updatedAt: now() } : run,
      )
      localStorage.setItem(PIPELINE_RUNS_STORAGE_KEY, JSON.stringify(pipelineRuns))
      return { pipelineRuns }
    })
  },

  pushPipelineEvent: (runId, event) => {
    const eventWithTimestamp = { ...event, timestamp: event.timestamp ?? now() }
    set((state) => {
      const pipelineRuns = state.pipelineRuns.map((run) =>
        run.id === runId ? { ...run, updatedAt: now(), events: [...run.events, eventWithTimestamp] } : run,
      )
      localStorage.setItem(PIPELINE_RUNS_STORAGE_KEY, JSON.stringify(pipelineRuns))
      return { pipelineRuns }
    })
  },

  finishPipelineRun: (runId, status, patch = {}) => {
    set((state) => {
      const pipelineRuns = state.pipelineRuns.map((run) =>
        run.id === runId ? { ...run, ...patch, updatedAt: now(), status } : run,
      )
      localStorage.setItem(PIPELINE_RUNS_STORAGE_KEY, JSON.stringify(pipelineRuns))
      return { pipelineRuns }
    })
  },

  listSessionSummaries: () => {
    const { generalThreads, pipelineRuns } = get()

    const generalSessions: Session[] = generalThreads.map((thread) => ({
      id: thread.id,
      agentType: 'general',
      startTime: thread.createdAt,
      endTime: thread.status === 'running' ? undefined : thread.updatedAt,
      roundCount: thread.rounds.length,
      toolCallCount: thread.rounds.reduce(
        (count, round) => count + round.events.filter((event) => event.type === 'tool_call').length,
        0,
      ),
      status: thread.status === 'idle' ? 'done' : thread.status,
      summary: thread.messages.at(-1)?.content || thread.title,
    }))

    const pipelineSessions: Session[] = pipelineRuns.map((run) => ({
      id: run.id,
      agentType: run.stage,
      startTime: run.createdAt,
      endTime: run.status === 'running' ? undefined : run.updatedAt,
      roundCount: run.events.filter((event) => event.type === 'thinking').length,
      toolCallCount: run.events.filter((event) => event.type === 'tool_call').length,
      status: run.status === 'idle' ? 'done' : run.status,
      summary: run.finalContent || run.goal || run.planContent || run.designContent,
    }))

    return [...generalSessions, ...pipelineSessions].sort((a, b) => b.startTime - a.startTime)
  },
}))
