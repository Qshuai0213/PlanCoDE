import { create } from 'zustand'
import type { AgentType, DangerousEvent } from '../types'

interface ActiveRun {
  runId: string
  agentType: AgentType
  scope: 'general' | 'pipeline'
  startedAt: number
}

interface AgentStore {
  activeRuns: ActiveRun[]
  dangerousByRun: Record<string, DangerousEvent>

  registerRun: (run: ActiveRun) => void
  finishRun: (runId: string) => void
  setDangerousEvent: (runId: string, event: DangerousEvent) => void
  clearDangerousEvent: (runId: string) => void
  reset: () => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  activeRuns: [],
  dangerousByRun: {},

  registerRun: (run) =>
    set((state) => ({
      activeRuns: [...state.activeRuns.filter((item) => item.runId !== run.runId), run],
    })),

  finishRun: (runId) =>
    set((state) => {
      const { [runId]: _removed, ...dangerousByRun } = state.dangerousByRun
      return {
        activeRuns: state.activeRuns.filter((item) => item.runId !== runId),
        dangerousByRun,
      }
    }),

  setDangerousEvent: (runId, event) =>
    set((state) => ({
      dangerousByRun: {
        ...state.dangerousByRun,
        [runId]: event,
      },
    })),

  clearDangerousEvent: (runId) =>
    set((state) => {
      const { [runId]: _removed, ...dangerousByRun } = state.dangerousByRun
      return { dangerousByRun }
    }),

  reset: () => set({ activeRuns: [], dangerousByRun: {} }),
}))
