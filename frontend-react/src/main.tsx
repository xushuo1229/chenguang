import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { AppProviders } from './app/providers'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/globals.css'

const RELOAD_FLAG = 'zeno_sw_reloaded'

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
  // navigation. Reload once so API calls cannot be served stale mock data.
  const controlled = Boolean(navigator.serviceWorker.controller)
  if (
    (removed || controlled) &&
    !sessionStorage.getItem(RELOAD_FLAG)
  ) {
    sessionStorage.setItem(RELOAD_FLAG, '1')
    window.location.reload()
    return true
  }
  sessionStorage.removeItem(RELOAD_FLAG)
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