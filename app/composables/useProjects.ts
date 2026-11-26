export type ProjectStatus = 'planning' | 'designing' | 'developing' | 'done'

export interface ProjectRow {
  id: string
  name: string
  status: ProjectStatus
  updated_at: string
  /** 홈 카드 썸네일로 정한 화면(프레임 우클릭 'Set as thumbnail'). 없으면 첫 페이지의 첫 화면 */
  cover_screen_id?: string | null
}

/** 진행 상태 이름(영어 원문 — 화면에서는 statusLabel() 로 지금 언어로) */
export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning',
  designing: 'Design',
  developing: 'Development',
  done: 'Done',
}
export const statusLabel = (s: ProjectStatus) => tr(STATUS_LABEL[s])

/** 프로젝트 목록 (RLS 로 멤버만 읽힘) */
export function useProjects() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData('projects', async () => {
    if (preview) return PREVIEW_PROJECTS
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, status, updated_at')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as ProjectRow[]
  })
}

/** 지난 시각: 영어 'just now · 5 min ago · 3 hours ago · 2 days ago · Dec 18, 2025' / 한국어 '방금 · n분 전 … · 2025년 12월 18일' (AUTO-MAKE 12.7) */
export function relativeTime(iso: string): string {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  const ko = isKo()
  const ago = (n: number, en: string, k: string) => (ko ? `${n}${k} 전` : `${n} ${en}${n === 1 ? '' : 's'} ago`)
  if (diff < 60) return ko ? '방금' : 'Just now'
  if (diff < 3600) return ago(Math.floor(diff / 60), 'min', '분').replace('mins', 'min')
  if (diff < 86400) return ago(Math.floor(diff / 3600), 'hour', '시간')
  if (d.getFullYear() === new Date().getFullYear()) {
    const days = Math.floor(diff / 86400)
    if (days < 7) return ago(days, 'day', '일')
    if (days < 30) return ago(Math.floor(days / 7), 'week', '주')
    return ago(Math.floor(days / 30), 'month', '개월')
  }
  return ko ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일` : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
