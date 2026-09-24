import { Skeleton } from '@/components/ui/skeleton'

export function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-label="正在加载工作台" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-card border border-line bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3.5 w-10" />
            </div>
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-card border border-line bg-surface p-5 xl:col-span-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-3.5 w-36" />
          <Skeleton className="mt-6 h-72 w-full" />
        </div>
        <div className="rounded-card border border-line bg-surface p-5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-2 h-3.5 w-24" />
          <div className="mt-6 flex justify-center">
            <Skeleton className="size-48 rounded-full" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-card border border-line bg-surface p-5 xl:col-span-2">
          <Skeleton className="h-4 w-24" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-card border border-line bg-surface p-5">
          <Skeleton className="h-4 w-24" />
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}