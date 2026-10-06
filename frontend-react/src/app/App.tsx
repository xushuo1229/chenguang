import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import LoginPage from '../pages/LoginPage'
import NotFoundPage from '../pages/NotFoundPage'
import AdminPage from '../pages/AdminPage'
import KnowledgePage from '../pages/KnowledgePage'
import AnalyticsPage from '../pages/AnalyticsPage'
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '../pages/AccountPages'
import { ProtectedRoute } from './ProtectedRoute'
import { AuthLayout } from '../layouts/AuthLayout'
import { AppShellLayout } from '../layouts/AppShellLayout'

const AgentWorkspace = lazy(() => import('@/features/agent/AgentWorkspace'))
const WorkspacePage = lazy(() => import('@/features/workspace/WorkspacePage'))
const CoursesPage = lazy(() => import('@/features/learning/CoursesPage'))
const CourseDetailPage = lazy(() => import('@/features/learning/CourseDetailPage'))
const PlansPage = lazy(() => import('@/features/learning/PlansPage'))
const GoalsPage = lazy(() => import('@/features/growth/GoalsPage'))
const MemoryPage = lazy(() => import('@/features/growth/MemoryPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))

function PageFallback() {
  return (
    <div className="flex justify-center py-16 text-ink-muted">
      <Loader2 className="size-5 animate-spin" />
    </div>
  )
}

function ShellRoute({
  page,
  fullBleed = false,
}: {
  page: React.ReactNode
  fullBleed?: boolean
}) {
  return (
    <ProtectedRoute>
      <AppShellLayout fullBleed={fullBleed}>
        <Suspense fallback={<PageFallback />}>{page}</Suspense>
      </AppShellLayout>
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
        path="/forgot-password"
        element={
          <AuthLayout>
            <ForgotPasswordPage />
          </AuthLayout>
        }
      />
      <Route
        path="/reset-password"
        element={
          <AuthLayout>
            <ResetPasswordPage />
          </AuthLayout>
        }
      />
      <Route
        path="/verify-email"
        element={
          <AuthLayout>
            <VerifyEmailPage />
          </AuthLayout>
        }
      />

      <Route path="/agent" element={<ShellRoute fullBleed page={<AgentWorkspace />} />} />
      <Route
        path="/agent/:conversationId"
        element={<ShellRoute fullBleed page={<AgentWorkspace />} />}
      />
      <Route path="/workspace" element={<ShellRoute page={<WorkspacePage />} />} />
      <Route path="/learning/courses" element={<ShellRoute page={<CoursesPage />} />} />
      <Route
        path="/learning/courses/:id"
        element={<ShellRoute page={<CourseDetailPage />} />}
      />
      <Route path="/learning/plans" element={<ShellRoute page={<PlansPage />} />} />
      <Route
        path="/learning/knowledge"
        element={<ShellRoute page={<KnowledgePage />} />}
      />
      <Route path="/growth/goals" element={<ShellRoute page={<GoalsPage />} />} />
      <Route
        path="/growth/analytics"
        element={<ShellRoute page={<AnalyticsPage />} />}
      />
      <Route path="/growth/memory" element={<ShellRoute page={<MemoryPage />} />} />
      <Route path="/settings" element={<ShellRoute page={<SettingsPage />} />} />
      <Route path="/settings/:section" element={<ShellRoute page={<SettingsPage />} />} />
      <Route path="/admin" element={<ShellRoute page={<AdminPage />} />} />

      <Route path="/dashboard" element={<Navigate to="/workspace" replace />} />
      <Route
        path="/knowledge"
        element={<Navigate to="/learning/knowledge" replace />}
      />
      <Route
        path="/analytics"
        element={<Navigate to="/growth/analytics" replace />}
      />
      <Route path="/" element={<Navigate to="/agent" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
