import { useEffect, useMemo, useRef, useState } from 'react'
import { RuntimeDangerDialog } from '../components/dialogs/RuntimeDangerDialog'
import { MarkdownDock } from '../components/editor/MarkdownDock'
import { EventTimeline } from '../components/timeline/EventTimeline'
import { useAgentStore } from '../stores/agentStore'
import { useEventStore } from '../stores/eventStore'
import { useSettingStore } from '../stores/settingStore'
import type { PipelineRun, PipelineStage, RunStatus } from '../types'

const stages: Array<{ key: PipelineStage; title: string; desc: string }> = [
  { key: 'plan', title: 'Plan', desc: '拆解目标并生成计划文档。' },
  { key: 'design', title: 'Design', desc: '基于 plan 持续迭代设计方案。' },
  { key: 'execute', title: 'Execute', desc: '启动项目并进入执行阶段。' },
]

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

function joinArtifactPath(workdir: string, filename: string) {
  return `${workdir.replace(/[\\/]+$/, '')}\\${filename}`
}

function nextStage(stage: PipelineStage): PipelineStage | null {
  if (stage === 'plan') return 'design'
  if (stage === 'design') return 'execute'
  return null
}

async function tryLoadReport(workdir: string) {
  const result = await window.electronAPI.readTextFile(joinArtifactPath(workdir, 'report.md'))
  return result.status === 'ok' ? result.content || '' : ''
}

export function PipelineDeckPage() {
  const [stage, setStage] = useState<PipelineStage>('plan')
  const [goal, setGoal] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [previewOverride, setPreviewOverride] = useState<{ title: string; content: string } | null>(null)
  const stoppedRunIdsRef = useRef(new Set<string>())

  const {
    pipelineRuns,
    activePipelineRunId,
    createPipelineRun,
    setActivePipelineRun,
    deletePipelineRun,
    updatePipelineRun,
    pushPipelineEvent,
    finishPipelineRun,
  } = useEventStore()
  const { workdir, model, apiKey, baseUrl, provider } = useSettingStore()
  const { registerRun, finishRun, dangerousByRun, setDangerousEvent, clearDangerousEvent } =
    useAgentStore()

  const activeRun = useMemo(
    () => pipelineRuns.find((run) => run.id === activePipelineRunId) ?? pipelineRuns[0] ?? null,
    [activePipelineRunId, pipelineRuns],
  )

  const currentRunId = activeRunId ?? activeRun?.id ?? null
  const currentDangerousEvent = currentRunId ? dangerousByRun[currentRunId] : undefined
  const isRunning = activeRun?.status === 'running'
  const lockedGoal = Boolean(activeRun)
  const currentStage = activeRun?.stage ?? 'plan'
  const nextStageKey = nextStage(currentStage)
  const hasWorkdir = Boolean(workdir.trim())

  const previewContent = useMemo(() => {
    if (previewOverride) return previewOverride.content
    if (!activeRun) return ''
    if (stage === 'plan') return activeRun.planContent
    if (stage === 'design') return activeRun.designContent
    return activeRun.finalContent || activeRun.designContent || activeRun.planContent
  }, [activeRun, previewOverride, stage])

  useEffect(() => {
    if (activeRun?.goal && !goal) {
      setGoal(activeRun.goal)
    }
  }, [activeRun?.goal, goal])

  useEffect(() => {
    if (activeRun) {
      setStage(activeRun.stage)
    }
  }, [activeRun?.id, activeRun?.stage])

  const canRunCurrentStage =
    hasWorkdir &&
    !isRunning &&
    (stage === 'plan'
      ? Boolean(goal.trim())
      : stage === 'design'
        ? Boolean(activeRun?.planContent.trim())
        : Boolean(activeRun?.designContent.trim() || activeRun?.planContent.trim())) &&
    stage === currentStage

  const canAdvanceStage =
    !isRunning &&
    Boolean(activeRun) &&
    Boolean(nextStageKey) &&
    (currentStage === 'plan'
      ? Boolean(activeRun?.planContent.trim())
      : currentStage === 'design'
        ? Boolean(activeRun?.designContent.trim())
        : false)

  async function runStage(target: PipelineStage, continueRevision = false) {
    if (!workdir) {
      alert('请先在设置页配置工作目录。')
      return
    }

    if (!activeRun && target === 'plan') {
      const inspection = await window.electronAPI.checkWorkdir(workdir)
      if (inspection.status === 'ok' && inspection.exists && inspection.hasVisibleEntries) {
        const confirmation = await window.electronAPI.confirmRestartPlanning(
          workdir,
          inspection.sampleEntries || [],
        )
        if (!confirmation.confirmed) {
          return
        }
      }
    }

    const shouldCreateRun = !activeRun && target === 'plan'
    const runId = shouldCreateRun
      ? createPipelineRun({ stage: target, goal, planContent: '', designContent: '' })
      : activeRun?.id

    if (!runId) return

    if (!shouldCreateRun && activeRun) {
      updatePipelineRun(runId, {
        stage: target,
        status: 'running',
        goal: activeRun.goal || goal,
        planContent: activeRun.planContent || '',
        designContent: activeRun.designContent || '',
        finalContent: target === 'execute' ? activeRun.finalContent || '' : '',
      })
    }

    setPreviewOverride(null)
    setActivePipelineRun(runId)
    setActiveRunId(runId)
    registerRun({ runId, agentType: target, scope: 'pipeline', startedAt: Date.now() })

    const env = buildEnv(model, apiKey, baseUrl, provider)
    const getRunSnapshot = (): PipelineRun | undefined =>
      useEventStore.getState().pipelineRuns.find((run) => run.id === runId)

    const finishPipeline = (status: RunStatus, patch: Record<string, string> = {}) => {
      finishPipelineRun(runId, status, patch)
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

      pushPipelineEvent(runId, {
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

    const offResult = window.electronAPI.onResult(async (payload) => {
      if (payload.runId !== runId) return

      if (target === 'plan') {
        updatePipelineRun(runId, {
          goal: activeRun?.goal || goal,
          planContent: payload.content || '',
          stage: 'plan',
        })
        setStage('plan')
        setEditPrompt('')
        finishPipeline('done', { planContent: payload.content || '' })
        return
      }

      if (target === 'design') {
        const snapshot = getRunSnapshot()
        updatePipelineRun(runId, {
          planContent: snapshot?.planContent || '',
          designContent: payload.content || '',
          stage: 'design',
        })
        setStage('design')
        setEditPrompt('')
        finishPipeline('done', {
          planContent: snapshot?.planContent || '',
          designContent: payload.content || '',
        })
        return
      }

      const snapshot = getRunSnapshot()
      const reportContent = await tryLoadReport(workdir)
      const finalContent = reportContent || payload.content || ''
      setPreviewOverride(reportContent ? { title: 'report.md', content: reportContent } : null)
      setEditPrompt('')
      finishPipeline('done', {
        planContent: snapshot?.planContent || '',
        designContent: snapshot?.designContent || '',
        finalContent,
      })
    })

    const offExit = window.electronAPI.onExit((payload) => {
      if (payload.runId !== runId) return
      const wasStoppedManually = stoppedRunIdsRef.current.has(runId)
      if (wasStoppedManually) {
        stoppedRunIdsRef.current.delete(runId)
      }
      finishPipeline('error', {
        finalContent: wasStoppedManually
          ? '本次 Pipeline 已手动停止。'
          : `Agent 进程已退出，code: ${payload.code ?? 'null'}`,
      })
    })

    const offStderr = window.electronAPI.onStderr((payload) => {
      if (payload.runId !== runId) return
      pushPipelineEvent(runId, { type: 'thinking', content: `[stderr] ${payload.msg}` })
    })

    try {
      const revision = editPrompt.trim()
      const options: Record<string, unknown> =
        target === 'plan'
          ? {
              goal:
                continueRevision && activeRun?.planContent
                  ? `${goal}\n\n请基于现有 plan 继续修改：\n\n${activeRun.planContent}\n\n新的修改要求：\n${revision || '请继续完善当前计划。'}`
                  : goal,
            }
          : target === 'design'
            ? {
                plan: [
                  activeRun?.planContent || '',
                  activeRun?.designContent && continueRevision
                    ? `\n\n[Current design]\n${activeRun.designContent}`
                    : '',
                  revision ? `\n\n[Revision]\n${revision}` : '',
                ].join(''),
              }
            : { planPath: 'plan.md', designPath: 'design.md' }

      await window.electronAPI.startAgent({
        runId,
        agentType: target,
        options,
        workdir,
        env,
      })
    } catch (error) {
      finishPipeline('error', { finalContent: `启动失败:\n${String(error)}` })
    }
  }

  async function handleStopRun() {
    const targetRunId = currentRunId
    if (!targetRunId) return
    stoppedRunIdsRef.current.add(targetRunId)
    try {
      const result = await window.electronAPI.stopAgent(targetRunId)
      if (result.status === 'stopped' && !result.existed) {
        stoppedRunIdsRef.current.delete(targetRunId)
        finishPipelineRun(targetRunId, 'error', {
          finalContent: '该运行已经不在主进程中，记录已标记为停止。',
        })
        finishRun(targetRunId)
        clearDangerousEvent(targetRunId)
        setActiveRunId((current) => (current === targetRunId ? null : current))
      }
    } catch (error) {
      stoppedRunIdsRef.current.delete(targetRunId)
      finishPipelineRun(targetRunId, 'error', {
        finalContent: `手动停止失败:\n${String(error)}`,
      })
      finishRun(targetRunId)
      clearDangerousEvent(targetRunId)
      setActiveRunId((current) => (current === targetRunId ? null : current))
    }
  }

  function handleAdvanceStage() {
    if (!activeRun || !nextStageKey || isRunning) return
    updatePipelineRun(activeRun.id, { stage: nextStageKey, status: 'idle' })
    setStage(nextStageKey)
    setEditPrompt('')
    setPreviewOverride(null)
  }

  function handleConfirmDangerous(action: 'deny' | 'allow' | 'allow_all') {
    if (!currentRunId) return
    void window.electronAPI.confirmDangerous(currentRunId, action !== 'deny', action === 'allow_all')
    clearDangerousEvent(currentRunId)
  }

  function handleDeleteRun(runId: string) {
    const run = pipelineRuns.find((item) => item.id === runId)
    if (!run || run.status === 'running') return
    deletePipelineRun(runId)
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      <div className="mx-auto flex min-h-0 max-w-7xl flex-col gap-5">
        <section className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="section-title">Pipeline Workspace</p>
              <h2 className="mt-2 text-2xl font-semibold text-text-primary">Plan / Design / Execute</h2>
              <p className="mt-2 text-sm leading-7 text-text-secondary">
                当前进行到哪个阶段，就只允许操作这个阶段。文档生成后不会自动进入下一阶段，你可以继续对话修改，确认无误后再手动推进。
              </p>
            </div>
            <div className="rounded-lg border border-border bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-text-secondary">
              当前 run: <span className="text-text-primary">{activeRun?.id || '暂无'}</span>
            </div>
          </div>
          {!hasWorkdir && (
            <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              还没有选择工作目录，当前不能启动 Pipeline。请先到设置页选择 `Workdir`。
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {stages.map((item) => {
            const disabled = activeRun ? item.key !== currentStage : item.key !== 'plan'
            const isCurrent = item.key === currentStage
            return (
              <button
                key={item.key}
                onClick={() => !disabled && setStage(item.key)}
                disabled={disabled}
                className={`rounded-xl border p-4 text-left ${
                  isCurrent
                    ? 'border-accent-plan/40 bg-accent-plan/10'
                    : 'border-border bg-[rgba(16,26,47,0.9)]'
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <div className="text-lg font-medium text-text-primary">{item.title}</div>
                <div className="mt-2 text-sm text-text-secondary">{item.desc}</div>
                {isCurrent && (
                  <div className="mt-3 text-xs uppercase tracking-[0.18em] text-accent-plan">Current Stage</div>
                )}
              </button>
            )
          })}
        </section>

        <section className="grid min-h-0 gap-5 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="flex min-h-0 flex-col gap-5">
            <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-medium text-text-primary">{stage.toUpperCase()} 输入</div>
                  <div className="mt-1 text-sm text-text-secondary">
                    需求与目标只在最开始填写一次。当前阶段完成后，你可以继续补充修改要求；何时进入下一阶段，由你自己决定。
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void runStage(stage, false)}
                    disabled={!canRunCurrentStage}
                    className="rounded-lg bg-accent-plan px-4 py-2 text-sm font-medium text-[#061120] disabled:opacity-50"
                  >
                    {stage === 'execute' ? '启动项目' : `启动 ${stage}`}
                  </button>
                  <button
                    onClick={() => void runStage(stage, true)}
                    disabled={!activeRun || isRunning || stage !== currentStage || (stage !== 'plan' && stage !== 'design')}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary disabled:opacity-50"
                  >
                    继续修改
                  </button>
                  <button
                    onClick={handleAdvanceStage}
                    disabled={!canAdvanceStage}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary disabled:opacity-50"
                  >
                    {nextStageKey ? `确认进入 ${nextStageKey}` : '已到最后阶段'}
                  </button>
                  <button
                    onClick={() => void handleStopRun()}
                    disabled={!currentRunId || !isRunning}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary disabled:opacity-50"
                  >
                    强制停止
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-text-secondary">需求与目标</div>
                <textarea
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  disabled={lockedGoal}
                  placeholder="只允许在最开始填写一次。"
                  className="h-28 w-full rounded-lg border border-border bg-[#07101d] px-3 py-3 text-sm text-text-primary outline-none disabled:opacity-50"
                />
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-text-secondary">Revision Note</div>
                <textarea
                  value={editPrompt}
                  onChange={(event) => setEditPrompt(event.target.value)}
                  disabled={isRunning || !activeRun || stage !== currentStage || stage === 'execute'}
                  placeholder="当前阶段生成文档后，可以继续补充修改要求。"
                  className="h-24 w-full rounded-lg border border-border bg-[#07101d] px-3 py-3 text-sm text-text-primary outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex min-h-[420px] flex-col rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
              <div className="text-lg font-medium text-text-primary">事件流</div>
              <div className="mt-1 text-sm text-text-secondary">最新输出会显示在最上面，不用再翻到底部。</div>
              <div className="mt-4 min-h-0 flex-1 overflow-hidden">
                <EventTimeline events={activeRun?.events || []} isRunning={isRunning} maxItems={80} newestFirst />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-5">
            <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
              <div className="text-lg font-medium text-text-primary">
                {previewOverride?.title || (stage === 'execute' ? 'report.md / 执行结果' : '阶段产物')}
              </div>
              <div className="mt-1 text-sm text-text-secondary">
                执行完成后，如果目录里生成了 `report.md`，这里会优先显示它。
              </div>
              <div className="mt-4 max-h-[520px] overflow-y-auto">
                <MarkdownDock
                  content={previewContent}
                  emptyTitle="当前没有产物"
                  emptyDescription="先运行当前阶段，执行结束后会优先显示 report.md。"
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
              <div className="text-lg font-medium text-text-primary">最近 Pipeline Runs</div>
              <div className="mt-4 space-y-2">
                {pipelineRuns.slice(0, 6).map((run) => (
                  <div
                    key={run.id}
                    className={`rounded-lg border px-3 py-3 ${
                      run.id === activeRun?.id
                        ? 'border-accent-plan/40 bg-accent-plan/10'
                        : 'border-border bg-[rgba(255,255,255,0.02)]'
                    }`}
                  >
                    <button onClick={() => setActivePipelineRun(run.id)} className="block w-full text-left">
                      <div className="text-sm font-medium text-text-primary">{run.stage}</div>
                      <div className="mt-1 text-xs text-text-secondary">
                        {new Date(run.updatedAt).toLocaleString('zh-CN')} · {run.status}
                      </div>
                    </button>
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => handleDeleteRun(run.id)}
                        disabled={run.status === 'running'}
                        className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary disabled:opacity-40"
                      >
                        删除记录
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {currentDangerousEvent && (
        <RuntimeDangerDialog
          command={currentDangerousEvent.command}
          tool={currentDangerousEvent.tool}
          onConfirm={handleConfirmDangerous}
        />
      )}
    </div>
  )
}
