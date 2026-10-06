import { NavLink } from 'react-router-dom'
import { PanelLeftClose, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { UserMenu } from './UserMenu'
import { adminItem, navGroups, settingsItem, topGroup, type NavItem } from './navConfig'

export const APP_SIDEBAR_WIDTH = 240
export const APP_SIDEBAR_COLLAPSED_WIDTH = 68

type AppSidebarProps = {
  collapsed: boolean
  onToggleCollapsed: () => void
}

function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-2.5 rounded-control px-2 py-1.5 text-[13px] font-medium transition-colors',
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
            <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
          ) : null}
          <Icon className="size-4 shrink-0" />
          {!collapsed ? <span className="truncate">{item.label}</span> : null}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

export function AppSidebar({ collapsed, onToggleCollapsed }: AppSidebarProps) {
  const { user } = useAuth()

  const bottomItems: NavItem[] = [
    settingsItem,
    ...(user?.is_admin ? [adminItem] : []),
  ]

  const groups = [topGroup, ...navGroups]

  return (
    <aside
      style={{ width: collapsed ? APP_SIDEBAR_COLLAPSED_WIDTH : APP_SIDEBAR_WIDTH }}
      className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface transition-[width] duration-150 lg:flex"
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2 border-b border-line px-3',
          collapsed && 'justify-center px-0',
        )}
      >
        <BrandMark />
        {!collapsed ? (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
            Zeno
          </span>
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

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {!collapsed ? (
          <Button asChild variant="secondary" size="sm" className="mb-1 w-full">
            <NavLink to="/agent">
              <Plus className="size-4" />
              新建对话
            </NavLink>
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <NavLink
                to="/agent"
                aria-label="新建对话"
                className="mb-1 grid size-8 place-items-center rounded-control text-ink-secondary hover:bg-surface-muted hover:text-ink"
              >
                <Plus className="size-4" />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right">新建对话</TooltipContent>
          </Tooltip>
        )}

        {groups.map((group) => (
          <div key={group.id} className="pt-2 first:pt-0">
            {group.label && !collapsed ? (
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {group.label}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavRow key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-0.5 pt-2">
          {bottomItems.map((item) => (
            <NavRow key={item.to} item={item} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      <div className="shrink-0 border-t border-line p-2">
        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  )
}

export function BrandMark() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-control bg-primary text-primary-foreground">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
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
