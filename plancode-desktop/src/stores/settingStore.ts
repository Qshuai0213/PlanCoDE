import { create } from 'zustand'
import type { ApiProfile } from '../types'

interface SettingStore {
  model: string
  apiKey: string
  baseUrl: string
  workdir: string
  tokenThreshold: number
  llmTimeout: number
  provider: 'anthropic' | 'openai' | 'ollama'

  // Multi-profile support
  profiles: ApiProfile[]
  activeProfileId: string | null

  setModel: (model: string) => void
  setApiKey: (apiKey: string) => void
  setBaseUrl: (baseUrl: string) => void
  setWorkdir: (workdir: string) => void
  setTokenThreshold: (threshold: number) => void
  setLlmTimeout: (timeout: number) => void
  setProvider: (provider: 'anthropic' | 'openai' | 'ollama') => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>

  // Profile management
  applyProfile: (id: string) => void
  saveAsNewProfile: (name: string) => void
  updateActiveProfile: () => void
  deleteProfile: (id: string) => void
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export const useSettingStore = create<SettingStore>((set, get) => ({
  model: 'claude-sonnet-4-20250514',
  apiKey: '',
  baseUrl: '',
  workdir: '',
  tokenThreshold: 100000,
  llmTimeout: 120,
  provider: 'anthropic',

  profiles: [],
  activeProfileId: null,

  setModel: (model) => set({ model }),
  setApiKey: (apiKey) => set({ apiKey }),
  setBaseUrl: (baseUrl) => set({ baseUrl }),
  setWorkdir: (workdir) => set({ workdir }),
  setTokenThreshold: (tokenThreshold) => set({ tokenThreshold }),
  setLlmTimeout: (llmTimeout) => set({ llmTimeout }),
  setProvider: (provider) => set({ provider }),

  loadSettings: async () => {
    if (!window.electronAPI) return

    const settings = await window.electronAPI.getSettings()
    set({
      model: settings.model || 'claude-sonnet-4-20250514',
      apiKey: settings.apiKey || '',
      baseUrl: settings.baseUrl || '',
      workdir: settings.workdir || '',
      tokenThreshold: settings.tokenThreshold || 100000,
      llmTimeout: settings.llmTimeout || 120,
      provider: settings.provider || 'anthropic',
      profiles: settings.profiles || [],
      activeProfileId: settings.activeProfileId || null,
    })
  },

  saveSettings: async () => {
    const { model, apiKey, baseUrl, workdir, tokenThreshold, llmTimeout, provider, profiles, activeProfileId } = get()
    if (!window.electronAPI) {
      throw new Error('Electron API unavailable')
    }

    const result = await window.electronAPI.saveSettings({
      model, apiKey, baseUrl, workdir, tokenThreshold, llmTimeout, provider, profiles, activeProfileId,
    }) as { status: string; message?: string }

    if (result?.status !== 'saved') {
      throw new Error(result?.message || 'Failed to save settings')
    }
  },

  applyProfile: (id) => {
    const profile = get().profiles.find(p => p.id === id)
    if (profile) {
      set({
        activeProfileId: id,
        provider: profile.provider,
        model: profile.model,
        apiKey: profile.apiKey,
        baseUrl: profile.baseUrl,
      })
    }
  },

  saveAsNewProfile: (name) => {
    const { provider, model, apiKey, baseUrl } = get()
    const newProfile: ApiProfile = { id: generateId(), name, provider, model, apiKey, baseUrl }
    set(state => ({
      profiles: [...state.profiles, newProfile],
      activeProfileId: newProfile.id,
    }))
  },

  updateActiveProfile: () => {
    const { activeProfileId, provider, model, apiKey, baseUrl } = get()
    if (!activeProfileId) return
    set(state => ({
      profiles: state.profiles.map(p =>
        p.id === activeProfileId ? { ...p, provider, model, apiKey, baseUrl } : p
      ),
    }))
  },

  deleteProfile: (id) => {
    set(state => ({
      profiles: state.profiles.filter(p => p.id !== id),
      activeProfileId: state.activeProfileId === id ? null : state.activeProfileId,
    }))
  },
}))
