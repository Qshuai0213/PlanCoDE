import { useEffect, useState } from 'react'
import { useSettingStore } from '../stores/settingStore'

function getElectronApi() {
  return typeof window !== 'undefined' ? window.electronAPI : undefined
}

export function SystemSettingsPage() {
  const {
    model,
    apiKey,
    baseUrl,
    workdir,
    tokenThreshold,
    llmTimeout,
    provider,
    setModel,
    setApiKey,
    setBaseUrl,
    setWorkdir,
    setTokenThreshold,
    setLlmTimeout,
    setProvider,
    loadSettings,
    saveSettings,
    profiles,
    activeProfileId,
    applyProfile,
    saveAsNewProfile,
    updateActiveProfile,
    deleteProfile,
  } = useSettingStore()

  const [status, setStatus] = useState('等待操作')
  const [busy, setBusy] = useState<'save' | 'test' | 'workdir' | 'profile' | null>(null)
  const [profileName, setProfileName] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  const apiReady = !!getElectronApi()

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  async function withStatus<T>(label: string, task: () => Promise<T>) {
    try {
      setStatus(`${label}中...`)
      const result = await task()
      return result
    } catch (error: any) {
      setStatus(error?.message || `${label}失败`)
      throw error
    }
  }

  async function handleSave() {
    if (!apiReady) {
      setStatus('Electron API 未注入，保存不可用')
      return
    }

    setBusy('save')
    try {
      if (activeProfileId) updateActiveProfile()
      await withStatus('保存设置', async () => {
        await saveSettings()
      })
      setStatus('设置已保存')
    } finally {
      setBusy(null)
    }
  }

  async function handleSelectWorkdir() {
    const electronAPI = getElectronApi()
    if (!electronAPI) {
      setStatus('Electron API 未注入，无法打开目录选择器')
      return
    }

    setBusy('workdir')
    try {
      const result = await withStatus('选择目录', async () => electronAPI.selectWorkdir())
      if (result?.filePaths?.[0]) {
        setWorkdir(result.filePaths[0])
        setStatus(`已选择目录: ${result.filePaths[0]}`)
      } else {
        setStatus('已取消选择目录')
      }
    } finally {
      setBusy(null)
    }
  }

  async function handleTestConnection() {
    const electronAPI = getElectronApi()
    if (!electronAPI) {
      setStatus('Electron API 未注入，无法测试连接')
      return
    }

    setBusy('test')
    try {
      const result = await withStatus('测试连接', async () =>
        electronAPI.testConnection({ provider, apiKey, baseUrl, model }),
      )
      setStatus(result?.message || result?.status || '测试完成')
    } finally {
      setBusy(null)
    }
  }

  async function handleSaveProfile() {
    if (!profileName.trim()) {
      setStatus('请先输入配置档名称')
      return
    }

    setBusy('profile')
    try {
      saveAsNewProfile(profileName.trim())
      setProfileName('')
      await saveSettings()
      setStatus('新配置档已保存')
    } finally {
      setBusy(null)
    }
  }

  async function handleApplyProfile(id: string) {
    setBusy('profile')
    try {
      applyProfile(id)
      await saveSettings()
      setStatus('已切换配置档')
    } finally {
      setBusy(null)
    }
  }

  async function handleDeleteProfile(id: string) {
    setBusy('profile')
    try {
      deleteProfile(id)
      await saveSettings()
      setStatus('配置档已删除')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
          <h2 className="text-2xl font-semibold text-text-primary">设置</h2>
          <p className="mt-2 text-sm text-text-secondary">
            简化后的设置页只保留最核心的模型和目录配置，所有按钮都会显示明确状态。
          </p>
          <div className="mt-4 rounded-lg border border-border bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-text-primary">
            {status}
          </div>
          {!apiReady && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              当前窗口没有检测到 `window.electronAPI`，这通常说明 preload / IPC 没有正确注入。
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
          <h3 className="text-lg font-medium text-text-primary">基础配置</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-text-secondary">Provider</span>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as any)}
                className="w-full rounded-lg border border-border bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-text-primary outline-none"
              >
                <option value="anthropic">anthropic</option>
                <option value="openai">openai</option>
                <option value="ollama">ollama</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-text-secondary">Model</span>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="w-full rounded-lg border border-border bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-text-primary outline-none"
                placeholder="claude-sonnet-4-20250514"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-text-secondary">API Key</span>
              <div className="flex gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="flex-1 rounded-lg border border-border bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-text-primary outline-none"
                  placeholder="输入 API Key"
                />
                <button
                  onClick={() => setShowApiKey((value) => !value)}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-text-primary"
                >
                  {showApiKey ? '隐藏' : '显示'}
                </button>
              </div>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-text-secondary">Base URL</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="w-full rounded-lg border border-border bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-text-primary outline-none"
                placeholder="http://localhost:11434/v1"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-text-secondary">Workdir</span>
              <div className="flex gap-2">
                <input
                  value={workdir}
                  onChange={(event) => setWorkdir(event.target.value)}
                  className="flex-1 rounded-lg border border-border bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-text-primary outline-none"
                  placeholder="D:\\develop\\PlanCoDE"
                />
                <button
                  onClick={() => void handleSelectWorkdir()}
                  disabled={busy === 'workdir'}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-text-primary disabled:opacity-50"
                >
                  选择目录
                </button>
              </div>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-text-secondary">Token Threshold</span>
              <input
                type="number"
                value={tokenThreshold}
                onChange={(event) => setTokenThreshold(parseInt(event.target.value, 10) || 100000)}
                className="w-full rounded-lg border border-border bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-text-primary outline-none"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-text-secondary">LLM Timeout (s)</span>
              <input
                type="number"
                value={llmTimeout}
                onChange={(event) => setLlmTimeout(parseInt(event.target.value, 10) || 120)}
                className="w-full rounded-lg border border-border bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-text-primary outline-none"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => void handleSave()}
              disabled={busy === 'save'}
              className="rounded-lg bg-accent-plan px-4 py-2 text-sm font-medium text-[#061120] disabled:opacity-50"
            >
              保存设置
            </button>
            <button
              onClick={() => void handleTestConnection()}
              disabled={busy === 'test'}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary disabled:opacity-50"
            >
              测试连接
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-[rgba(16,26,47,0.9)] p-5">
          <h3 className="text-lg font-medium text-text-primary">配置档</h3>
          <div className="mt-4 flex gap-2">
            <input
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="输入配置档名称"
              className="flex-1 rounded-lg border border-border bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-text-primary outline-none"
            />
            <button
              onClick={() => void handleSaveProfile()}
              disabled={busy === 'profile'}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary disabled:opacity-50"
            >
              保存为新配置档
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {profiles.length === 0 && (
              <div className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] px-3 py-3 text-sm text-text-secondary">
                还没有保存的配置档。
              </div>
            )}
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-3 ${
                  activeProfileId === profile.id
                    ? 'border-accent-plan/40 bg-accent-plan/10'
                    : 'border-border bg-[rgba(255,255,255,0.02)]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm text-text-primary">{profile.name}</div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {profile.provider} / {profile.model}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleApplyProfile(profile.id)}
                    disabled={busy === 'profile'}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary disabled:opacity-50"
                  >
                    使用
                  </button>
                  <button
                    onClick={() => void handleDeleteProfile(profile.id)}
                    disabled={busy === 'profile'}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary disabled:opacity-50"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
