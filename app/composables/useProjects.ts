export type ProjectStatus = 'planning' | 'designing' | 'developing' | 'done'

export interface ProjectRow {
  id: string
  name: string
  status: ProjectStatus
  updated_at: string
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: '기획',
  designing: '디자인',
  developing: '개발',
  done: '완료',
}

/** 프로젝트 목록 (RLS 로 멤버만 읽힘) */
export function useProjects() {
  const supabase = useSupabaseClient()
  return useAsyncData('projects', async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, status, updated_at')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as ProjectRow[]
  })
}

/** 올해는 n분/n시간/n일 전, 지난해는 2025년 12월 18일 (AUTO-MAKE 12.7) */
export function relativeTime(iso: string): string {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return '방금'
  if (diff < 3600) return Math.floor(diff / 60) + '분 전'
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전'
  if (d.getFullYear() === new Date().getFullYear()) {
    const days = Math.floor(diff / 86400)
    if (days < 7) return days + '일 전'
    if (days < 30) return Math.floor(days / 7) + '주 전'
    return Math.floor(days / 30) + '개월 전'
  }
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}
