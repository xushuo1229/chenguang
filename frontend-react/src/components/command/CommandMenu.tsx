import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  BarChart3,
  LogOut,
  Moon,
  Plus,
  Sun,
} from 'lucide-react'
import { useAuth } from '@/stores/auth-store'
import { useTheme } from '@/stores/theme-store'
import { useSnapshot } from '@/features/snapshot/useSnapshot'
import { allNavItems } from '@/components/shell/navConfig'

type CommandMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { signOut } = useAuth()
  const snapshotQuery = useSnapshot()
  const snapshot = snapshotQuery.data

  const go = (path: string) => {
    onOpenChange(false)
    navigate(path)
  }

  const run = (action: () => void) => {
    onOpenChange(false)
    action()
  }

  const courses = snapshot?.data.courses ?? []
  const goals = snapshot?.data.goals ?? []

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Zeno Command Menu"
      contentClassName="fixed left-1/2 top-[16%] z-[70] w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-card border border-line bg-surface text-ink shadow-[var(--shadow-pop)]"
      overlayClassName="fixed inset-0 bg-[var(--overlay)]"
    >
      <div className="flex items-center border-b border-line px-3">
        <Command.Input
          placeholder="搜索页面、课程、目标，或输入命令…"
          className="h-11 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      <Command.List className="max-h-[360px] overflow-y-auto p-2">
        <Command.Empty className="py-6 text-center text-sm text-ink-muted">
          没有匹配的结果
        </Command.Empty>

        <Group heading="页面">
          {allNavItems.map((item) => {
            const Icon = item.icon
            return (
              <Item
                key={item.to}
                value={`${item.label} ${item.keywords ?? ''}`}
                onSelect={() => go(item.to)}
              >
                <Icon />
                {item.label}
              </Item>
            )
          })}
        </Group>

        {courses.length ? (
          <Group heading="课程">
            {courses.slice(0, 8).map((course, index) => (
              <Item
                key={course.id || `idx-${index}`}
                value={`course ${course.name ?? ''} 课程`}
                onSelect={() =>
                  go(
                    `/learning/courses/${
                      course.id || `idx-${index}`
                    }`,
                  )
                }
              >
                <BarChart3 />
                {course.name || '未命名课程'}
                <Hint>{Math.round(Number(course.progress) || 0)}%</Hint>
              </Item>
            ))}
          </Group>
        ) : null}

        {goals.length ? (
          <Group heading="目标">
            {goals.slice(0, 8).map((goal, index) => (
              <Item
                key={goal.id || `goal-idx-${index}`}
                value={`goal ${goal.title ?? ''} 目标`}
                onSelect={() => go('/growth/goals')}
              >
                <Plus />
                {goal.title || '未命名目标'}
                <Hint>{Math.round(Number(goal.progress) || 0)}%</Hint>
              </Item>
            ))}
          </Group>
        ) : null}

        <Group heading="操作">
          <Item value="new chat 新建对话" onSelect={() => go('/agent')}>
            <Plus />
            新建对话
          </Item>
          <Item
            value="theme 主题 深色 浅色"
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
          </Item>
        </Group>

        <Group heading="Ask Zeno">
          <Item
            value="ask today 今天"
            onSelect={() =>
              go(`/agent?q=${encodeURIComponent('我今天该推进什么？')}`)
            }
          >
            问：我今天该推进什么？
          </Item>
          <Item
            value="ask trend 趋势 专注"
            onSelect={() =>
              go(`/agent?q=${encodeURIComponent('我的学习趋势怎么样？')}`)
            }
          >
            问：我的学习趋势怎么样？
          </Item>
          <Item
            value="ask review 复习 薄弱"
            onSelect={() =>
              go(`/agent?q=${encodeURIComponent('哪些知识需要优先复习？')}`)
            }
          >
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

function Item(props: React.ComponentProps<typeof Command.Item>) {
  return (
    <Command.Item
      {...props}
      className="flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-ink-secondary data-[selected=true]:bg-surface-muted data-[selected=true]:text-ink [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted"
    />
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-faint">
      {children}
    </span>
  )
}
