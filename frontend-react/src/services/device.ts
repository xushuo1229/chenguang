const DEVICE_KEY = 'zeno_device_id'

export function getDeviceId(): string {
  let id = ''
  try {
    id = localStorage.getItem(DEVICE_KEY) ?? ''
  } catch {
    id = ''
  }
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `zeno-${Date.now()}-${Math.random().toString(16).slice(2)}`
    try {
      localStorage.setItem(DEVICE_KEY, id)
    } catch {
      // storage unavailable: id is per-session
    }
  }
  return id
}
