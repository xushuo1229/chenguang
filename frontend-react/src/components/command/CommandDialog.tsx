import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  Bot,
  BrainCircuit,
  Compass,
  LayoutDashboard,
  LogOut,
  Moon,
  Plus,
  Sun,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '@/stores/auth-store'
import { useTheme } from '@/stores/theme-store'

type CommandDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandDialog({ open, onOpenChange }: CommandDialogProps) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { user, signOut } = useAuth()

  const go = (path: string) => {
    onOpenChange(false)
    navigate(path)
  }

  const run = (action: () => void) => {
    onOpenChange(false)
    action()
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Zeno Command Menu"
      contentClassName="fixed left-1/2 top-[18%] z-[70] w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-card border border-line bg-surface text-ink shadow-[var(--shadow-pop)]"
      overlayClassName="fixed inset-0 bg-[var(--overlay)]"
    >
      <div className="flex items-center border-b border-line px-3">
        <Command.Input
          placeholder="搜索页面或输入命令..."
          className="h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      <Command.List className="max-h-[320px] overflow-y-auto p-2">
        <Command.Empty className="py-6 text-center text-sm text-ink-muted">
          没有匹配的结果
        </Command.Empty>

        <Group heading="导航">
          <Item value="dashboard 仪表盘" onSelect={() => go('/dashboard')}>
            <LayoutDashboard />
            Dashboard
            <Hint>成长总览</Hint>
          </Item>
          <Item value="agent 对话" onSelect={() => go('/agent')}>
            <Bot />
            Agent
            <Hint>AI 成长伙伴</Hint>
          </Item>
        </Group>

        <Group heading="操作">
          <Item value="new 新建对话 agent" onSelect={() => go('/agent')}>
            <Plus />
            新建对话
          </Item>
          <Item
            value="theme 切换主题 深色 浅色"
            onSelect={() => run(toggleTheme)}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
            切换到{theme === 'dark' ? '浅色' : '深色'}模式
          </Item>
          <Item
            value="logout 退出登录"
            onSelect={() => run(() => void signOut())}
          >
            <LogOut />
            退出登录
            {user ? <Hint>{user.email}</Hint> : null}
          </Item>
        </Group>

        <Group heading="Ask Zeno">
          <Item
            value="ask today 今天该推进什么 任务"
            onSelect={() =>
              go(`/agent?q=${encodeURIComponent('我今天该推进什么？')}`)
            }
          >
            <Compass />
            问：我今天该推进什么？
          </Item>
          <Item
            value="ask trend 学习趋势 专注"
            onSelect={() =>
              go(`/agent?q=${encodeURIComponent('我的学习趋势怎么样？')}`)
            }
          >
            <TrendingUp />
            问：我的学习趋势怎么样？
          </Item>
          <Item
            value="ask review 复习 薄弱 知识"
            onSelect={() =>
              go(`/agent?q=${encodeURIComponent('哪些知识需要优先复习？')}`)
            }
          >
            <BrainCircuit />
            问：哪些知识需要优先复习？
          </Item>
        </Group>
      </Command.List>
    </Command.Dialog>
  )
}

function Group({
  heading,
  children,
}: {
  heading: string
  children: React.ReactNode
}) {
  return (
    <Command.Group
      heading={heading}
      className="px-1 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-faint [&_[cmdk-group-items]]:mt-1 [&_[cmdk-group-items]]:space-y-0.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
    >
      {children}
    </Command.Group>
  )
}

function Item({
  children,
  ...props
}: React.ComponentProps<typeof Command.Item>) {
  return (
    <Command.Item
      {...props}
      className="flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-ink-secondary data-[selected=true]:bg-surface-muted data-[selected=true]:text-ink [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted"
    >
      {children}
    </Command.Item>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto truncate text-xs text-ink-faint">{children}</span>
  )
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  return { open, setOpen }
}
