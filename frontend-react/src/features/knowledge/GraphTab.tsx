import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@tremor/react'
import { List, Network, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, LoadingState } from '@/components/ui/state'
import { KnowledgeGraphView } from './KnowledgeGraphView'
import { NodeDetailDrawer } from './NodeDetailDrawer'
import { CreateNodeDialog } from './CreateNodeDialog'
import {
  createRelation,
  type CourseSpace,
} from '@/services/courseSpaceService'

type ViewMode = 'graph' | 'list'

const kindTone: Record<string, 'neutral' | 'info' | 'warning' | 'success'> = {
  concept: 'info',
  definition: 'neutral',
  principle: 'info',
  procedure: 'success',
  formula: 'warning',
  example: 'warning',
  skill: 'neutral',
}

export function GraphTab({
  space,
  isLoading,
  isError,
  courseId,
  onChanged,
}: {
  space: CourseSpace | undefined
  isLoading: boolean
  isError: boolean
  courseId: string
  onChanged: () => void
}) {
  const [view, setView] = useState<ViewMode>('graph')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const relationMutation = useMutation({
    mutationFn: createRelation,
    onSuccess: onChanged,
  })

  const filteredNodes = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const nodes = space?.nodes ?? []
    if (!keyword) return nodes
    return nodes.filter(
      (node) =>
        node.title.toLowerCase().includes(keyword) ||
        node.kind.toLowerCase().includes(keyword) ||
        (node.definition ?? '').toLowerCase().includes(keyword),
    )
  }, [space?.nodes, query])

  const selectedNode = selectedId
    ? space?.nodes.find((node) => node.id === selectedId)
    : undefined

  if (isLoading) return <LoadingState text="正在构建知识图谱..." />
  if (isError) {
    return (
      <EmptyState
        icon={<Network className="size-5" />}
        title="图谱加载失败"
        description="请检查网络或稍后重试。"
      />
    )
  }
  if (!space || space.nodes.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Network className="size-5" />}
          title="这门课还没有知识图谱"
          description="上传源文档并通过审核后，抽取的知识点会出现在这里；也可以先手动补入。"
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              手动新建节点
            </Button>
          }
        />
        <CreateNodeDialog
          open={createOpen}
          courseId={courseId}
          onClose={() => setCreateOpen(false)}
          onCreated={onChanged}
        />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索知识点..."
            className="h-9 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary"
          />
        </div>
        <div className="flex rounded-control border border-line p-0.5">
          <Button
            variant="outline"
            size="sm"
            className="mr-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus />
            新建节点
          </Button>
          <Button
            variant={view === 'graph' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('graph')}
          >
            <Network />
            图谱
          </Button>
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('list')}
          >
            <List />
            列表
          </Button>
        </div>
      </div>

      {view === 'graph' ? (
        <KnowledgeGraphView
          nodes={filteredNodes}
          relations={space.relations}
          onSelectNode={setSelectedId}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table className="text-sm">
            <TableHead>
              <TableRow className="bg-surface-muted/50">
                <TableHeaderCell>知识点</TableHeaderCell>
                <TableHeaderCell>类型</TableHeaderCell>
                <TableHeaderCell>置信度</TableHeaderCell>
                <TableHeaderCell>状态</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredNodes.map((node) => (
                <TableRow
                  key={node.id}
                  className="cursor-pointer hover:bg-surface-muted/40"
                  onClick={() => setSelectedId(node.id)}
                >
                  <TableCell className="font-medium text-ink">
                    {node.title}
                  </TableCell>
                  <TableCell>
                    <Badge tone={kindTone[node.kind] ?? 'neutral'}>
                      {node.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-ink-secondary">
                    {node.confidence}
                  </TableCell>
                  <TableCell className="text-ink-secondary">
                    {node.status}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {selectedNode ? (
        <NodeDetailDrawer
          node={selectedNode}
          nodes={space.nodes}
          relations={space.relations}
          evidence={space.evidence}
          onCreateRelation={(input) =>
            relationMutation.mutateAsync({
              sourceNodeId: selectedNode.id,
              ...input,
            })
          }
          onClose={() => setSelectedId(null)}
        />
      ) : null}
      <CreateNodeDialog
        open={createOpen}
        courseId={courseId}
        onClose={() => setCreateOpen(false)}
        onCreated={onChanged}
      />
    </div>
  )
}
