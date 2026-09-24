import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronRight,
  Menu,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MobileNav } from '@/components/layout/MobileNav'
import {
  Sidebar,
} from '@/components/layout/Sidebar'
import { CommandDialog } from '@/components/command/CommandDialog'
import { cn } from '@/lib/utils'

export function WorkspaceLayout({
  children,
  fullBleed = false,
}: {
  children: ReactNode
  fullBleed?: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  return (
    <div className="min-h-dvh bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        onOpenCommand={() => setCommandOpen(true)}
      />

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen} />

      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-[var(--overlay)] lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 30, stiffness: 340 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-line bg-surface lg:hidden"
            >
              <MobileSidebarContent
                onOpenCommand={() => {
                  setMobileOpen(false)
                  setCommandOpen(true)
                }}
                onNavigate={() => setMobileOpen(false)}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div
        className={cn(
          'flex flex-col transition-[padding] duration-150',
          fullBleed ? 'h-dvh' : 'min-h-dvh',
          collapsed ? 'lg:pl-16' : 'lg:pl-[264px]',
        )}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="打开导航"
          >
            <Menu />
          </Button>

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-9 w-full max-w-[320px] items-center gap-2 rounded-control border border-line bg-surface-muted/60 px-3 text-sm text-ink-muted transition-colors hover:border-border-strong hover:text-ink-secondary"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">搜索或跳转...</span>
            <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] sm:block">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <NavLink to="/agent">
                Ask Zeno
                <ChevronRight className="size-3.5" />
              </NavLink>
            </Button>
          </div>
        </header>

        {fullBleed ? (
          <main className="min-h-0 flex-1">{children}</main>
        ) : (
          <main className="flex-1 px-4 py-6 pb-24 lg:px-6 lg:pb-10">
            <div className="mx-auto w-full max-w-[1200px]">{children}</div>
          </main>
        )}
      </div>

      <MobileNav />
    </div>
  )
}

function MobileSidebarContent({
  onNavigate,
  onOpenCommand,
}: {
  onNavigate: () => void
  onOpenCommand: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-line px-4">
        <span className="grid size-8 place-items-center rounded-control bg-primary text-primary-foreground">
          <Search className="size-4" />
        </span>
        <span className="text-sm font-semibold text-ink">Zeno Workspace</span>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Agent', to: '/agent' },
        ].map(({ label, to }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'block rounded-control px-3 py-2 text-sm font-medium',
                isActive
                  ? 'bg-primary-muted text-primary'
                  : 'text-ink-secondary',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={onOpenCommand}
        >
          <Search />
          命令面板
        </Button>
      </div>
    </div>
  )
}
