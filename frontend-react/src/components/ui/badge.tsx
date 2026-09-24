import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral:
          'border-line bg-surface-muted text-ink-secondary',
        primary:
          'border-transparent bg-primary-muted text-primary',
        success:
          'border-transparent bg-success-muted text-success',
        warning:
          'border-transparent bg-warning-muted text-warning',
        danger:
          'border-transparent bg-danger-muted text-danger',
        info: 'border-transparent bg-info-muted text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>

export function Badge({ className, tone, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props} />
  )
}

export { badgeVariants }
