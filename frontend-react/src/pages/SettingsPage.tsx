import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Mail, MonitorSmartphone } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/stores/auth-store'
import { updateProfile } from '@/services/profileService'
import * as authService from '@/services/authService'

const inputClass =
  'h-9 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary'

export default function SettingsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [saving, setSaving] = useState(false)
  const [loggingOutAll, setLoggingOutAll] = useState(false)

  useEffect(() => {
    setNickname(user?.nickname ?? '')
  }, [user?.nickname])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = nickname.trim()
    if (!value) {
      toast.error('昵称不能为空')
      return
    }
    if (value === user?.nickname) return
    setSaving(true)
    updateProfile({ nickname: value })
      .then(() => toast.success('个人资料已更新'))
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : '保存失败')
      })
      .finally(() => setSaving(false))
  }

  const handleLogoutAll = () => {
    setLoggingOutAll(true)
    authService
      .logoutAllDevices()
      .then(() => toast.success('其它设备已全部退出，当前设备保持登录'))
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : '操作失败')
      })
      .finally(() => setLoggingOutAll(false))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Zeno Workspace"
        title="个人设置"
        description="管理你的账号信息与界面偏好。"
      />

      <Card className="max-w-xl p-5">
        <h3 className="text-sm font-semibold text-ink">
          账号资料
        </h3>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-[13px] text-ink-secondary">
              昵称
            </label>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="你的昵称"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] text-ink-secondary">
              邮箱
            </label>
            <div className="flex h-9 items-center gap-2 rounded-control border border-line bg-surface-subtle px-3 text-sm text-ink-muted">
              <Mail className="size-4" />
              {user?.email}
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              保存修改
            </Button>
          </div>
        </form>
      </Card>

      <Card className="max-w-xl p-5">
        <h3 className="text-sm font-semibold text-ink">登录密码</h3>
        <p className="mt-1 text-[13px] leading-5 text-ink-muted">
          通过邮箱验证可自助重置密码；重置后所有已登录设备都需要重新登录。
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => navigate('/forgot-password')}
        >
          通过邮箱重置密码
        </Button>
      </Card>

      <Card className="max-w-xl p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-control bg-surface-muted">
            <MonitorSmartphone className="size-4 text-ink-secondary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-ink">登录设备管理</h3>
            <p className="mt-1 text-[13px] leading-5 text-ink-muted">
              如果怀疑账号在其它设备被登录，可一键使所有设备上的会话失效。当前设备会立即获得新会话，无需重新登录。
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={loggingOutAll}
              onClick={handleLogoutAll}
            >
              {loggingOutAll ? <Loader2 className="animate-spin" /> : null}
              登出所有设备
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
