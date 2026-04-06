import { useMemo } from 'react'
import { useEventStore } from '../stores/eventStore'

function formatDuration(startTime: number, endTime?: number) {
  if (!endTime) return '运行中'
  const seconds = Math.max(1, Math.round((endTime - startTime) / 1000))
  return `${seconds}s`
}

export function SessionHistoryPage() {
  const summaries = useEventStore((state) => state.listSessionSummaries())

  const metrics = useMemo(() => ({
    done: summaries.filter((item) => item.status === 'done').length,
    running: summaries.filter((item) => item.status === 'running').length,
    error: summaries.filter((item) => item.status === 'error').length,
  }), [summaries])

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
          <h2 className="text-2xl font-semibold text-text-primary">运行记录</h2>
          <p className="mt-2 text-sm text-text-secondary">
            General 历史主入口已经并入聊天页；这里保留运行摘要，方便查看 General 线程与 Pipeline 运行概况。
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-4">
            <div className="text-xs text-text-secondary">Done</div>
            <div className="mt-2 text-2xl text-text-primary">{metrics.done}</div>
          </div>
          <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-4">
            <div className="text-xs text-text-secondary">Running</div>
            <div className="mt-2 text-2xl text-text-primary">{metrics.running}</div>
          </div>
          <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-4">
            <div className="text-xs text-text-secondary">Error</div>
            <div className="mt-2 text-2xl text-text-primary">{metrics.error}</div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
          <h3 className="text-lg font-medium text-text-primary">最近记录</h3>
          <div className="mt-4 space-y-3">
            {summaries.map((session) => (
              <div key={session.id} className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-text-primary">{session.agentType}</div>
                  <div className="text-xs text-text-secondary">
                    {new Date(session.startTime).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
                  <span className="rounded-full border border-border px-2 py-1">状态 {session.status}</span>
                  <span className="rounded-full border border-border px-2 py-1">轮次 {session.roundCount}</span>
                  <span className="rounded-full border border-border px-2 py-1">工具 {session.toolCallCount}</span>
                  <span className="rounded-full border border-border px-2 py-1">耗时 {formatDuration(session.startTime, session.endTime)}</span>
                </div>
                {session.summary && (
                  <div className="mt-3 line-clamp-2 text-sm text-text-secondary">{session.summary}</div>
                )}
              </div>
            ))}

            {summaries.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-[rgba(255,255,255,0.02)] p-5 text-sm text-text-secondary">
                还没有运行记录。
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
