import { NavLink } from 'react-router-dom'
import { Bot, Home, Library } from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { label: 'Dashboard', to: '/dashboard', icon: Home },
  { label: 'Knowledge', to: '/knowledge', icon: Library },
  { label: 'Agent', to: '/agent', icon: Bot },
]

export function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {navigation.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex min-w-16 flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] transition-colors',
                isActive ? 'bg-primary-muted text-primary' : 'text-ink-muted hover:text-ink',
              )
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
