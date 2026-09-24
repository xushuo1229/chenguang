import { NavLink } from 'react-router-dom'
import { Bot, Home, LogOut, PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/stores/auth-store'

const navigation = [
  { label: 'Dashboard', description: '成长总览', to: '/dashboard', icon: Home },
  { label: 'Agent', description: '学习对话与建议', to: '/agent', icon: Bot },
]

type SidebarProps = {
  collapsed: boolean
  onToggleCollapsed?: () => void
}

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const { user, signOut } = useAuth()

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col border-r border-line/60 px-4 py-5 transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[88px]' : '',
      )}
    >
      <div className={cn('flex items-center gap-3 px-1', collapsed ? 'justify-center' : '')}>
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/20">
          <Sparkles className="size-5" />
        </span>
        {!collapsed ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-ink">Zeno Agent OS</span>
            <span className="block truncate text-xs text-muted">Personal Learning</span>
          </span>
        ) : null}
      </div>

      {onToggleCollapsed ? (
        <div className="mt-6 flex items-center justify-between px-1">
          {!collapsed ? <span className="text-xs font-medium text-muted">工作区导航</span> : null}
          <Button variant="ghost" size="icon" onClick={onToggleCollapsed} aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>
      ) : null}

      <nav className="mt-4 space-y-2">
        {navigation.map(({ to, label, description, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-all',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface-muted hover:text-ink',
                collapsed && 'justify-center',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" /> : null}
                <Icon className="size-[18px] shrink-0" />
                {!collapsed ? (
                  <span className="min-w-0">
                    <span className="block font-medium">{label}</span>
                    <span className="block truncate text-xs opacity-70">{description}</span>
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        {!collapsed ? (
          <div className="rounded-2xl border border-line/70 bg-surface-muted/70 p-3">
            <p className="text-xs text-muted">Agent 边界</p>
            <p className="mt-1 text-sm font-medium text-ink">Read-only · Confirm first</p>
          </div>
        ) : null}
        <div className="flex items-center gap-3 rounded-2xl px-2 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {(user?.nickname || user?.email || 'U').slice(0, 1).toUpperCase()}
          </span>
          {!collapsed ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{user?.nickname || 'Learning Agent User'}</span>
              <span className="block truncate text-xs text-muted">{user?.email}</span>
            </span>
          ) : null}
          <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="退出登录">
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
