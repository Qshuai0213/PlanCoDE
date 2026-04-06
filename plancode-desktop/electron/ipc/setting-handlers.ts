import { createRequire } from 'module'
import type { IpcMain, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'

const require = createRequire(import.meta.url)
const { app, dialog } = require('electron') as typeof import('electron')

const CONFIG_PATH = path.join(app.getPath('userData'), 'settings.json')

function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, '')
}

async function tryAnthropicCompatibleRequest(
  url: string,
  apiKey: string,
  body: string,
  signal: AbortSignal,
) {
  const headerVariants: Array<Record<string, string>> = [
    {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    {
      'Authorization': `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
  ]

  let lastStatus = 0
  let lastText = ''

  for (const headers of headerVariants) {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal,
    })

    if (resp.ok) {
      return { ok: true, status: resp.status, text: await resp.text().catch(() => ''), headers }
    }

    lastStatus = resp.status
    lastText = await resp.text().catch(() => '')
  }

  return { ok: false, status: lastStatus, text: lastText, headers: headerVariants[headerVariants.length - 1] }
}

export function settingHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null,
) {
  ipcMain.handle('settings:get', async () => {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const data = fs.readFileSync(CONFIG_PATH, 'utf-8')
        return JSON.parse(data)
      }
    } catch {
      // ignore corrupted settings and fall through to defaults
    }

    return {
      model: 'claude-sonnet-4-20250514',
      apiKey: '',
      baseUrl: '',
      workdir: app.getPath('documents'),
      tokenThreshold: 100000,
      llmTimeout: 120,
      provider: 'anthropic',
      profiles: [],
      activeProfileId: null,
    }
  })

  ipcMain.handle('settings:save', async (_event, settings) => {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2), 'utf-8')
      return { status: 'saved' }
    } catch (err) {
      return { status: 'error', message: String(err) }
    }
  })

  ipcMain.handle('settings:select-workdir', async () => {
    const window = getWindow()
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: '选择工作目录',
    })

    if (result.canceled) return null
    return { filePaths: result.filePaths }
  })

  ipcMain.handle('settings:test-connection', async (_event, { provider, apiKey, baseUrl, model }) => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      let url = ''

      if (provider === 'anthropic') {
        url = `${stripTrailingSlash(baseUrl || 'https://api.anthropic.com')}/v1/messages`
      } else if (provider === 'openai') {
        const headers: Record<string, string> = {}
        url = `${stripTrailingSlash(baseUrl || 'https://api.openai.com')}/v1/chat/completions`
        headers['Authorization'] = `Bearer ${apiKey}`
        headers['content-type'] = 'application/json'

        if (!apiKey) {
          clearTimeout(timeout)
          return { status: 'error', message: 'API Key 不能为空' }
        }

        const body = JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        })

        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (resp.ok) {
          return { status: 'ok', message: `${model} 连接成功` }
        }

        const errText = await resp.text().catch(() => '')
        return {
          status: 'error',
          message: `HTTP ${resp.status}: ${errText.slice(0, 300)}`,
        }
      } else if (provider === 'ollama') {
        url = `${stripTrailingSlash(baseUrl || 'http://localhost:11434')}/api/tags`
        const resp = await fetch(url, { signal: controller.signal })
        clearTimeout(timeout)
        return resp.ok
          ? { status: 'ok', message: 'Ollama 连接成功' }
          : { status: 'error', message: `Ollama 返回 ${resp.status}` }
      }

      if (!apiKey && provider !== 'ollama') {
        clearTimeout(timeout)
        return { status: 'error', message: 'API Key 不能为空' }
      }

      const body = JSON.stringify({
        model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      })

      const resp = await tryAnthropicCompatibleRequest(
        url,
        apiKey,
        body,
        controller.signal,
      )
      clearTimeout(timeout)

      if (resp.ok) {
        return { status: 'ok', message: `${model} 连接成功` }
      }

      return {
        status: 'error',
        message: `HTTP ${resp.status}: ${resp.text.slice(0, 300)} | 已按 Anthropic 兼容接口使用 x-api-key 与 Bearer 两种方式测试当前 Base URL。`,
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { status: 'error', message: '连接超时 (10s)' }
      }
      return { status: 'error', message: String(err.message || err) }
    }
  })
}
