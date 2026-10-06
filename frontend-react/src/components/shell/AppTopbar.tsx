import { Bell, ChevronRight, Menu, Search } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSnapshot } from '@/features/snapshot/useSnapshot'
import { allNavItems } from '@/components/shell/navConfig'
import { UserMenu } from './UserMenu'

const sectionLabels: Record<string, string> = {
  profile: '个人资料',
  appearance: '外观',
  notifications: '通知',
  agent: 'Agent',
  data: '数据',
  security: '安全',
}

type Crumb = { label: string; to?: string }

function useBreadcrumb(): Crumb[] {
  const { pathname } = useLocation()
  const snapshotQuery = useSnapshot()
  const data = snapshotQuery.data?.data

  const settingsSection = pathname.match(/^\/settings\/([^/]+)/)
  if (settingsSection) {
    return [
      { label: 'Settings', to: '/settings' },
      { label: sectionLabels[settingsSection[1]] ?? settingsSection[1] },
    ]
  }

  const courseSegment = pathname.match(/^\/learning\/courses\/([^/]+)/)
  if (courseSegment) {
    const key = decodeURIComponent(courseSegment[1])
    const courses = data?.courses ?? []
    const index = courses.findIndex((course, index2) =>
      course.id ? course.id === key : `idx-${index2}` === key,
    )
    const name = index >= 0 ? courses[index].name : '课程详情'
    return [
      { label: 'Courses', to: '/learning/courses' },
      { label: name || '未命名课程' },
    ]
  }

  const match = allNavItems
    .filter((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]
  return match ? [{ label: match.label }] : [{ label: 'Zeno' }]
}

function openCommand() {
  document.dispatchEvent(new CustomEvent('zeno:open-command'))
}

type AppTopbarProps = {
  onOpenMobile: () => void
}

export function AppTopbar({ onOpenMobile }: AppTopbarProps) {
  const crumbs = useBreadcrumb()

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur lg:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobile}
        aria-label="打开导航"
      >
        <Menu />
      </Button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <ChevronRight className="size-3.5 shrink-0 text-ink-faint" /> : null}
            <span
              className={
                index === crumbs.length - 1
                  ? 'truncate font-medium text-ink'
                  : 'shrink-0 text-ink-muted'
              }
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      <button
        type="button"
        onClick={openCommand}
        className="ml-auto flex h-8 w-8 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink lg:h-9 lg:w-[220px] lg:justify-start lg:gap-2 lg:border lg:border-line lg:bg-surface-muted/60 lg:px-3 hover:lg:border-border-strong"
        aria-label="搜索或跳转"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 text-left text-[13px] lg:block">搜索…</span>
        <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] lg:block">
          ⌘K
        </kbd>
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant="ghost"
              size="icon"
              disabled
              aria-label="通知（即将上线）"
              className="hidden text-ink-faint sm:inline-flex"
            >
              <Bell />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>通知功能即将上线</TooltipContent>
      </Tooltip>

      <span className="hidden sm:block">
        <UserMenu collapsed side="bottom" />
      </span>
    </header>
  )
}
