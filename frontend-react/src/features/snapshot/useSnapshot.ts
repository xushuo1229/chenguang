import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query'
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

  return useMutation<
    SnapshotEnvelope,
    Error,
    DraftProducer,
    { previous?: SnapshotEnvelope }
  >({
    mutationFn: (produce) => {
      const current = queryClient.getQueryData<SnapshotEnvelope>(snapshotKey)
      if (!current) throw new Error('快照尚未加载，无法写入')
      const nextData = produce(structuredClone(current.data))
      return putSnapshot(nextData, current.revision, getDeviceId())
    },
    onMutate: async (produce) => {
      await queryClient.cancelQueries({ queryKey: snapshotKey })
      const previous = queryClient.getQueryData<SnapshotEnvelope>(snapshotKey)
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
  })
}
