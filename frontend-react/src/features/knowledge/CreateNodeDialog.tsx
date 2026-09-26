import { useEffect, useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createNode } from '@/services/courseSpaceService'

const nodeKinds = [
  { value: 'concept', label: '概念' },
  { value: 'principle', label: '原理' },
  { value: 'procedure', label: '流程' },
  { value: 'skill', label: '技能' },
  { value: 'definition', label: '定义' },
  { value: 'formula', label: '公式' },
  { value: 'example', label: '示例' },
]

export function CreateNodeDialog({
  open,
  courseId,
  onClose,
  onCreated,
}: {
  open: boolean
  courseId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('concept')
  const [definition, setDefinition] = useState('')

  const createMutation = useMutation({
    mutationFn: () =>
      createNode({
        courseId,
        title: title.trim(),
        kind,
        definition: definition.trim() || undefined,
      }),
    onSuccess: async () => {
      setTitle('')
      setKind('concept')
      setDefinition('')
      onCreated()
      onClose()
    },
  })

  useEffect(() => {
    if (open) {
      setTitle('')
      setKind('concept')
      setDefinition('')
      createMutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (title.trim() && !createMutation.isPending) createMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-card border border-line bg-surface p-6">
        <h2 className="text-base font-semibold text-ink">新建知识点</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          手动补入的节点会标记为草稿，后续可用文档证据背书。
        </p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="知识点标题，如：闭包"
            className="h-9 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary"
          />
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="h-9 w-full rounded-control border border-line bg-surface px-2.5 text-sm text-ink outline-none focus:border-primary"
          >
            {nodeKinds.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <textarea
            value={definition}
            onChange={(event) => setDefinition(event.target.value)}
            placeholder="定义或说明（可选）"
            rows={4}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-faint focus:border-primary"
          />
          {createMutation.isError ? (
            <p className="text-xs text-danger">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : '保存失败'}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createMutation.isPending || !title.trim()}
            >
              {createMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plus />
              )}
              创建节点
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}