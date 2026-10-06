import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { bottomNavItems } from './navConfig'

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        {bottomNavItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-w-16 flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] transition-colors',
                  isActive
                    ? 'bg-primary-muted text-primary'
                    : 'text-ink-muted hover:text-ink',
                )
              }
            >
              <Icon className="size-5" />
              {item.label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
