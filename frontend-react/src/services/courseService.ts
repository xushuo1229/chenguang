import { request } from './apiClient'

export type Course = {
  id: string
  name: string
  slots?: Array<{ weekday?: number; period?: number }>
}

export type ParsedCourse = {
  name: string
  slots: Array<{ weekday: number; period: number }>
}

export async function importCoursesFromUrl(url: string): Promise<{
  courses: ParsedCourse[]
  source: string
}> {
  return request('/course/import', {
    method: 'POST',
    body: { url },
  })
}
