import { AnimatePresence, motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth-store'
import { BrandMark } from './AppSidebar'
import { UserMenu } from './UserMenu'
import { adminItem, navGroups, settingsItem, topGroup } from './navConfig'

function MobileLink({
  to,
  label,
  onClose,
}: {
  to: string
  label: string
  onClose: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onClose}
      className={({ isActive }) =>
        cn(
          'block rounded-control px-2.5 py-1.5 text-[13px] font-medium',
          isActive
            ? 'bg-primary-muted text-primary'
            : 'text-ink-secondary hover:bg-surface-muted',
        )
      }
    >
      {label}
    </NavLink>
  )
}

export function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { user } = useAuth()

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-[var(--overlay)] lg:hidden"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-line bg-surface lg:hidden"
          >
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
              <BrandMark />
              <span className="flex-1 text-sm font-semibold text-ink">Zeno</span>
            </div>

            <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              <div className="space-y-0.5">
                {topGroup.items.map((item) => (
                  <MobileLink
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    onClose={onClose}
                  />
                ))}
              </div>

              {navGroups.map((group) => (
                <div key={group.id}>
                  <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <MobileLink
                        key={item.to}
                        to={item.to}
                        label={item.label}
                        onClose={onClose}
                      />
                    ))}
                  </div>
                </div>
              ))}

              <div className="space-y-0.5">
                <MobileLink
                  to={settingsItem.to}
                  label={settingsItem.label}
                  onClose={onClose}
                />
                {user?.is_admin ? (
                  <MobileLink
                    to={adminItem.to}
                    label={adminItem.label}
                    onClose={onClose}
                  />
                ) : null}
              </div>
            </nav>

            <div className="shrink-0 border-t border-line p-2">
              <UserMenu side="right" />
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
