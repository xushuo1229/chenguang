import { useState, type ReactNode } from 'react'
import { AppSidebar } from '@/components/shell/AppSidebar'
import { AppTopbar } from '@/components/shell/AppTopbar'
import { BottomNav } from '@/components/shell/BottomNav'
import { MobileDrawer } from '@/components/shell/MobileDrawer'
import { CommandProvider } from '@/components/command/CommandProvider'
import { cn } from '@/lib/utils'

type AppShellLayoutProps = {
  children: ReactNode
  fullBleed?: boolean
}

export function AppShellLayout({ children, fullBleed = false }: AppShellLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <CommandProvider>
      <div className="min-h-dvh bg-background">
        <AppSidebar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
        />

        <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

        <div
          className={cn(
            'flex flex-col transition-[padding] duration-150',
            fullBleed ? 'h-dvh' : 'min-h-dvh',
            collapsed ? 'lg:pl-[68px]' : 'lg:pl-[240px]',
          )}
        >
          <AppTopbar onOpenMobile={() => setMobileOpen(true)} />

          {fullBleed ? (
            <main className="min-h-0 flex-1">{children}</main>
          ) : (
            <main className="flex-1 px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-12">
              <div className="mx-auto w-full max-w-[1120px]">{children}</div>
            </main>
          )}
        </div>

        <BottomNav />
      </div>
    </CommandProvider>
  )
}
