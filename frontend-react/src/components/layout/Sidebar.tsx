import { NavLink } from 'react-router-dom'
import {
  Bot,
  ChevronsUpDown,
  Command as CommandIcon,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  Plus,
  Sun,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuth } from '@/stores/auth-store'
import { useTheme } from '@/stores/theme-store'
import { cn } from '@/lib/utils'

export const SIDEBAR_WIDTH = 264
export const SIDEBAR_COLLAPSED_WIDTH = 64

const navigation = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Agent', to: '/agent', icon: Bot },
]

type SidebarProps = {
  collapsed: boolean
  onToggleCollapsed: () => void
  onOpenCommand: () => void
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  onOpenCommand,
}: SidebarProps) {
  const { user, signOut } = useAuth()
  const { theme, toggleTheme, density, setDensity } = useTheme()
  const initial = (user?.nickname || user?.email || 'U')
    .slice(0, 1)
    .toUpperCase()

  return (
    <aside
      style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
      className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface transition-[width] duration-150 lg:flex"
    >
      <div
        className={cn(
          'flex h-14 items-center gap-2 border-b border-line px-3',
          collapsed && 'justify-center px-0',
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="展开侧栏"
            title="展开侧栏"
          >
            <BrandMark />
          </button>
        ) : (
          <BrandMark />
        )}
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">Zeno</p>
            <p className="truncate text-[11px] text-ink-muted">
              AI Personal Growth OS
            </p>
          </div>
        ) : null}
        {!collapsed ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapsed}
            aria-label="折叠侧栏"
          >
            <PanelLeftClose />
          </Button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {navigation.map(({ label, to, icon: Icon }) => (
          <Tooltip key={to}>
            <TooltipTrigger asChild>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm font-medium transition-colors',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-primary-muted text-primary'
                      : 'text-ink-secondary hover:bg-surface-muted hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                    ) : null}
                    <Icon className="size-4 shrink-0" />
                    {!collapsed ? <span>{label}</span> : null}
                  </>
                )}
              </NavLink>
            </TooltipTrigger>
            {collapsed ? <TooltipContent side="right">{label}</TooltipContent> : null}
          </Tooltip>
        ))}
      </nav>

      <div className="space-y-1 border-t border-line p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenCommand}
          className={cn(
            'w-full justify-between text-ink-muted',
            collapsed && 'size-8 justify-center px-0',
          )}
        >
          <span className="flex items-center gap-2.5">
            <CommandIcon className="size-4" />
            {!collapsed ? <span>命令面板</span> : null}
          </span>
          {!collapsed ? (
            <kbd className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
              ⌘K
            </kbd>
          ) : null}
        </Button>

        {!collapsed ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="w-full justify-start"
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
            {theme === 'dark' ? '浅色模式' : '深色模式'}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleTheme}
                className="w-full"
                aria-label="切换主题"
              >
                {theme === 'dark' ? <Sun /> : <Moon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {theme === 'dark' ? '浅色模式' : '深色模式'}
            </TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-2 rounded-control px-1.5 py-1.5 text-left transition-colors hover:bg-surface-muted',
                collapsed && 'justify-center px-0',
              )}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initial}
              </span>
              {!collapsed ? (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {user?.nickname || 'Zeno User'}
                    </span>
                    <span className="block truncate text-[11px] text-ink-muted">
                      {user?.email}
                    </span>
                  </span>
                  <ChevronsUpDown className="size-3.5 text-ink-muted" />
                </>
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-60">
            <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>界面密度</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={density === 'comfortable'}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => setDensity('comfortable')}
            >
              舒适
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={density === 'compact'}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => setDensity('compact')}
            >
              紧凑
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={toggleTheme}>
              {theme === 'dark' ? <Sun /> : <Moon />}
              切换主题
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Plus />
              新建对话
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-danger focus:text-danger"
              onSelect={() => void signOut()}
            >
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}

function BrandMark() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-control bg-primary text-primary-foreground">
      <svg viewBox="0 0 24 24" className="size-4.5" fill="none" aria-hidden>
        <path
          d="M5 15c5 0 5-8 10-8 2.4 0 4 1.6 4 3.6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="5" cy="11" r="1.8" fill="currentColor" />
        <circle cx="19" cy="13.4" r="1.5" fill="currentColor" />
      </svg>
    </span>
  )
}
