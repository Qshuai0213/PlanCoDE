interface Props {
  command: string
  tool: string
  onConfirm: (action: 'deny' | 'allow' | 'allow_all') => void
}

export function RuntimeDangerDialog({ command, tool, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,15,0.72)] px-4 backdrop-blur-md">
      <div className="glass-panel w-full max-w-2xl rounded-[28px] border border-accent-danger/40 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-title text-accent-danger">Risk Check</p>
            <h3 className="mt-2 text-2xl font-semibold text-text-primary">检测到潜在危险命令</h3>
          </div>
          <div className="rounded-full border border-accent-danger/30 bg-accent-danger/10 px-3 py-1 text-xs text-accent-danger">
            {tool}
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-[#07101d] p-4">
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-sm leading-6 text-rose-200">{command}</pre>
        </div>

        <p className="mt-4 text-sm leading-6 text-text-secondary">
          这条命令可能会修改代码、文件或系统状态。请在确认其符合你的预期后再继续执行。
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            onClick={() => onConfirm('deny')}
            className="rounded-full border border-accent-danger/40 bg-accent-danger/15 px-5 py-2 text-sm text-accent-danger transition hover:bg-accent-danger/20"
          >
            拒绝
          </button>
          <button
            onClick={() => onConfirm('allow')}
            className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-2 text-sm text-text-primary transition hover:bg-white/[0.08]"
          >
            仅允许本次
          </button>
          <button
            onClick={() => onConfirm('allow_all')}
            className="rounded-full bg-accent-plan px-5 py-2 text-sm font-medium text-[#061120] transition hover:brightness-110"
          >
            本次会话全部允许
          </button>
        </div>
      </div>
    </div>
  )
}
