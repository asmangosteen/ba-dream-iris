/**
 * 앱 안 알림(상단 종 · 알림 목록, PRD/16 12 · G). 알림은 DB 함수가 만들고(초대 요청 · 승인 · 역할 바뀜 …),
 * 화면은 내 것만 읽고 읽음 처리만 해요. 실시간 반영은 2단계 — 그 전에는 창을 다시 보거나 1분마다 새로 읽어요.
 */
export interface NotificationRow {
  id: string
  project_id: string | null
  kind: string
  target_type: string | null
  target_id: string | null
  actor_id: string | null
  payload: Record<string, unknown>
  count: number
  read_at: string | null
  created_at: string
}

const now = Date.now()
const PREVIEW: NotificationRow[] = [
  { id: 'pv-n1', project_id: 'preview-1', kind: 'invite_request', target_type: 'invite', target_id: 'pv-inv-1', actor_id: 'preview-2', payload: { email: 'jung.ux@ba-dream.com' }, count: 1, read_at: null, created_at: new Date(now - 2 * 60_000).toISOString() },
  { id: 'pv-n2', project_id: 'preview-1', kind: 'join_request', target_type: 'invite', target_id: 'pv-inv-2', actor_id: null, payload: { email: 'han.qa@ba-dream.com' }, count: 1, read_at: null, created_at: new Date(now - 6 * 3_600_000).toISOString() },
  { id: 'pv-n4', project_id: 'preview-1', kind: 'mention', target_type: 'comment', target_id: 'pv-c1', actor_id: 'preview-2', payload: { no: 1, excerpt: '@미리보기 카드 순서가 정책(가격 높은 순)이랑 맞는지 봐 주세요' }, count: 1, read_at: null, created_at: new Date(now - 60_000).toISOString() },
  { id: 'pv-n3', project_id: 'preview-1', kind: 'role_changed', target_type: 'project', target_id: 'preview-1', actor_id: 'preview-2', payload: { role: 'designer_editor' }, count: 1, read_at: new Date(now - 86_400_000).toISOString(), created_at: new Date(now - 26 * 3_600_000).toISOString() },
]

export function useNotifications() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const user = useSupabaseUser()
  const pv = useState<NotificationRow[]>('pv-notes', () => PREVIEW.map((x) => ({ ...x })))
  const list = useAsyncData('notifications', async () => {
    if (preview) return pv.value
    if (!user.value) return []
    const { data, error } = await supabase.from('notifications').select('id, project_id, kind, target_type, target_id, actor_id, payload, count, read_at, created_at').order('created_at', { ascending: false }).limit(50)
    if (error) return [] // 마이그레이션 전 DB: 알림 테이블이 없으면 빈 목록
    return (data ?? []) as NotificationRow[]
  }, { server: false })
  const unread = computed(() => (list.data.value ?? []).filter((n) => !n.read_at).length)
  // 실시간: 내 알림이 생기면 바로(2단계). 실패하면 창으로 돌아올 때 · 1분마다 새로 읽기로 충분해요
  let ch: ReturnType<typeof supabase.channel> | null = null
  onMounted(() => {
    const uid = (user.value as { sub?: string; id?: string } | null)?.sub ?? (user.value as { id?: string } | null)?.id
    if (preview || !uid) return
    ch = supabase.channel(`iris-notes-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `member_id=eq.${uid}` }, (msg) => {
        const row = msg.new as NotificationRow
        if (!(list.data.value ?? []).some((x) => x.id === row.id)) list.data.value = [row, ...(list.data.value ?? [])]
      })
      .subscribe()
  })
  onBeforeUnmount(() => { if (ch) supabase.removeChannel(ch) })

  async function markRead(ids: string[]) {
    if (!ids.length) return
    const at = new Date().toISOString()
    for (const n of list.data.value ?? []) if (ids.includes(n.id) && !n.read_at) n.read_at = at
    if (preview) return
    await supabase.from('notifications').update({ read_at: at }).in('id', ids)
  }
  const markAllRead = () => markRead((list.data.value ?? []).filter((n) => !n.read_at).map((n) => n.id))
  return { list, unread, markRead, markAllRead }
}
