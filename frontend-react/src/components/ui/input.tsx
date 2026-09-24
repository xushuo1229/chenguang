import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink shadow-sm transition-colors placeholder:text-ink-faint hover:border-border-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary-ring)] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
