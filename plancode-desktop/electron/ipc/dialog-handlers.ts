import { createRequire } from 'module'
import type { IpcMain, BrowserWindow } from 'electron'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { app, dialog, shell } = require('electron') as typeof import('electron')

export function dialogHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
) {
  ipcMain.handle('dialog:select-directory', async () => {
    const window = getWindow()
    if (!window) return { canceled: true }
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory']
    })
    return result
  })

  ipcMain.handle('dialog:message', async (_event, { title, message, detail }) => {
    const window = getWindow()
    if (!window) return
    await dialog.showMessageBox(window, {
      type: 'info',
      title,
      message,
      detail,
    })
  })

  ipcMain.handle('dialog:open-path', async (_event, { targetPath }) => {
    if (!targetPath) return { status: 'error', message: 'missing path' }
    const message = await shell.openPath(targetPath)
    return message ? { status: 'error', message } : { status: 'ok' }
  })

  ipcMain.handle('dialog:read-text-file', async (_event, { targetPath }) => {
    if (!targetPath) return { status: 'error', message: 'missing path' }
    try {
      const content = await fs.readFile(targetPath, 'utf-8')
      return { status: 'ok', content }
    } catch (error) {
      return { status: 'error', message: String(error) }
    }
  })

  ipcMain.handle('dialog:check-workdir', async (_event, { targetPath }) => {
    if (!targetPath) return { status: 'error', message: 'missing path' }
    try {
      const entries = await fs.readdir(targetPath, { withFileTypes: true })
      const visibleEntries = entries
        .map((entry) => entry.name)
        .filter((name) => !name.startsWith('.'))
      return {
        status: 'ok',
        exists: true,
        hasVisibleEntries: visibleEntries.length > 0,
        entryCount: visibleEntries.length,
        sampleEntries: visibleEntries.slice(0, 5),
      }
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return { status: 'ok', exists: false, hasVisibleEntries: false, entryCount: 0, sampleEntries: [] }
      }
      return { status: 'error', message: String(error) }
    }
  })

  ipcMain.handle('dialog:confirm-restart-planning', async (_event, { targetPath, sampleEntries = [] }) => {
    const window = getWindow()
    if (!window) return { status: 'cancelled', confirmed: false }
    const result = await dialog.showMessageBox(window, {
      type: 'question',
      buttons: ['继续规划', '取消'],
      defaultId: 1,
      cancelId: 1,
      title: '工作目录已有内容',
      message: '当前工作目录已经有现成项目内容。',
      detail: [
        `目录: ${targetPath}`,
        sampleEntries.length ? `示例内容: ${sampleEntries.join('、')}` : '',
        '如果你要从头开始做规划，请确认继续。',
        '如果这是一个已经存在的项目，建议改用 General 模式做维护和修改。',
      ]
        .filter(Boolean)
        .join('\n'),
      noLink: true,
    })
    return { status: 'ok', confirmed: result.response === 0 }
  })

  ipcMain.handle('dialog:get-general-workspace-info', async () => {
    const homeDir = app.getPath('home') || os.homedir()
    const sandboxDir = path.join(homeDir, '.plancode-general')
    const appPath = app.getAppPath()
    const projectRoot = path.resolve(appPath, '..')
    const projectSkillsDir = path.join(projectRoot, 'skills')

    return {
      status: 'ok',
      workspaceDir: sandboxDir,
      projectRoot,
      skillDirs: [
        path.join(sandboxDir, 'skills'),
        path.join(homeDir, '.codex', 'skills'),
        path.join(homeDir, '.agents', 'skills'),
        projectSkillsDir,
      ],
    }
  })
}
