import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import { useRef } from 'react'
import {
  fetchSnapshot,
  putSnapshot,
  type SnapshotEnvelope,
} from '@/services/snapshotService'
import type { ChenguangData } from '@/services/analyticsService'
import { getDeviceId } from '@/services/device'

export const snapshotKey: QueryKey = ['zeno', 'snapshot']

export function useSnapshot() {
  return useQuery<SnapshotEnvelope>({
    queryKey: snapshotKey,
    queryFn: fetchSnapshot,
  })
}

type DraftProducer = (draft: ChenguangData) => ChenguangData

export function useUpdateSnapshot() {
  const queryClient = useQueryClient()
  const baseRef = useRef<SnapshotEnvelope | null>(null)

  return useMutation<
    SnapshotEnvelope,
    Error,
    DraftProducer,
    { previous?: SnapshotEnvelope }
  >({
    mutationFn: (produce) => {
      const base = baseRef.current
      if (!base) throw new Error('快照尚未加载，无法写入')
      const nextData = produce(structuredClone(base.data))
      return putSnapshot(nextData, base.revision, getDeviceId())
    },
    onMutate: async (produce) => {
      await queryClient.cancelQueries({ queryKey: snapshotKey })
      const previous = queryClient.getQueryData<SnapshotEnvelope>(snapshotKey)
      baseRef.current = previous ?? null
      if (previous) {
        queryClient.setQueryData<SnapshotEnvelope>(snapshotKey, {
          ...previous,
          data: produce(structuredClone(previous.data)),
        })
      }
      return { previous }
    },
    onError: (_error, _produce, context) => {
      if (context?.previous) {
        queryClient.setQueryData(snapshotKey, context.previous)
      }
    },
    onSuccess: (envelope) => {
      queryClient.setQueryData(snapshotKey, envelope)
    },
    onSettled: () => {
      baseRef.current = null
    },
  })
}
