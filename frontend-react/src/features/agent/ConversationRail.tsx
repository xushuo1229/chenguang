import { MoreHorizontal, Pencil, Plus, Trash2, Check } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { StoredConversation } from '@/services/conversationStore'

type RailGroup = { label: string; items: StoredConversation[] }

function startOfToday(): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.getTime()
}

function groupConversations(conversations: StoredConversation[]): RailGroup[] {
  const todayStart = startOfToday()
  const dayMs = 24 * 60 * 60 * 1000
  const buckets: Record<string, StoredConversation[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    Older: [],
  }
  conversations.forEach((conversation) => {
    const age = todayStart - conversation.updatedAt
    if (age < 0) buckets.Today.push(conversation)
    else if (age < dayMs) buckets.Today.push(conversation)
    else if (age < 2 * dayMs) buckets.Yesterday.push(conversation)
    else if (age < 8 * dayMs) buckets['Previous 7 Days'].push(conversation)
    else buckets.Older.push(conversation)
  })
  return Object.entries(buckets)
    .map(([label, items]) => ({ label, items }))
    .filter((group) => group.items.length > 0)
}

type ConversationRailProps = {
  conversations: StoredConversation[]
  activeId?: string
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onNavigate?: () => void
}

export function ConversationRail({
  conversations,
  activeId,
  onRename,
  onDelete,
  onNavigate,
}: ConversationRailProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const groups = groupConversations(conversations)

  const commitRename = () => {
    if (editingId) onRename(editingId, draftTitle)
    setEditingId(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-2.5">
        <Button asChild size="sm" className="w-full">
          <NavLink to="/agent" onClick={onNavigate}>
            <Plus className="size-4" />
            New Chat
          </NavLink>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {groups.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs leading-5 text-ink-faint">
            还没有历史对话。
            <br />
            开始和 Zeno 对话后会显示在这里。
          </p>
        ) : null}
        {groups.map((group) => (
          <div key={group.label} className="pb-2">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              {group.label}
            </p>
            <ul className="space-y-0.5 px-2">
              {group.items.map((conversation) => {
                const isActive = conversation.id === activeId
                const isEditing = conversation.id === editingId
                return (
                  <li key={conversation.id}>
                    {isEditing ? (
                      <div className="flex items-center gap-1 rounded-control bg-surface-muted px-2 py-1">
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') commitRename()
                            if (event.key === 'Escape') setEditingId(null)
                          }}
                          onBlur={commitRename}
                          className="h-6 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
                        />
                        <button
                          type="button"
                          aria-label="保存名称"
                          onClick={commitRename}
                          className="text-success"
                        >
                          <Check className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'group flex items-center gap-1 rounded-control pr-1 transition-colors',
                          isActive
                            ? 'bg-primary-muted'
                            : 'hover:bg-surface-muted',
                        )}
                      >
                        <NavLink
                          to={`/agent/${conversation.id}`}
                          onClick={onNavigate}
                          className={cn(
                            'min-w-0 flex-1 truncate px-2 py-1.5 text-[13px]',
                            isActive
                              ? 'font-medium text-primary'
                              : 'text-ink-secondary',
                          )}
                        >
                          {conversation.title}
                        </NavLink>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="对话操作"
                              className="grid size-6 shrink-0 place-items-center rounded text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 data-[state=open]:opacity-100"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-36">
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditingId(conversation.id)
                                setDraftTitle(conversation.title)
                              }}
                            >
                              <Pencil />
                              重命名
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-danger focus:text-danger"
                              onSelect={() => onDelete(conversation.id)}
                            >
                              <Trash2 />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
