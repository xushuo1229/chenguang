import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { request } from '@/services/apiClient'
import { useAuth } from '@/stores/auth-store'

type AdminUser = {
  id: number
  email: string
  nickname: string
  is_admin: number
  email_verified: number
  created_at: string
}

type AdminUsersResponse = {
  users: AdminUser[]
  total: number
}

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth()
  const usersQuery = useQuery({
    queryKey: ['zeno', 'admin', 'users'],
    queryFn: () => request<AdminUsersResponse>('/admin/users'),
    enabled: Boolean(user?.is_admin),
  })

  if (authLoading) return <LoadingState text="正在校验权限..." className="mt-10" />
  if (!user?.is_admin) return <Navigate to="/dashboard" replace />

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Zeno Admin"
        title="后台管理"
        description="只读用户概览。账号体系与数据隔离由后端强制保证。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void usersQuery.refetch()}
          >
            <RefreshCw />
            刷新
          </Button>
        }
      />

      {usersQuery.isPending ? (
        <LoadingState text="正在加载用户..." className="mt-10" />
      ) : usersQuery.isError ? (
        <ErrorState text="加载失败，或你没有管理员权限。" className="mt-10" />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-4 py-3 text-[13px] text-ink-muted">
            共 {usersQuery.data.total} 个账号
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-4 py-2 font-medium">ID</th>
                  <th className="px-4 py-2 font-medium">邮箱</th>
                  <th className="px-4 py-2 font-medium">昵称</th>
                  <th className="px-4 py-2 font-medium">角色</th>
                  <th className="px-4 py-2 font-medium">邮箱验证</th>
                  <th className="px-4 py-2 font-medium">注册时间</th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.data.users.map((u) => (
                  <tr key={u.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-row tabular-nums text-ink-muted">{u.id}</td>
                    <td className="px-4 py-row text-ink">{u.email}</td>
                    <td className="px-4 py-row text-ink-secondary">{u.nickname}</td>
                    <td className="px-4 py-row">
                      {u.is_admin ? (
                        <Badge tone="primary">
                          <ShieldCheck className="size-3" />
                          管理员
                        </Badge>
                      ) : (
                        <span className="text-xs text-ink-faint">用户</span>
                      )}
                    </td>
                    <td className="px-4 py-row">
                      {u.email_verified ? (
                        <span className="text-xs text-success">已验证</span>
                      ) : (
                        <span className="text-xs text-ink-faint">未验证</span>
                      )}
                    </td>
                    <td className="px-4 py-row text-xs tabular-nums text-ink-muted">
                      {u.created_at}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
