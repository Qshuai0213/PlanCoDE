import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { ControlStatusBar } from './components/layout/ControlStatusBar'
import { PixelBotMarquee } from './components/layout/PixelBotMarquee'
import { WorkbenchSidebar } from './components/layout/WorkbenchSidebar'
import { useEventStore } from './stores/eventStore'
import { useSettingStore } from './stores/settingStore'

const OverviewPage = lazy(async () => {
  const module = await import('./pages/OverviewPage')
  return { default: module.OverviewPage }
})

const PipelineDeckPage = lazy(async () => {
  const module = await import('./pages/PipelineDeckPage')
  return { default: module.PipelineDeckPage }
})

const GeneralDeckPage = lazy(async () => {
  const module = await import('./pages/GeneralDeckPage')
  return { default: module.GeneralDeckPage }
})

const SessionHistoryPage = lazy(async () => {
  const module = await import('./pages/SessionHistoryPage')
  return { default: module.SessionHistoryPage }
})

const SystemSettingsPage = lazy(async () => {
  const module = await import('./pages/SystemSettingsPage')
  return { default: module.SystemSettingsPage }
})

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="glass-panel rounded-[28px] px-8 py-7 text-center">
        <p className="section-title">Loading View</p>
        <div className="mt-3 text-lg font-medium text-text-primary">正在加载工作台模块...</div>
        <div className="mt-2 text-sm text-text-secondary">页面会按需加载，首屏会更轻一点。</div>
      </div>
    </div>
  )
}

export default function App() {
  const loadSettings = useSettingStore((state) => state.loadSettings)
  const loadSessions = useEventStore((state) => state.loadSessions)

  useEffect(() => {
    loadSettings()
    loadSessions()
  }, [loadSettings, loadSessions])

  return (
    <HashRouter>
      <div className="flex h-screen flex-col overflow-hidden p-2">
        <div className="flex h-full min-h-0 overflow-hidden rounded-2xl border border-border bg-[rgba(9,17,31,0.96)]">
          <div className="flex min-h-0 w-full flex-col">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
              <div>
                <div className="brand-pixel text-2xl font-semibold">
                  <span className="brand-pixel-main">Plan</span>
                  <span className="brand-pixel-accent">CoDE</span>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-xs text-text-secondary">Plan / Design / Execute / General</div>
                <PixelBotMarquee />
              </div>
            </div>

            <div className="flex min-h-0 flex-1 overflow-hidden">
              <WorkbenchSidebar />
              <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<OverviewPage />} />
                    <Route path="/pipeline" element={<PipelineDeckPage />} />
                    <Route path="/general" element={<GeneralDeckPage />} />
                    <Route path="/history" element={<SessionHistoryPage />} />
                    <Route path="/settings" element={<SystemSettingsPage />} />
                  </Routes>
                </Suspense>
              </main>
            </div>

            <ControlStatusBar />
          </div>
        </div>
      </div>
    </HashRouter>
  )
}
