import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { AppProviders } from './app/providers'
import './styles/globals.css'

async function unregisterStaleWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(
    registrations.map((registration) => registration.unregister()),
  )
}

async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_MOCK_ENABLED === 'true') {
    const { worker } = await import('./mocks/browser')
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: '/mockServiceWorker.js' },
    })
    return
  }
  await unregisterStaleWorkers()
}

enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </React.StrictMode>,
  )
})