import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { AppProviders } from './app/providers'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/globals.css'

const RELOAD_COUNT_KEY = 'zeno_sw_reloads'
const MAX_CLEAN_RELOADS = 2

// Dev/real builds must never be intercepted by a leftover MSW service worker
// registered by an earlier same-origin mock preview on localhost:5174.
async function unregisterStaleWorkers(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  let removed = false
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(
    registrations.map(async (registration) => {
      if (await registration.unregister()) removed = true
    }),
  )
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }
  return removed
}

async function enableMocking(): Promise<boolean> {
  if (import.meta.env.VITE_MOCK_ENABLED === 'true') {
    const { worker } = await import('./mocks/browser')
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: '/mockServiceWorker.js' },
    })
    return false
  }

  const removed = await unregisterStaleWorkers()
  // An unregistered worker can still control the current page until the next
  // navigation, and some browsers need more than one reload before releasing
  // it. Reload a bounded number of times so API calls never serve stale mock
  // data without risking an infinite reload loop.
  const controlled = Boolean(navigator.serviceWorker.controller)
  const attempts = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? '0')
  if ((removed || controlled) && attempts < MAX_CLEAN_RELOADS) {
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(attempts + 1))
    window.location.reload()
    return true
  }
  sessionStorage.removeItem(RELOAD_COUNT_KEY)
  return false
}

void enableMocking().then((reloading) => {
  if (reloading) return
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppProviders>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AppProviders>
    </React.StrictMode>,
  )
})
