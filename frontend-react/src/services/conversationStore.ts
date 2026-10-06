import type { AgentChatResponse } from './agentService'

const STORAGE_KEY = 'zeno_conversations'
const MAX_CONVERSATIONS = 120

export type StoredMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  mode?: 'personal' | 'general'
  confidence?: number
  evidence?: AgentChatResponse['evidence']
  insights?: AgentChatResponse['insights']
  actions?: AgentChatResponse['actions']
  metadata?: AgentChatResponse['metadata']
  createdAt: number
}

export type StoredConversation = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: StoredMessage[]
}

function readAll(): StoredConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is StoredConversation =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as StoredConversation).id === 'string' &&
        Array.isArray((item as StoredConversation).messages),
    )
  } catch {
    return []
  }
}

function writeAll(conversations: StoredConversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)))
  } catch {
    // Storage may be full or unavailable; conversation history is best-effort.
  }
}

export function listConversations(): StoredConversation[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getConversation(id: string): StoredConversation | undefined {
  return readAll().find((conversation) => conversation.id === id)
}

function deriveTitle(messages: StoredMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user')
  if (!firstUser) return '新对话'
  return firstUser.content.length > 24
    ? `${firstUser.content.slice(0, 24)}…`
    : firstUser.content
}

export function saveConversation(
  conversation: StoredConversation,
): StoredConversation {
  const all = readAll()
  const index = all.findIndex((item) => item.id === conversation.id)
  const next: StoredConversation = {
    ...conversation,
    title: conversation.title || deriveTitle(conversation.messages),
    updatedAt: Date.now(),
  }
  if (index >= 0) all[index] = next
  else all.push(next)
  writeAll(all)
  return next
}

export function renameConversation(id: string, title: string) {
  const all = readAll()
  const index = all.findIndex((item) => item.id === id)
  if (index < 0) return
  all[index] = { ...all[index], title: title.trim() || all[index].title }
  writeAll(all)
}

export function deleteConversation(id: string) {
  writeAll(readAll().filter((item) => item.id !== id))
}
