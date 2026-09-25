import { useMemo } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { KbNode, KbRelation } from '@/services/courseSpaceService'

const kindColor: Record<string, string> = {
  concept: '#2563EB',
  definition: '#7C3AED',
  principle: '#0891B2',
  procedure: '#059669',
  formula: '#D97706',
  example: '#DB2777',
  skill: '#DC2626',
}

// Deterministic circular layout — no extra layout-engine dependency.
function layoutPositions(count: number, index: number) {
  const radius = Math.max(180, count * 34)
  const angle = (index / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2
  return {
    x: radius + radius * Math.cos(angle) - 90,
    y: radius + radius * Math.sin(angle) - 28,
  }
}

export function KnowledgeGraphView({
  nodes,
  relations,
  onSelectNode,
}: {
  nodes: KbNode[]
  relations: KbRelation[]
  onSelectNode: (nodeId: string) => void
}) {
  const flowNodes = useMemo<Node[]>(
    () =>
      nodes.map((node, index) => {
        const position = layoutPositions(nodes.length, index)
        return {
          id: node.id,
          position,
          data: { label: node.title },
          style: {
            borderColor: kindColor[node.kind] ?? '#64748B',
            borderWidth: 1.5,
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            width: 180,
            background: 'var(--surface)',
            color: 'var(--ink)',
          },
        }
      }),
    [nodes],
  )

  const flowEdges = useMemo<Edge[]>(
    () =>
      relations
        .filter(
          (relation) =>
            nodes.some((node) => node.id === relation.sourceNodeId) &&
            nodes.some((node) => node.id === relation.targetNodeId),
        )
        .map((relation) => ({
          id: relation.id,
          source: relation.sourceNodeId,
          target: relation.targetNodeId,
          label: relation.relationType,
          labelStyle: { fontSize: 10, fill: 'var(--ink-muted)' },
          style: { stroke: 'var(--border-strong)' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'var(--border-strong)',
          },
        })),
    [relations, nodes],
  )

  return (
    <div className="h-[560px] w-full overflow-hidden rounded-card border border-line bg-surface-subtle">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_event, node) => onSelectNode(node.id)}
      >
        <Background color="var(--border)" gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
