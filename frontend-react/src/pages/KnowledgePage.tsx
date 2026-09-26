import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Library, Plus } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/state'
import { GraphTab } from '@/features/knowledge/GraphTab'
import { MasteryTab } from '@/features/knowledge/MasteryTab'
import { DocumentsTab } from '@/features/knowledge/DocumentsTab'
import { ReviewTab } from '@/features/knowledge/ReviewTab'
import { ImportCourseDialog } from '@/features/knowledge/ImportCourseDialog'
import { getCourseSpace } from '@/services/courseSpaceService'
import {
  getReviewQueue,
  listCourseStates,
} from '@/services/knowledgeStateService'
import { useSnapshot } from '@/features/snapshot/useSnapshot'
import type { Course } from '@/services/courseService'

type Tab = 'graph' | 'mastery' | 'documents' | 'review'
const COURSE_PREF_KEY = 'zeno_kb_course'

export default function KnowledgePage() {
  const snapshotQuery = useSnapshot()
  const [tab, setTab] = useState<Tab>('graph')
  const [importOpen, setImportOpen] = useState(false)

  const courses = useMemo<Course[]>(
    () =>
      (snapshotQuery.data?.data.courses ?? []).filter(
        (course): course is Course => Boolean(course.id && course.name),
      ),
    [snapshotQuery.data?.data.courses],
  )

  const [courseId, setCourseId] = useState<string>('')

  useEffect(() => {
    if (courses.length === 0) {
      setCourseId('')
      return
    }
    const preferred = (() => {
      try {
        return localStorage.getItem(COURSE_PREF_KEY) ?? ''
      } catch {
        return ''
      }
    })()
    setCourseId(
      courses.some((course) => course.id === preferred)
        ? preferred
        : courses[0].id,
    )
  }, [courses])

  useEffect(() => {
    if (courseId) {
      try {
        localStorage.setItem(COURSE_PREF_KEY, courseId)
      } catch {
        // ignore
      }
    }
  }, [courseId])

  const spaceQuery = useQuery({
    queryKey: ['course-space', courseId],
    queryFn: () => getCourseSpace(courseId),
    enabled: Boolean(courseId) && tab === 'graph',
  })
  const statesQuery = useQuery({
    queryKey: ['knowledge-states', courseId],
    queryFn: () => listCourseStates(courseId),
    enabled: Boolean(courseId) && tab === 'mastery',
  })
  const queueQuery = useQuery({
    queryKey: ['review-queue', courseId],
    queryFn: () => getReviewQueue(courseId),
    enabled: Boolean(courseId) && tab === 'mastery',
  })

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'graph', label: '图谱' },
    { id: 'mastery', label: '掌握度' },
    { id: 'documents', label: '文档' },
    { id: 'review', label: '审核' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Zeno Knowledge"
        title="知识库"
        description="课程由你导入；知识图谱来自文档抽取与人审，全部只读可追溯。"
        actions={
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <Plus />
            导入课程
          </Button>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          icon={<Library className="size-5" />}
          title="还没有课程"
          description="先通过教务链接导入或手动创建一门课，再为它构建知识图谱。"
          action={
            <Button size="sm" onClick={() => setImportOpen(true)}>
              <BookOpen />
              立即导入
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[13px] text-ink-muted">当前课程</label>
            <select
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              className="h-9 min-w-56 rounded-control border border-line bg-surface px-2.5 text-sm text-ink outline-none focus:border-primary"
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-1 border-b border-line">
            {tabs.map((item) => {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`-mb-px border-b px-4 py-2 text-[13px] transition-colors ${
                    tab === item.id
                      ? 'border-primary text-ink'
                      : 'border-transparent text-ink-muted'
                  } hover:text-ink`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          {tab === 'graph' ? (
            <GraphTab
              space={spaceQuery.data}
              isLoading={spaceQuery.isPending}
              isError={spaceQuery.isError}
              courseId={courseId}
              onChanged={() => void spaceQuery.refetch()}
            />
          ) : null}
          {tab === 'mastery' ? (
            <MasteryTab
              states={statesQuery.data?.states}
              queue={queueQuery.data}
              isLoading={statesQuery.isPending || queueQuery.isPending}
              isError={statesQuery.isError || queueQuery.isError}
            />
          ) : null}
          {tab === 'documents' ? (
            <DocumentsTab
              courseId={courseId}
              onExtracted={() => setTab('review')}
            />
          ) : null}
          {tab === 'review' ? <ReviewTab courseId={courseId} /> : null}
        </>
      )}

      <ImportCourseDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(id) => {
          setCourseId(id)
          setTab('graph')
        }}
      />
    </div>
  )
}
