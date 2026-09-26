import type {
  KbEvidence,
  KbNode,
  KbRelation,
} from '@/services/courseSpaceService'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, X } from 'lucide-react'
import { useState } from 'react'

const kindLabel: Record<string, string> = {
  concept: '概念',
  definition: '定义',
  principle: '原理',
  procedure: '流程',
  formula: '公式',
  example: '示例',
  skill: '技能',
}

export function NodeDetailDrawer({
  node,
  nodes,
  relations,
  evidence,
  onCreateRelation,
  onClose,
}: {
  node: KbNode
  nodes: KbNode[]
  relations: KbRelation[]
  evidence: KbEvidence[]
  onCreateRelation?: (input: {
    targetNodeId: string
    relationType: string
  }) => Promise<unknown>
  onClose: () => void
}) {
  const [targetId, setTargetId] = useState('')
  const [relationType, setRelationType] = useState('prerequisite')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const titleOf = (id: string) =>
    nodes.find((item) => item.id === id)?.title ?? id
  const outgoing = relations.filter(
    (relation) => relation.sourceNodeId === node.id,
  )
  const incoming = relations.filter(
    (relation) => relation.targetNodeId === node.id,
  )
  const nodeEvidence = evidence.filter((item) => item.nodeId === node.id)
  const otherNodes = nodes.filter((item) => item.id !== node.id)

  const handleAddRelation = async () => {
    if (!targetId || saving || !onCreateRelation) return
    setSaving(true)
    setFormError('')
    try {
      await onCreateRelation({ targetNodeId: targetId, relationType })
      setTargetId('')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '添加失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="关闭详情"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="info">{kindLabel[node.kind] ?? node.kind}</Badge>
              <span className="text-xs text-ink-muted">
                置信度 {node.confidence}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold text-ink">
              {node.title}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X />
          </Button>
        </div>

        <p className="mt-4 text-sm leading-6 text-ink-secondary">
          {node.definition || '暂无定义，等待后续文档补充。'}
        </p>

        <section className="mt-6">
          <h3 className="text-[13px] font-semibold text-ink">关系</h3>
          <ul className="mt-2 space-y-2">
            {[...outgoing, ...incoming].length === 0 ? (
              <li className="text-[13px] text-ink-muted">暂无关系</li>
            ) : (
              [...outgoing, ...incoming].map((relation) => {
                const outward = relation.sourceNodeId === node.id
                const otherId = outward
                  ? relation.targetNodeId
                  : relation.sourceNodeId
                return (
                  <li
                    key={relation.id}
                    className="rounded-control border border-line p-2.5 text-[13px]"
                  >
                    <span className="text-ink-muted">
                      {outward ? '→' : '←'} {relation.relationType}
                    </span>
                    <p className="mt-0.5 text-ink">{titleOf(otherId)}</p>
                  </li>
                )
              })
            )}
          </ul>
          {onCreateRelation && otherNodes.length > 0 ? (
            <div className="mt-3 rounded-control border border-line p-3">
              <p className="text-[13px] font-medium text-ink">添加关系</p>
              <div className="mt-2 space-y-2">
                <select
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                  className="h-9 w-full rounded-control border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-primary"
                >
                  <option value="">选择目标知识点</option>
                  {otherNodes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <select
                  value={relationType}
                  onChange={(event) => setRelationType(event.target.value)}
                  className="h-9 w-full rounded-control border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-primary"
                >
                  <option value="prerequisite">前置知识</option>
                  <option value="related_to">相关</option>
                </select>
                {formError ? (
                  <p className="text-xs text-danger">{formError}</p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={saving || !targetId}
                  onClick={handleAddRelation}
                >
                  {saving ? <Loader2 className="animate-spin" /> : <Plus />}
                  添加关系
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-6">
          <h3 className="text-[13px] font-semibold text-ink">证据</h3>
          <ul className="mt-2 space-y-2">
            {nodeEvidence.length === 0 ? (
              <li className="text-[13px] text-ink-muted">暂无引用证据</li>
            ) : (
              nodeEvidence.map((item) => (
                <li
                  key={item.id}
                  className="rounded-control border border-line bg-surface-subtle p-3"
                >
                  <p className="text-[13px] leading-5 text-ink">
                    “{item.quote}”
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {item.locator || '文档引用'}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>
      </aside>
    </div>
  )
}
