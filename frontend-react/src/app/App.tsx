import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import LoginPage from '../pages/LoginPage'
import DashboardPage from '../pages/DashboardPage'
import AgentPage from '../pages/AgentPage'
import KnowledgePage from '../pages/KnowledgePage'
import { ProtectedRoute } from './ProtectedRoute'
import { AuthLayout } from '../layouts/AuthLayout'
import { WorkspaceLayout } from '../layouts/WorkspaceLayout'

const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage'))

function AnalyticsRoute() {
  return (
    <ProtectedRoute>
      <WorkspaceLayout>
        <Suspense
          fallback={
            <div className="mt-10 flex justify-center text-ink-muted">
              <Loader2 className="size-5 animate-spin" />
            </div>
          }
        >
          <AnalyticsPage />
        </Suspense>
      </WorkspaceLayout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <AuthLayout>
            <LoginPage />
          </AuthLayout>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <WorkspaceLayout>
              <DashboardPage />
            </WorkspaceLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/knowledge"
        element={
          <ProtectedRoute>
            <WorkspaceLayout>
              <KnowledgePage />
            </WorkspaceLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/analytics" element={<AnalyticsRoute />} />
      <Route
        path="/agent"
        element={
          <ProtectedRoute>
            <WorkspaceLayout fullBleed>
              <AgentPage />
            </WorkspaceLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}