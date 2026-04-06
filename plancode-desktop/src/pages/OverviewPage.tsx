import { useNavigate } from 'react-router-dom'
import { useAgentStore } from '../stores/agentStore'
import { useEventStore } from '../stores/eventStore'
import { useSettingStore } from '../stores/settingStore'

export function OverviewPage() {
  const navigate = useNavigate()
  const { activeRuns } = useAgentStore()
  const { generalThreads, pipelineRuns } = useEventStore()
  const { provider, model, workdir } = useSettingStore()

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
          <h2 className="text-2xl font-semibold text-text-primary">总览</h2>
          <p className="mt-2 text-sm text-text-secondary">
            当前版本以 General 工作台为主，General 历史已经并入聊天页；这里保留轻量概览与入口。
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-4">
            <div className="text-xs text-text-secondary">活动运行</div>
            <div className="mt-2 text-lg text-text-primary">{activeRuns.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-4">
            <div className="text-xs text-text-secondary">General 线程</div>
            <div className="mt-2 text-lg text-text-primary">{generalThreads.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-4">
            <div className="text-xs text-text-secondary">Pipeline 运行</div>
            <div className="mt-2 text-lg text-text-primary">{pipelineRuns.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-4">
            <div className="text-xs text-text-secondary">模型</div>
            <div className="mt-2 text-lg break-all text-text-primary">{model || '未配置'}</div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
            <h3 className="text-lg font-medium text-text-primary">快速入口</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button onClick={() => navigate('/general')} className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] px-4 py-3 text-left hover:bg-[rgba(255,255,255,0.05)]">
                <div className="text-sm font-medium text-text-primary">General 工作台</div>
                <div className="mt-1 text-xs text-text-secondary">线程列表、对话与实时活动面板</div>
              </button>
              <button onClick={() => navigate('/pipeline')} className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] px-4 py-3 text-left hover:bg-[rgba(255,255,255,0.05)]">
                <div className="text-sm font-medium text-text-primary">Pipeline 工作流</div>
                <div className="mt-1 text-xs text-text-secondary">Plan / Design / Execute 独立运行</div>
              </button>
              <button onClick={() => navigate('/history')} className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] px-4 py-3 text-left hover:bg-[rgba(255,255,255,0.05)]">
                <div className="text-sm font-medium text-text-primary">运行记录</div>
                <div className="mt-1 text-xs text-text-secondary">查看 General 线程和 Pipeline 摘要</div>
              </button>
              <button onClick={() => navigate('/settings')} className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] px-4 py-3 text-left hover:bg-[rgba(255,255,255,0.05)]">
                <div className="text-sm font-medium text-text-primary">设置</div>
                <div className="mt-1 text-xs text-text-secondary">Provider、模型、目录、连接测试</div>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
            <h3 className="text-lg font-medium text-text-primary">当前配置</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="text-xs text-text-secondary">Provider</div>
                <div className="mt-1 text-text-primary">{provider || '未配置'}</div>
              </div>
              <div>
                <div className="text-xs text-text-secondary">Model</div>
                <div className="mt-1 break-all text-text-primary">{model || '未配置'}</div>
              </div>
              <div>
                <div className="text-xs text-text-secondary">Workdir</div>
                <div className="mt-1 break-all text-text-primary">{workdir || '未配置'}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
