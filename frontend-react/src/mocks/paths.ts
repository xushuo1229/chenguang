// Common path prefix for all mocked endpoints, aligned with apiClient.
export const API_PREFIX = (
  import.meta.env.VITE_API_BASE_URL || '/api'
).replace(/\/+$/, '')
