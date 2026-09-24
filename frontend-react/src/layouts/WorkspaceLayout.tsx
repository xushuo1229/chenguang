import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, Menu, Sparkles } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { ContextPanel } from '@/features/workspace/ContextPanel'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

const titles: Record<string, { title: string; description: string }> = {
  '/dashboard': { title: 'Dashboard', description: '成长状态与下一步' },
  '/agent': { title: 'Agent Workspace', description: '与你的 AI 成长伙伴对话' },
}

export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const { user } = useAuth()
  const heading = titles[pathname] || { title: 'Zeno Workspace', description: 'AI 个人成长工作区' }

  return (
    <div className="min-h-dvh">
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((value) => !value)} />

      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="glass-panel fixed inset-y-0 left-0 z-50 w-[286px] p-4 lg:hidden"
            >
              <MobileSidebarContent onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div
        className={cn(
          'flex min-h-dvh transition-[padding] duration-200',
          collapsed ? 'lg:pl-[88px]' : 'lg:pl-[280px]',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass-panel sticky top-0 z-20 border-x-0 border-t-0 px-4 py-3.5 lg:px-8">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="打开导航">
                <Menu className="size-5" />
              </Button>
              <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary lg:hidden">
                <Sparkles className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight text-ink">{heading.title}</h1>
                <p className="truncate text-sm text-muted">{heading.description}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <NavLink to="/agent">
                    Ask Zeno
                    <ArrowUpRight className="size-4" />
                  </NavLink>
                </Button>
                <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {(user?.nickname || user?.email || 'U').slice(0, 1).toUpperCase()}
                </span>
              </div>
            </div>
          </header>

          <main className="flex min-w-0 flex-1">
            <div className="min-w-0 flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-8">{children}</div>
            <ContextPanel />
          </main>
        </div>
      </div>

      <MobileNav />
    </div>
  )
}

function MobileSidebarContent({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-2 py-2">
        <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white">
          <Sparkles className="size-5" />
        </span>
        <span className="text-sm font-bold text-ink">Zeno Workspace</span>
      </div>
      <nav className="mt-5 space-y-1.5">
        {[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Agent', to: '/agent' },
        ].map(({ label, to }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn('block rounded-2xl px-3 py-3 text-sm', isActive ? 'bg-primary/10 text-primary' : 'text-muted')
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
