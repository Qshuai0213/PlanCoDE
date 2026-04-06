import { NavLink } from 'react-router-dom'
import { useAgentStore } from '../../stores/agentStore'
import { useEventStore } from '../../stores/eventStore'
import { useSettingStore } from '../../stores/settingStore'

const navItems = [
  { to: '/', label: '总览' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/general', label: 'General' },
  { to: '/history', label: '记录' },
  { to: '/settings', label: '设置' },
]

function shorten(text: string, fallback: string) {
  if (!text) return fallback
  return text.length > 28 ? `${text.slice(0, 25)}...` : text
}

export function WorkbenchSidebar() {
  const { activeRuns } = useAgentStore()
  const { workdir, model } = useSettingStore()
  const { generalThreads, activeGeneralThreadId } = useEventStore()

  const activeThread =
    generalThreads.find((thread) => thread.id === activeGeneralThreadId) ??
    generalThreads[0] ??
    null
  const latestRound = activeThread?.rounds.at(-1)
  const latestThinking = [...(latestRound?.events ?? [])]
    .reverse()
    .find((event) => event.type === 'thinking' && typeof event.content === 'string' && event.content.trim())

  const latestThinkingText = latestThinking?.content?.trim() || '发出新消息后，这里会实时显示当前思考片段。'
  const activeGeneralRun = activeRuns.find((run) => run.scope === 'general')

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-[rgba(11,20,38,0.92)]">
      <div className="border-b border-border px-4 py-4">
        <div className="text-base font-semibold text-text-primary">PlanCoDE Desktop</div>
      </div>

      <nav className="px-3 py-3">
        <div className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-accent-plan/15 text-text-primary'
                    : 'text-text-secondary hover:bg-white/[0.05] hover:text-text-primary'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="px-3 pb-3">
        <div className="rounded-xl border border-border bg-[rgba(255,255,255,0.03)] p-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full border border-accent-plan/40 ${
                activeGeneralRun
                  ? 'animate-spin border-t-accent-plan border-r-transparent border-b-transparent border-l-transparent'
                  : 'bg-white/20'
              }`}
            />
            <div className="text-sm font-medium text-text-primary">
              {activeGeneralRun ? 'AI 思考中' : 'AI 空闲中'}
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-[#07101d] px-3 py-3 text-xs leading-6 text-text-secondary">
            {activeGeneralRun ? latestThinkingText : '发出新消息后，这里会实时显示当前思考片段。'}
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-border px-4 py-4 text-xs text-text-secondary">
        <div className="mb-3">
          <div className="mb-1 text-[11px] uppercase tracking-[0.18em]">状态</div>
          <div className="text-sm text-text-primary">
            {activeRuns.length > 0 ? `${activeRuns.length} 个运行中` : '空闲'}
          </div>
        </div>
        <div className="mb-3">
          <div className="mb-1 text-[11px] uppercase tracking-[0.18em]">模型</div>
          <div className="text-sm text-text-primary">{shorten(model, '未配置')}</div>
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.18em]">目录</div>
          <div className="break-all text-sm text-text-primary">{shorten(workdir, '未配置')}</div>
        </div>
      </div>
    </aside>
  )
}
