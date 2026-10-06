import { useEffect, useState, type ReactNode } from 'react'
import { CommandMenu } from './CommandMenu'

export function CommandProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    const onOpenRequest = () => setOpen(true)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('zeno:open-command', onOpenRequest)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('zeno:open-command', onOpenRequest)
    }
  }, [])

  return (
    <>
      {children}
      <CommandMenu open={open} onOpenChange={setOpen} />
    </>
  )
}
