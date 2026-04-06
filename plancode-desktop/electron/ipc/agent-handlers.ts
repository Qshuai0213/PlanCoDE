import type { IpcMain, BrowserWindow } from 'electron'
import { PythonBridge } from '../subprocess/python-bridge'

const bridges = new Map<string, PythonBridge>()

export function agentHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null,
) {
  ipcMain.handle('agent:start', async (_event, { runId, agentType, options, workdir, env }) => {
    bridges.get(runId)?.stop()

    const bridge = new PythonBridge(workdir, env)
    bridges.set(runId, bridge)
    const window = getWindow()

    bridge.on('event', (name: string, data: any) => {
      window?.webContents.send('agent:event', { runId, name, data })
    })

    bridge.on('dangerous', (data: any) => {
      window?.webContents.send('agent:dangerous', { runId, data })
    })

    bridge.on('result', (data: any) => {
      window?.webContents.send('agent:result', { runId, ...data })
    })

    bridge.on('stderr', (msg: string) => {
      window?.webContents.send('agent:stderr', { runId, msg })
    })

    bridge.on('exit', (code: number) => {
      window?.webContents.send('agent:exit', { runId, code })
      bridges.delete(runId)
    })

    await bridge.start(agentType, options)
    return { status: 'started', runId }
  })

  ipcMain.handle('agent:stop', async (_event, { runId }) => {
    const bridge = bridges.get(runId)
    if (bridge) {
      bridge.stop()
      bridges.delete(runId)
      return { status: 'stopped', existed: true }
    }
    return { status: 'stopped', existed: false }
  })

  ipcMain.handle('agent:confirm-dangerous', async (_event, { runId, allow, allowAll }) => {
    bridges.get(runId)?.confirmDangerous(allow, allowAll)
    return { status: 'confirmed' }
  })
}
