const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Agent control
  startAgent: (options: {
    runId: string
    agentType: string
    options: Record<string, any>
    workdir: string
    env: Record<string, string>
  }) => ipcRenderer.invoke('agent:start', options),
  stopAgent: (runId: string) => ipcRenderer.invoke('agent:stop', { runId }),
  confirmDangerous: (runId: string, allow: boolean, allowAll: boolean) =>
    ipcRenderer.invoke('agent:confirm-dangerous', { runId, allow, allowAll }),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Record<string, any>) =>
    ipcRenderer.invoke('settings:save', settings),
  selectWorkdir: () => ipcRenderer.invoke('settings:select-workdir'),
  testConnection: (params: { provider: string; apiKey: string; baseUrl: string; model: string }) =>
    ipcRenderer.invoke('settings:test-connection', params),
  openPath: (targetPath: string) => ipcRenderer.invoke('dialog:open-path', { targetPath }),
  readTextFile: (targetPath: string) => ipcRenderer.invoke('dialog:read-text-file', { targetPath }),
  checkWorkdir: (targetPath: string) => ipcRenderer.invoke('dialog:check-workdir', { targetPath }),
  confirmRestartPlanning: (targetPath: string, sampleEntries: string[]) =>
    ipcRenderer.invoke('dialog:confirm-restart-planning', { targetPath, sampleEntries }),

  // Events from main process
  onAgentEvent: (callback: (payload: { runId: string; name: string; data: any }) => void) => {
    const handler = (_event: any, payload: { runId: string; name: string; data: any }) => callback(payload)
    ipcRenderer.on('agent:event', handler)
    return () => ipcRenderer.removeListener('agent:event', handler)
  },
  onDangerous: (callback: (payload: { runId: string; data: any }) => void) => {
    const handler = (_event: any, payload: { runId: string; data: any }) => callback(payload)
    ipcRenderer.on('agent:dangerous', handler)
    return () => ipcRenderer.removeListener('agent:dangerous', handler)
  },
  onResult: (callback: (payload: any) => void) => {
    const handler = (_event: any, payload: any) => callback(payload)
    ipcRenderer.on('agent:result', handler)
    return () => ipcRenderer.removeListener('agent:result', handler)
  },
  onExit: (callback: (payload: { runId: string; code: number | null }) => void) => {
    const handler = (_event: any, payload: { runId: string; code: number | null }) => callback(payload)
    ipcRenderer.on('agent:exit', handler)
    return () => ipcRenderer.removeListener('agent:exit', handler)
  },
  onStderr: (callback: (payload: { runId: string; msg: string }) => void) => {
    const handler = (_event: any, payload: { runId: string; msg: string }) => callback(payload)
    ipcRenderer.on('agent:stderr', handler)
    return () => ipcRenderer.removeListener('agent:stderr', handler)
  },
})
