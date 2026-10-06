import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Download,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  KeyRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/stores/auth-store'
import { useTheme } from '@/stores/theme-store'
import { updateProfile } from '@/services/profileService'
import { logoutAllDevices } from '@/services/authService'
import { fetchSnapshot } from '@/services/snapshotService'
import { cn } from '@/lib/utils'

type SectionId =
  | 'profile'
  | 'appearance'
  | 'notifications'
  | 'agent'
  | 'data'
  | 'security'

const sections: Array<{ id: SectionId; label: string }> = [
  { id: 'profile', label: '个人资料' },
  { id: 'appearance', label: '外观' },
  { id: 'notifications', label: '通知' },
  { id: 'agent', label: 'Agent' },
  { id: 'data', label: '数据' },
  { id: 'security', label: '安全' },
]

export default function SettingsPage() {
  const params = useParams<{ section?: SectionId }>()
  const section = params.section ?? 'profile'
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { theme, setTheme, density, setDensity } = useTheme()

  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    const next = nickname.trim()
    if (!next || next === user?.nickname) return
    setSavingProfile(true)
    try {
      await updateProfile({ nickname: next })
      await queryClient.invalidateQueries({ queryKey: ['zeno-auth', 'me'] })
      toast.success('资料已更新')
    } catch {
      toast.error('保存失败，请重试')
    } finally {
      setSavingProfile(false)
    }
  }

  const exportData = async () => {
    try {
      const snapshot = await fetchSnapshot()
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `zeno-data-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('导出失败，请重试')
    }
  }

  const logoutAll = async () => {
    try {
      await logoutAllDevices()
      toast.success('其他设备已退出')
    } catch {
      toast.error('操作失败，请重试')
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-0.5 text-[13px] text-ink-muted">管理你的账户、外观与数据。</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[180px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(`/settings/${item.id}`)}
              className={cn(
                'shrink-0 rounded-control px-3 py-1.5 text-left text-[13px] transition-colors',
                section === item.id
                  ? 'bg-primary-muted font-medium text-primary'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 rounded-card border border-line bg-surface px-5 py-5">
          {section === 'profile' ? (
            <form onSubmit={saveProfile} className="space-y-4">
              <Row label="邮箱">
                <p className="text-[13px] text-ink-muted">{user?.email}</p>
              </Row>
              <Row label="昵称">
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  className="h-[var(--control-h)] w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary"
                />
              </Row>
              <Button type="submit" size="sm" disabled={savingProfile}>
                保存修改
              </Button>
            </form>
          ) : null}

          {section === 'appearance' ? (
            <div className="space-y-6">
              <div>
                <p className="text-[13px] font-medium text-ink">主题</p>
                <div className="mt-2.5 flex gap-2">
                  <Choice
                    active={theme === 'light'}
                    onClick={() => setTheme('light')}
                    icon={<Sun className="size-4" />}
                    label="浅色"
                  />
                  <Choice
                    active={theme === 'dark'}
                    onClick={() => setTheme('dark')}
                    icon={<Moon className="size-4" />}
                    label="深色"
                  />
                </div>
              </div>
              <div>
                <p className="text-[13px] font-medium text-ink">界面密度</p>
                <div className="mt-2.5 flex gap-2">
                  <Choice
                    active={density === 'comfortable'}
                    onClick={() => setDensity('comfortable')}
                    label="舒适"
                  />
                  <Choice
                    active={density === 'compact'}
                    onClick={() => setDensity('compact')}
                    label="紧凑"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {section === 'notifications' ? (
            <div className="space-y-3">
              <p className="text-[13px] font-medium text-ink">通知偏好</p>
              <p className="text-[13px] text-ink-muted">
                邮件与站内通知功能即将上线，届时可在此管理复习提醒与每周总结。
              </p>
              <div className="space-y-2 opacity-60">
                <ToggleRow label="复习提醒" />
                <ToggleRow label="每周学习总结" />
              </div>
            </div>
          ) : null}

          {section === 'agent' ? (
            <div className="space-y-3">
              <p className="text-[13px] font-medium text-ink">Agent 模式</p>
              <ul className="space-y-2 text-[13px] leading-5 text-ink-muted">
                <li className="rounded-control bg-surface-muted px-3 py-2">
                  Personal Agent：读取你的课程、目标与学习记录来回答。
                </li>
                <li className="rounded-control bg-surface-muted px-3 py-2">
                  General AI：不访问个人数据，用于通用问题。
                </li>
              </ul>
              <p className="flex items-center gap-1.5 text-[12px] text-ink-faint">
                <ShieldCheck className="size-3.5" />
                AI 对数据只读，任何写入都需要你确认。
              </p>
            </div>
          ) : null}

          {section === 'data' ? (
            <div className="space-y-4">
              <p className="text-[13px] font-medium text-ink">导出数据</p>
              <p className="text-[13px] text-ink-muted">
                下载你在 Zeno 中的全部数据快照（JSON），可用于备份或迁移。
              </p>
              <Button variant="secondary" size="sm" onClick={exportData}>
                <Download className="size-4" />
                导出 JSON
              </Button>
            </div>
          ) : null}

          {section === 'security' ? (
            <div className="space-y-4">
              <div>
                <p className="text-[13px] font-medium text-ink">密码</p>
                <Link
                  to="/forgot-password"
                  className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
                >
                  <KeyRound className="size-3.5" />
                  通过邮件重置密码
                </Link>
              </div>
              <div className="border-t border-line pt-4">
                <p className="text-[13px] font-medium text-ink">登录设备</p>
                <p className="mt-1 text-[13px] text-ink-muted">
                  退出当前账户在所有其他设备上的登录会话。
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={logoutAll}
                >
                  <LogOut className="size-4" />
                  退出所有其他设备
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[100px_1fr] sm:items-center">
      <span className="text-[13px] text-ink-muted">{label}</span>
      {children}
    </div>
  )
}

function Choice({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-control border px-3.5 py-2 text-[13px] transition-colors',
        active
          ? 'border-primary bg-primary-muted text-primary'
          : 'border-line text-ink-muted hover:border-border-strong',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function ToggleRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-control border border-line px-3 py-2">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="h-5 w-9 rounded-full bg-surface-muted" />
    </div>
  )
}
