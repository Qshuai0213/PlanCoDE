import { useEffect, useMemo, useRef } from 'react'
import type { AgentEvent } from '../../types'

interface Props {
  events: AgentEvent[]
  isRunning?: boolean
  maxItems?: number
  newestFirst?: boolean
}

const eventStyle: Record<AgentEvent['type'], { label: string; tone: string; badge: string }> = {
  thinking: {
    label: 'Thinking',
    tone: 'border-white/10 bg-white/[0.03]',
    badge: 'text-accent-plan',
  },
  tool_call: {
    label: 'Tool Call',
    tone: 'border-amber-400/20 bg-amber-500/10',
    badge: 'text-amber-300',
  },
  tool_result: {
    label: 'Tool Result',
    tone: 'border-emerald-400/20 bg-emerald-500/10',
    badge: 'text-emerald-300',
  },
  compact: {
    label: 'Compact',
    tone: 'border-fuchsia-400/20 bg-fuchsia-500/10',
    badge: 'text-fuchsia-300',
  },
  inbox: {
    label: 'Inbox',
    tone: 'border-sky-400/20 bg-sky-500/10',
    badge: 'text-sky-300',
  },
  bg_result: {
    label: 'Background',
    tone: 'border-teal-400/20 bg-teal-500/10',
    badge: 'text-teal-300',
  },
  dangerous: {
    label: 'Danger',
    tone: 'border-rose-400/20 bg-rose-500/10',
    badge: 'text-rose-300',
  },
  end: {
    label: 'End',
    tone: 'border-accent-plan/20 bg-accent-plan/10',
    badge: 'text-accent-plan',
  },
}

function formatTime(timestamp?: number) {
  if (!timestamp) return '--:--:--'
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatBody(event: AgentEvent) {
  if (event.content) return String(event.content)
  if (event.output) return String(event.output)
  if (event.input) return JSON.stringify(event.input, null, 2)
  if (event.data) return JSON.stringify(event.data, null, 2)
  return ''
}

export function EventTimeline({ events, isRunning = false, maxItems, newestFirst = false }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const items = useMemo(() => {
    const sliced = maxItems ? events.slice(-maxItems) : events
    return newestFirst ? [...sliced].reverse() : sliced
  }, [events, maxItems, newestFirst])

  useEffect(() => {
    if (!ref.current) return
    ref.current.scrollTo({
      top: newestFirst ? 0 : ref.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [items, newestFirst])

  return (
    <div ref={ref} className="h-full min-h-0 space-y-3 overflow-y-auto pr-1">
      {isRunning && newestFirst && (
        <div className="flex items-center gap-3 rounded-3xl border border-accent-plan/20 bg-accent-plan/10 px-4 py-3 text-sm text-text-primary">
          <span className="orb h-2.5 w-2.5 rounded-full bg-accent-plan text-accent-plan" />
          活动仍在继续接入...
        </div>
      )}

      {items.length === 0 && (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-text-secondary">
          这里暂时还没有活动。Agent 开始运行后，思考、工具调用、结果和错误都会实时出现在这里。
        </div>
      )}

      {items.map((event, index) => {
        const style = eventStyle[event.type]
        const body = formatBody(event)

        return (
          <article key={`${event.type}-${event.timestamp ?? index}-${index}`} className={`rounded-3xl border p-4 ${style.tone}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`text-[11px] uppercase tracking-[0.22em] ${style.badge}`}>{style.label}</span>
                {event.name && (
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-text-primary">
                    {event.name}
                  </span>
                )}
              </div>
              <span className="font-mono text-[11px] text-text-secondary">{formatTime(event.timestamp)}</span>
            </div>

            {body && (
              <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">
                {body.length > 600 ? `${body.slice(0, 600)}...` : body}
              </pre>
            )}
          </article>
        )
      })}

      {isRunning && !newestFirst && (
        <div className="flex items-center gap-3 rounded-3xl border border-accent-plan/20 bg-accent-plan/10 px-4 py-3 text-sm text-text-primary">
          <span className="orb h-2.5 w-2.5 rounded-full bg-accent-plan text-accent-plan" />
          活动仍在继续接入...
        </div>
      )}
    </div>
  )
}
