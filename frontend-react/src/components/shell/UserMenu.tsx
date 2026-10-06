import { ChevronsUpDown, LogOut, Moon, Plus, Settings, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/stores/auth-store'
import { useTheme } from '@/stores/theme-store'
import { cn } from '@/lib/utils'

type UserMenuProps = {
  collapsed?: boolean
  side?: 'right' | 'bottom'
}

export function UserMenu({ collapsed = false, side = 'right' }: UserMenuProps) {
  const { user, signOut } = useAuth()
  const { theme, toggleTheme, density, setDensity } = useTheme()
  const navigate = useNavigate()
  const initial = (user?.nickname || user?.email || 'U')
    .slice(0, 1)
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="用户菜单"
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
              <ChevronsUpDown className="size-3.5 shrink-0 text-ink-muted" />
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-60">
        <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/agent')}>
          <Plus />
          新建对话
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings />
          个人设置
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>界面密度</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={density === 'comfortable'}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={() => setDensity('comfortable')}
        >
          舒适
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={density === 'compact'}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={() => setDensity('compact')}
        >
          紧凑
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggleTheme}>
          {theme === 'dark' ? <Sun /> : <Moon />}
          {theme === 'dark' ? '浅色模式' : '深色模式'}
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
  )
}
