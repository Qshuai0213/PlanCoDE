export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'compact' | 'inbox' | 'bg_result' | 'end' | 'dangerous'
  content?: string
  name?: string
  input?: any
  output?: string
  messages?: any[]
  data?: any
  timestamp?: number
}

export type RunStatus = 'idle' | 'running' | 'done' | 'error'
export type AgentType = 'plan' | 'design' | 'execute' | 'general'
export type PipelineStage = 'plan' | 'design' | 'execute'

export interface Session {
  id: string
  agentType: AgentType
  startTime: number
  endTime?: number
  roundCount: number
  toolCallCount: number
  status: 'running' | 'done' | 'error'
  summary?: string
}

export interface DangerousEvent {
  command: string
  tool: string
}

export interface ApiProfile {
  id: string
  name: string
  provider: 'anthropic' | 'openai' | 'ollama'
  model: string
  apiKey: string
  baseUrl: string
}

export interface GeneralMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface GeneralRound {
  id: string
  runId: string
  prompt: string
  startedAt: number
  endedAt?: number
  status: RunStatus
  events: AgentEvent[]
  finalMessageId?: string
  errorMessage?: string
}

export interface GeneralThread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  status: RunStatus
  messages: GeneralMessage[]
  rounds: GeneralRound[]
}

export interface PipelineRun {
  id: string
  stage: PipelineStage
  createdAt: number
  updatedAt: number
  status: RunStatus
  goal: string
  planContent: string
  designContent: string
  finalContent: string
  events: AgentEvent[]
}

export interface AgentEventPayload {
  runId: string
  name: string
  data: any
}

export interface AgentDangerousPayload {
  runId: string
  data: DangerousEvent
}

export interface AgentResultPayload {
  runId: string
  agent: AgentType
  content: string
  round_count: number
  tool_call_count: number
}

declare global {
  interface Window {
    electronAPI: {
      startAgent: (options: {
        runId: string
        agentType: string
        options: Record<string, any>
        workdir: string
        env: Record<string, string>
      }) => Promise<{ status: string; runId: string }>
      stopAgent: (runId: string) => Promise<{ status: string; existed?: boolean }>
      confirmDangerous: (runId: string, allow: boolean, allowAll: boolean) => Promise<{ status: string }>
      getSettings: () => Promise<Record<string, any>>
      saveSettings: (settings: Record<string, any>) => Promise<{ status: string }>
      selectWorkdir: () => Promise<{ filePaths: string[] } | null>
      testConnection: (params: { provider: string; apiKey: string; baseUrl: string; model: string }) => Promise<{ status: string; message: string }>
      openPath: (targetPath: string) => Promise<{ status: string; message?: string }>
      readTextFile: (targetPath: string) => Promise<{ status: string; content?: string; message?: string }>
      checkWorkdir: (targetPath: string) => Promise<{
        status: string
        exists?: boolean
        hasVisibleEntries?: boolean
        entryCount?: number
        sampleEntries?: string[]
        message?: string
      }>
      confirmRestartPlanning: (targetPath: string, sampleEntries: string[]) => Promise<{ status: string; confirmed?: boolean }>
      getGeneralWorkspaceInfo: () => Promise<{
        status: string
        workspaceDir?: string
        projectRoot?: string
        skillDirs?: string[]
      }>
      onAgentEvent: (callback: (payload: AgentEventPayload) => void) => () => void
      onDangerous: (callback: (payload: AgentDangerousPayload) => void) => () => void
      onResult: (callback: (payload: AgentResultPayload) => void) => () => void
      onExit: (callback: (payload: { runId: string; code: number | null }) => void) => () => void
      onStderr: (callback: (payload: { runId: string; msg: string }) => void) => () => void
    }
  }
}
