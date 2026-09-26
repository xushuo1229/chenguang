import { useState, type FormEvent } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { FileText, Loader2, Sparkles, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, LoadingState } from '@/components/ui/state'
import {
  createDocument,
  createExtractionJob,
  getCourseSpace,
  waitForExtractionJob,
} from '@/services/courseSpaceService'

const terminalJobStatuses = new Set(['completed', 'failed', 'cancelled'])

export function DocumentsTab({
  courseId,
  onExtracted,
}: {
  courseId: string
  onExtracted: () => void
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')

  const spaceQuery = useQuery({
    queryKey: ['course-space', courseId],
    queryFn: () => getCourseSpace(courseId),
  })

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['course-space', courseId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['extraction-candidates', courseId],
      }),
    ])

  const createMutation = useMutation({
    mutationFn: () =>
      createDocument({
        courseId,
        title: title.trim(),
        content: content.trim(),
        sourceUrl: sourceUrl.trim() || undefined,
      }),
    onSuccess: async () => {
      setTitle('')
      setContent('')
      setSourceUrl('')
      await invalidate()
    },
  })

  const extractMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const job = await createExtractionJob({ courseId, documentId })
      const settled = terminalJobStatuses.has(job.status)
        ? job
        : await waitForExtractionJob(job.id)
      if (settled.status === 'failed' || settled.status === 'cancelled') {
        throw new Error(settled.error || '抽取失败，请稍后重试。')
      }
      return settled
    },
    onSuccess: async () => {
      await invalidate()
      onExtracted()
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (title.trim() && content.trim()) createMutation.mutate()
  }

  if (spaceQuery.isPending) return <LoadingState text="正在加载文档..." />

  const documents = spaceQuery.data?.documents ?? []

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Card className="p-5 xl:col-span-3">
        <h3 className="text-sm font-semibold text-ink">源文档</h3>
        <p className="mt-1 text-[13px] text-ink-muted">
          抽取只会读取文档内容，不会改动你的学习数据。
        </p>

        {documents.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<FileText className="size-5" />}
              title="还没有源文档"
              description="在右侧粘贴或上传课程材料，然后运行 AI 抽取。"
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex items-center justify-between gap-3 rounded-control border border-line p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {document.title}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    v{document.version ?? 1}
                    {document.sourceUrl ? ' · 外部来源' : ' · 手动录入'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={extractMutation.isPending}
                  onClick={() => extractMutation.mutate(document.id)}
                >
                  {extractMutation.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Sparkles />
                  )}
                  抽取知识
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 xl:col-span-2">
        <h3 className="text-sm font-semibold text-ink">新增文档</h3>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="文档标题，如：第 3 章讲义"
            className="h-9 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary"
          />
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="粘贴课程文本内容..."
            rows={7}
            className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-faint focus:border-primary"
          />
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="来源链接（可选）"
            className="h-9 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary"
          />
          {createMutation.isError ? (
            <p className="text-xs text-danger">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : '保存失败'}
            </p>
          ) : null}
          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={createMutation.isPending || !title.trim() || !content.trim()}
          >
            {createMutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Upload />
            )}
            保存文档
          </Button>
        </form>
      </Card>
    </div>
  )
}
