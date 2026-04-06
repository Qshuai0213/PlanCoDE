import { useAgentStore } from '../../stores/agentStore'

export function ControlStatusBar() {
  const { activeRuns } = useAgentStore()
  const generalRuns = activeRuns.filter((run) => run.scope === 'general').length
  const pipelineRuns = activeRuns.filter((run) => run.scope === 'pipeline').length

  return (
    <footer className="flex h-10 shrink-0 items-center gap-4 border-t border-border bg-[rgba(7,15,28,0.92)] px-4 text-xs text-text-secondary">
      <span>General: <span className="text-text-primary">{generalRuns}</span></span>
      <span>Pipeline: <span className="text-text-primary">{pipelineRuns}</span></span>
      <span>Active Runs: <span className="text-text-primary">{activeRuns.length}</span></span>
      <span className="ml-auto text-text-secondary">并行运行已启用</span>
    </footer>
  )
}
