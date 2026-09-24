import { useMutation, useQuery } from '@tanstack/react-query'
import { BrainCircuit, Mail, Target, User } from 'lucide-react'
import { Badge } from '@/components/UI/badge'
import { Button } from '@/components/UI/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/UI/card'
import { Input } from '@/components/UI/input'
import { EmptyState, ErrorState, LoadingState } from '@/components/UI/state'
import { Progress } from '@/components/UI/progress'
import { getAgentContext } from '@/services/agentService'
import { getSyncSnapshot } from '@/services/analyticsService'
import { updateProfile } from '@/services/profileService'
import { useAuth } from '@/stores/auth-store'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export default function ProfilePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [nickname, setNickname] = useState(user?.nickname || '')
  const contextQuery = useQuery({ queryKey: ['personal-agent', 'context'], queryFn: getAgentContext })
  const snapshotQuery = useQuery({ queryKey: ['sync', 'snapshot'], queryFn: getSyncSnapshot })

  const updateMutation = useMutation({
    mutationFn: () => updateProfile({ nickname: nickname.trim() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth'] }),
  })

  if (contextQuery.isPending || snapshotQuery.isPending) return <LoadingState text="正在加载画像..." className="mt-6" />
  if (contextQuery.isError || snapshotQuery.isError) return <ErrorState text="学习画像暂时不可用。" className="mt-6" />

  const context = contextQuery.data
  const behavior = context?.context?.behavior?.value
  const goals = behavior?.goals || []
  const memories = context?.context?.memories?.growth?.value?.items || []
  const insights = context?.previousInsights || []
  const strongTopics = context?.context?.knowledgeStates?.value?.strongTopics || []
  const weakTopics = context?.context?.knowledgeStates?.value?.weakTopics || []
  const email = user?.email || ''

  return (
    <div className="space-y-6">
      <section className="surface-card p-7">
        <div className="flex flex-wrap items-center gap-5">
          <span className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-primary to-secondary text-2xl font-bold text-white">
            {(nickname || user?.nickname || email || 'U').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-tight text-ink">{user?.nickname || 'Learning Agent User'}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><Mail className="size-4" /> {email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="primary">Personal Learning Agent</Badge>
              <Badge tone="secondary">Read-only Context</Badge>
              <Badge tone="success">Confirmed Memory</Badge>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Account</CardTitle>
              <CardDescription>修改展示昵称</CardDescription>
            </div>
            <User className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                updateMutation.mutate()
              }}
            >
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">昵称</span>
                <Input value={nickname} onChange={(event) => setNickname(event.target.value)} />
              </label>
              {updateMutation.isError ? <ErrorState text={(updateMutation.error as Error).message} /> : null}
              <Button type="submit" disabled={updateMutation.isPending || !nickname.trim()}>
                {updateMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Learning Goals</CardTitle>
              <CardDescription>来自同步数据的目标投影</CardDescription>
            </div>
            <Target className="size-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-4">
            {goals.length ? goals.slice(0, 6).map((goal, index) => (
              <article key={goal.title || index} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">{goal.title || '未命名目标'}</p>
                  <span className="text-sm text-muted">{Math.round((Number(goal.progress) || 0) * 100)}%</span>
                </div>
                <Progress value={(Number(goal.progress) || 0) * 100} className="mt-3" />
              </article>
            )) : <EmptyState title="暂无目标" description="创建目标后会出现在这里。" />}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Learning Traits</CardTitle>
              <CardDescription>基于确定性洞察</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {insights.length ? (
              <ul className="space-y-2">
                {insights.slice(0, 4).map((insight, index) => (
                  <li key={insight.title || index} className="rounded-2xl bg-slate-50 p-3 text-sm text-ink">{insight.title}</li>
                ))}
              </ul>
            ) : (
              <EmptyState title="暂无明显特征" description="需要更多学习数据。" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Knowledge Profile</CardTitle>
              <CardDescription>掌握与薄弱分布</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {strongTopics.length ? (
              <div className="rounded-2xl bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">已掌握</p>
                <p className="mt-1 text-sm text-emerald-800">{strongTopics.join(' · ')}</p>
              </div>
            ) : null}
            {weakTopics.length ? (
              <div className="rounded-2xl bg-amber-50 p-3">
                <p className="text-xs text-amber-700">待巩固</p>
                <p className="mt-1 text-sm text-amber-800">{weakTopics.join(' · ')}</p>
              </div>
            ) : null}
            {!strongTopics.length && !weakTopics.length ? <EmptyState title="暂无知识状态" /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>AI Memory</CardTitle>
              <CardDescription>只读、可解释</CardDescription>
            </div>
            <BrainCircuit className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            {memories.length ? (
              <ul className="space-y-2">
                {memories.slice(0, 6).map((memory) => (
                  <li key={memory.id} className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs uppercase text-muted">{memory.category}</p>
                    <p className="mt-1 text-sm text-ink">{memory.content}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="暂无长期记忆" description="AI 不会虚构个人记忆。" />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
