import { createRequire } from 'module'
import type { BrowserWindow as BrowserWindowType } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import log from 'electron-log'
import { agentHandlers } from './ipc/agent-handlers'
import { dialogHandlers } from './ipc/dialog-handlers'
import { settingHandlers } from './ipc/setting-handlers'

const require = createRequire(import.meta.url)
const { app, BrowserWindow, ipcMain } = require('electron') as typeof import('electron')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configure logging
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

// Catch uncaught exceptions
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err)
  app.exit(1)
})

let mainWindow: BrowserWindowType | null = null
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
}

function resolvePreloadPath(): string {
  const preloadPath = path.join(__dirname, 'preload.cjs')

  if (!fs.existsSync(preloadPath)) {
    return preloadPath
  }

  try {
    const content = fs.readFileSync(preloadPath, 'utf-8')
    let fixedContent = content

    const appendBootstrapCall = (variableName: string) => {
      const callSnippet = `\n${variableName}();\n`
      if (!fixedContent.includes(callSnippet.trim())) {
        fixedContent = `${fixedContent.trimEnd()}${callSnippet}`
      }
    }

    if (fixedContent.includes('export default')) {
      fixedContent = fixedContent.replace(/export\s+default\s+([^\n;]+)\s*;?/m, '$1')
    }

    if (fixedContent.includes('var require_preload = __commonJS({') && !fixedContent.includes('require_preload();')) {
      fixedContent = `${fixedContent.trimEnd()}\nrequire_preload();\n`
    }

    if (fixedContent.includes('var a = g(() => {') && !fixedContent.includes('\na();')) {
      fixedContent = `${fixedContent.trimEnd()}\na();\n`
    }

    const bootstrapWrapperMatch = fixedContent.match(/var\s+([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\(\(\)\s*=>\s*\{/)
    if (bootstrapWrapperMatch) {
      appendBootstrapCall(bootstrapWrapperMatch[1])
    }

    if (fixedContent === content) {
      return preloadPath
    }

    const fixedPath = path.join(app.getPath('userData'), 'preload.fixed.cjs')
    fs.writeFileSync(fixedPath, fixedContent, 'utf-8')
    log.warn('Preload required runtime fix, using fixed preload at:', fixedPath)
    return fixedPath
  } catch (err) {
    log.error('Failed to sanitize preload file, fallback to original preload:', err)
    return preloadPath
  }
}

async function createWindow() {
  const preloadPath = resolvePreloadPath()
  log.info('Preload path:', preloadPath)
  log.info('Preload exists:', fs.existsSync(preloadPath))

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'default',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.PLANCODE_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools()
  }

  // Check if preload injected electronAPI after page loads
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.executeJavaScript(
      '({ type: typeof window.electronAPI, exists: !!window.electronAPI })'
    ).then((result) => {
      log.info('Renderer electronAPI check:', result)
    }).catch((err) => {
      log.error('Renderer electronAPI check failed:', err)
    })
    mainWindow?.webContents.executeJavaScript(
      'console.log("[DEBUG] electronAPI:", typeof window.electronAPI, window.electronAPI ? "EXISTS" : "MISSING")'
    )
  })

  // Load the app
  if (!app.isPackaged) {
    try {
      await mainWindow.loadURL('http://localhost:5173')
    } catch {
      log.info('Dev server not available, loading built files')
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  log.info('Main window created')
}

// Register IPC handlers
function registerIpcHandlers() {
  agentHandlers(ipcMain, () => mainWindow)
  dialogHandlers(ipcMain, () => mainWindow)
  settingHandlers(ipcMain, () => mainWindow)
}

app.whenReady().then(() => {
  log.info('App ready, creating window...')
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('second-instance', () => {
  if (!mainWindow) return

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
