import { useEffect, useMemo, useRef, useState } from 'react'
import { RuntimeDangerDialog } from '../components/dialogs/RuntimeDangerDialog'
import { EventTimeline } from '../components/timeline/EventTimeline'
import { useAgentStore } from '../stores/agentStore'
import { useEventStore } from '../stores/eventStore'
import { useSettingStore } from '../stores/settingStore'
import type { GeneralMessage } from '../types'

function generateRunId() {
  return `general-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildEnv(model: string, apiKey: string, baseUrl: string, provider: string) {
  return {
    MODEL_ID: model,
    ...(apiKey &&
      (provider === 'anthropic'
        ? { ANTHROPIC_API_KEY: apiKey, ANTHROPIC_AUTH_TOKEN: apiKey }
        : { OPENAI_API_KEY: apiKey })),
    ...(baseUrl &&
      (provider === 'anthropic'
        ? { ANTHROPIC_BASE_URL: baseUrl }
        : { OPENAI_BASE_URL: baseUrl })),
  }
}

function toConversationMessages(messages: GeneralMessage[]) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))
}

function AnimatedMessage({
  message,
  animate,
  onAnimationDone,
}: {
  message: GeneralMessage
  animate: boolean
  onAnimationDone?: () => void
}) {
  const [displayed, setDisplayed] = useState(animate ? '' : message.content)

  useEffect(() => {
    if (!animate) {
      setDisplayed(message.content)
      return
    }

    let index = 0
    setDisplayed('')
    const step = Math.max(1, Math.ceil(message.content.length / 150))
    const timer = window.setInterval(() => {
      index += step
      const next = message.content.slice(0, index)
      setDisplayed(next)
      if (index >= message.content.length) {
        window.clearInterval(timer)
        onAnimationDone?.()
      }
    }, 18)

    return () => window.clearInterval(timer)
  }, [animate, message.content, message.id, onAnimationDone])

  return (
    <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-primary">
      {displayed}
      {animate && displayed.length < message.content.length && (
        <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-accent-plan align-middle" />
      )}
    </div>
  )
}

export function GeneralDeckPage() {
  const [input, setInput] = useState('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [animatedMessageId, setAnimatedMessageId] = useState<string | null>(null)
  const stoppedRunIdsRef = useRef(new Set<string>())
  const previousAssistantMessageIdRef = useRef<string | null>(null)
  const previousThreadIdRef = useRef<string | null>(null)
  const messageScrollerRef = useRef<HTMLDivElement | null>(null)

  const {
    generalThreads,
    activeGeneralThreadId,
    createGeneralThread,
    selectGeneralThread,
    deleteGeneralThread,
    clearGeneralThread,
    startGeneralRound,
    pushGeneralEvent,
    finishGeneralRound,
  } = useEventStore()
  const { model, apiKey, baseUrl, provider } = useSettingStore()
  const { registerRun, finishRun, dangerousByRun, setDangerousEvent, clearDangerousEvent } =
    useAgentStore()

  const activeThread = useMemo(
    () =>
      generalThreads.find((thread) => thread.id === activeGeneralThreadId) ??
      generalThreads[0] ??
      null,
    [activeGeneralThreadId, generalThreads],
  )

  const currentRound = activeThread?.rounds.at(-1)
  const currentActivity = currentRound?.events ?? []
  const isRunning = activeThread?.status === 'running'
  const dangerousEvent = activeRunId ? dangerousByRun[activeRunId] : undefined
  const latestAssistantMessageId =
    [...(activeThread?.messages ?? [])].reverse().find((message) => message.role !== 'user')?.id ??
    null

  function scrollToBottom(behavior: ScrollBehavior = 'auto') {
    const target = messageScrollerRef.current
    if (!target) return
    target.scrollTo({ top: target.scrollHeight, behavior })
  }

  useEffect(() => {
    const threadId = activeThread?.id ?? null
    if (threadId !== previousThreadIdRef.current) {
      previousThreadIdRef.current = threadId
      previousAssistantMessageIdRef.current = latestAssistantMessageId
      setAnimatedMessageId(null)
      const raf = window.requestAnimationFrame(() => scrollToBottom('auto'))
      return () => window.cancelAnimationFrame(raf)
    }

    if (latestAssistantMessageId && latestAssistantMessageId !== previousAssistantMessageIdRef.current) {
      setAnimatedMessageId(latestAssistantMessageId)
    }
    previousAssistantMessageIdRef.current = latestAssistantMessageId
  }, [activeThread?.id, latestAssistantMessageId])

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      scrollToBottom(isRunning ? 'smooth' : 'auto')
    })
    return () => window.cancelAnimationFrame(raf)
  }, [activeThread?.id, activeThread?.messages.length, currentActivity.length, isRunning])

  async function handleSend() {
    const prompt = input.trim()
    if (!prompt || !activeThread || isRunning) return

    const runId = generateRunId()
    const env = buildEnv(model, apiKey, baseUrl, provider)
    const conversationMessages = [
      ...toConversationMessages(activeThread.messages),
      { role: 'user', content: prompt },
    ]
    const { threadId } = startGeneralRound(activeThread.id, prompt, runId)

    setInput('')
    setActiveRunId(runId)
    registerRun({ runId, agentType: 'general', scope: 'general', startedAt: Date.now() })

    const cleanup = () => {
      finishRun(runId)
      clearDangerousEvent(runId)
      setActiveRunId((current) => (current === runId ? null : current))
      offEvent()
      offDangerous()
      offResult()
      offExit()
      offStderr()
    }

    const offEvent = window.electronAPI.onAgentEvent((payload) => {
      if (payload.runId !== runId) return

      const eventType =
        payload.name === 'on_thinking'
          ? 'thinking'
          : payload.name === 'on_tool_call'
            ? 'tool_call'
            : payload.name === 'on_tool_result'
              ? 'tool_result'
              : payload.name === 'on_compact'
                ? 'compact'
                : payload.name === 'on_bg_result'
                  ? 'bg_result'
                  : payload.name === 'on_loop_end'
                    ? 'end'
                    : 'thinking'

      pushGeneralEvent(threadId, runId, {
        type: eventType,
        name: payload.name.replace('on_', ''),
        content: typeof payload.data === 'string' ? payload.data : payload.data?.content,
        input: payload.data?.input,
        output: payload.data?.output,
        data: payload.data,
      } as any)
    })

    const offDangerous = window.electronAPI.onDangerous((payload) => {
      if (payload.runId !== runId) return
      setDangerousEvent(runId, payload.data)
    })

    const offResult = window.electronAPI.onResult((payload) => {
      if (payload.runId !== runId) return
      finishGeneralRound(threadId, runId, 'done', payload.content || '')
      cleanup()
    })

    const offExit = window.electronAPI.onExit((payload) => {
      if (payload.runId !== runId) return
      const wasStoppedManually = stoppedRunIdsRef.current.has(runId)
      if (wasStoppedManually) {
        stoppedRunIdsRef.current.delete(runId)
      }
      finishGeneralRound(
        threadId,
        runId,
        'error',
        wasStoppedManually
          ? '本轮已手动中断。你可以继续输入新的消息重新开始。'
          : `Agent 进程已退出，但没有返回最终结果。\nexit code: ${payload.code ?? 'null'}`,
      )
      cleanup()
    })

    const offStderr = window.electronAPI.onStderr((payload) => {
      if (payload.runId !== runId) return
      pushGeneralEvent(threadId, runId, {
        type: 'thinking',
        content: `[stderr] ${payload.msg}`,
      })
    })

    try {
      await window.electronAPI.startAgent({
        runId,
        agentType: 'general',
        options: { prompt, messages: conversationMessages },
        workdir: '',
        env,
      })
    } catch (error) {
      finishGeneralRound(threadId, runId, 'error', `启动失败:\n${String(error)}`)
      cleanup()
    }
  }

  async function handleStopRun() {
    if (!activeRunId || !activeThread || !isRunning) return
    stoppedRunIdsRef.current.add(activeRunId)
    try {
      await window.electronAPI.stopAgent(activeRunId)
    } catch (error) {
      stoppedRunIdsRef.current.delete(activeRunId)
      finishGeneralRound(activeThread.id, activeRunId, 'error', `手动中断失败:\n${String(error)}`)
      finishRun(activeRunId)
      clearDangerousEvent(activeRunId)
      setActiveRunId((current) => (current === activeRunId ? null : current))
    }
  }

  function handleNewThread() {
    const id = createGeneralThread()
    selectGeneralThread(id)
  }

  function handleConfirmDangerous(action: 'deny' | 'allow' | 'allow_all') {
    if (!activeRunId) return
    void window.electronAPI.confirmDangerous(activeRunId, action !== 'deny', action === 'allow_all')
    clearDangerousEvent(activeRunId)
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden px-5 py-5">
      <div className="flex h-full min-h-0 w-full gap-5 overflow-hidden">
        <aside className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-[rgba(16,26,47,0.9)]">
          <div className="border-b border-border px-4 py-4">
            <div className="text-lg font-medium text-text-primary">General Threads</div>
            <div className="mt-1 text-sm text-text-secondary">
              对话历史集中在这里，可以新建、切换、清空和删除。
            </div>
            <button
              onClick={handleNewThread}
              className="mt-4 w-full rounded-lg bg-accent-plan px-3 py-2 text-sm font-medium text-[#061120]"
            >
              新建线程
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="space-y-2">
              {generalThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => selectGeneralThread(thread.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left ${
                    thread.id === activeThread?.id
                      ? 'border-accent-plan/40 bg-accent-plan/10'
                      : 'border-border bg-[rgba(255,255,255,0.02)]'
                  }`}
                >
                  <div className="text-sm font-medium text-text-primary">{thread.title}</div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {new Date(thread.updatedAt).toLocaleString('zh-CN')}
                  </div>
                  <div className="mt-2 text-xs text-text-secondary">
                    {thread.status} · {thread.messages.length} 条消息
                  </div>
                </button>
              ))}
            </div>
          </div>

          {activeThread && (
            <div className="border-t border-border px-3 py-3">
              <div className="flex gap-2">
                <button
                  onClick={() => clearGeneralThread(activeThread.id)}
                  disabled={isRunning}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-text-primary disabled:opacity-50"
                >
                  清空
                </button>
                <button
                  onClick={() => deleteGeneralThread(activeThread.id)}
                  disabled={isRunning}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-text-primary disabled:opacity-50"
                >
                  删除
                </button>
              </div>
            </div>
          )}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-[rgba(16,26,47,0.9)]">
          <div className="border-b border-border px-5 py-4">
            <div className="text-lg font-medium text-text-primary">{activeThread?.title || 'General'}</div>
            <div className="mt-1 text-sm text-text-secondary">
              最终答复显示在主聊天区，思考和工具过程显示在右侧活动面板。
            </div>
          </div>

          <div ref={messageScrollerRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-4">
              {(activeThread?.messages.length ?? 0) === 0 && (
                <div className="rounded-lg border border-dashed border-border bg-[rgba(255,255,255,0.02)] p-5 text-sm text-text-secondary">
                  从这里开始一段新对话。进入线程时不会重播旧消息，新的答复会在底部以流式方式进入。
                </div>
              )}

              {activeThread?.messages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-xl border p-4 ${
                    message.role === 'user'
                      ? 'ml-14 border-accent-plan/30 bg-accent-plan/10'
                      : message.role === 'assistant'
                        ? 'mr-14 border-border bg-[rgba(255,255,255,0.03)]'
                        : 'mr-14 border-red-500/20 bg-red-500/10'
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                    {message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Assistant' : 'System'}
                  </div>
                  <AnimatedMessage
                    message={message}
                    animate={message.id === animatedMessageId && message.role !== 'user'}
                    onAnimationDone={() => {
                      setAnimatedMessageId((current) => (current === message.id ? null : current))
                    }}
                  />
                </article>
              ))}

              {isRunning && (
                <article className="mr-14 rounded-xl border border-accent-plan/20 bg-accent-plan/8 p-4">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                    <span className="h-3 w-3 rounded-full border border-accent-plan/40 border-t-accent-plan border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                    Assistant
                  </div>
                  <div className="mt-3 text-sm leading-7 text-text-secondary">正在思考并组织回复...</div>
                </article>
              )}
            </div>
          </div>

          <div className="border-t border-border px-5 py-4">
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
                disabled={isRunning || !activeThread}
                placeholder="输入你的问题或任务。Enter 发送，Shift + Enter 换行。"
                className="h-24 flex-1 resize-none rounded-lg border border-border bg-[#07101d] px-3 py-3 text-sm leading-6 text-text-primary outline-none placeholder:text-text-secondary/50 disabled:opacity-50"
              />
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => void handleSend()}
                  disabled={isRunning || !input.trim() || !activeThread}
                  className="h-fit rounded-lg bg-accent-developer px-4 py-2 text-sm font-medium text-[#1c1200] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  发送
                </button>
                <button
                  onClick={() => void handleStopRun()}
                  disabled={!isRunning || !activeRunId}
                  className="h-fit rounded-lg border border-border px-4 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  强制打断
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-[rgba(16,26,47,0.9)]">
          <div className="border-b border-border px-4 py-4">
            <div className="text-lg font-medium text-text-primary">活动面板</div>
            <div className="mt-1 text-sm text-text-secondary">
              实时思考、工具调用、stderr 与退出状态都会显示在这里。
            </div>
          </div>
          <div className="grid gap-3 border-b border-border px-4 py-4">
            <div className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-3">
              <div className="text-xs text-text-secondary">线程状态</div>
              <div className="mt-1 text-sm text-text-primary">{activeThread?.status || 'idle'}</div>
            </div>
            <div className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-3">
              <div className="text-xs text-text-secondary">当前回合</div>
              <div className="mt-1 text-sm text-text-primary">{currentRound?.status || '暂无'}</div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-4 py-4">
            <EventTimeline events={currentActivity} isRunning={isRunning} maxItems={50} />
          </div>
        </aside>
      </div>

      {dangerousEvent && (
        <RuntimeDangerDialog
          command={dangerousEvent.command}
          tool={dangerousEvent.tool}
          onConfirm={handleConfirmDangerous}
        />
      )}
    </div>
  )
}
