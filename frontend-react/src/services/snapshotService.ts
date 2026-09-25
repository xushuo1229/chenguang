import { request } from './apiClient'
import type { ChenguangData } from './analyticsService'

export type SnapshotEnvelope = {
  data: ChenguangData
  revision?: number
  updatedAt?: string
  deviceId?: string
}

export async function fetchSnapshot(): Promise<SnapshotEnvelope> {
  return request<SnapshotEnvelope>('/data')
}

export async function putSnapshot(
  data: ChenguangData,
  baseRevision: number | undefined,
  deviceId: string,
): Promise<SnapshotEnvelope> {
  return request<SnapshotEnvelope>('/data', {
    method: 'PUT',
    body: { data, baseRevision, deviceId },
  })
}
