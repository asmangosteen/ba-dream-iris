import type { CommentRow } from '~~/shared/types/database'

/**
 * 코멘트(2단계, PRD/17 3장 2): 스레드 첫 글이 핀 자리를 가져요. 화면에 단 핀은 화면 기준 좌표(화면을 옮겨도 따라가요).
 * 모든 역할이 쓸 수 있어요(보기 전용도). 다른 사람 코멘트는 실시간으로 들어와요.
 */
export type { CommentRow }
export interface Thread { root: CommentRow; replies: CommentRow[]; last: CommentRow; unread: boolean }

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString()
function previewComments(): CommentRow[] {
  const base = { project_id: 'preview-1', page_id: null as string | null, mentions: [] as string[], resolved_at: null, resolved_by: null, edited_at: null }
  return [
    { ...base, id: 'pv-c1', screen_id: null, thread_id: null, no: 1, x: 120, y: 220, author_id: 'preview-2', body: '@미리보기 카드 순서가 정책(가격 높은 순)이랑 맞는지 봐 주세요', mentions: ['preview-me'], created_at: iso(120) },
    { ...base, id: 'pv-c2', screen_id: null, thread_id: 'pv-c1', no: null, x: null, y: null, author_id: 'preview-me', body: '맞아요. 품절 차량은 맨 아래로 내려 주세요', created_at: iso(60) },
    { ...base, id: 'pv-c3', screen_id: null, thread_id: null, no: 2, x: 60, y: 520, author_id: 'preview-3', body: '버튼 높이 48 → 52 로 바꾸면 개발 쪽 공용 버튼이랑 맞아요', created_at: iso(1440) },
  ]
}

export function useComments(projectId: string) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const user = useSupabaseUser()
  const myId = computed(() => (preview ? 'preview-me' : ((user.value as { sub?: string; id?: string } | null)?.sub ?? (user.value as { id?: string } | null)?.id ?? null)))
  const pv = useState<CommentRow[]>(`pv-comments-${projectId}`, () => [])
  const reads = useState<Record<string, string>>(`comment-reads-${projectId}`, () => ({}))

  const list = useAsyncData(`comments-${projectId}`, async () => {
    if (preview) {
      if (!pv.value.length) {
        // 미리보기: 첫 화면에 예시 핀
        const sid = (useNuxtApp().payload.data?.[`screens-${projectId}`] as { id: string }[] | undefined)?.[0]?.id ?? null
        pv.value = previewComments().map((c) => ({ ...c, screen_id: c.thread_id ? null : sid }))
        for (const c of pv.value) if (c.thread_id) c.screen_id = pv.value.find((r) => r.id === c.thread_id)?.screen_id ?? null
      }
      return pv.value
    }
    const [c, r] = await Promise.all([
      supabase.from('comments').select('*').eq('project_id', projectId).order('created_at'),
      supabase.from('comment_reads').select('thread_id, seen_at'),
    ])
    if (c.error) return [] as CommentRow[] // 마이그레이션 전 DB
    reads.value = Object.fromEntries(((r.data ?? []) as { thread_id: string; seen_at: string }[]).map((x) => [x.thread_id, x.seen_at]))
    return (c.data ?? []) as CommentRow[]
  }, { server: false })

  const threads = computed<Thread[]>(() => {
    const all = list.data.value ?? []
    const roots = all.filter((c) => !c.thread_id)
    return roots.map((root) => {
      const replies = all.filter((c) => c.thread_id === root.id)
      const last = replies[replies.length - 1] ?? root
      const seen = reads.value[root.id]
      const unread = last.author_id !== myId.value && (!seen || seen < last.created_at)
      return { root, replies, last, unread }
    }).sort((a, b) => (b.last.created_at > a.last.created_at ? 1 : -1))
  })

  // 실시간: 이 프로젝트 코멘트가 바뀌면 바로
  let ch: ReturnType<typeof supabase.channel> | null = null
  onMounted(() => {
    if (preview) return
    ch = supabase.channel(`iris-comments-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `project_id=eq.${projectId}` }, (msg) => {
        const arr = [...(list.data.value ?? [])]
        if (msg.eventType === 'DELETE') { const id = (msg.old as { id?: string }).id; list.data.value = arr.filter((c) => c.id !== id && c.thread_id !== id); return }
        const row = msg.new as CommentRow
        const i = arr.findIndex((c) => c.id === row.id)
        if (i >= 0) arr[i] = row
        else arr.push(row)
        list.data.value = arr
      })
      .subscribe()
  })
  onBeforeUnmount(() => { if (ch) supabase.removeChannel(ch) })

  function put(row: CommentRow) {
    const arr = [...(list.data.value ?? [])]
    const i = arr.findIndex((c) => c.id === row.id)
    if (i >= 0) arr[i] = row
    else arr.push(row)
    list.data.value = arr
    if (preview) pv.value = arr
  }

  /** 새 스레드(핀) */
  async function create(at: { pageId: string | null; screenId: string | null; x: number; y: number }, body: string, mentions: string[]) {
    if (preview) {
      const no = Math.max(0, ...(list.data.value ?? []).map((c) => c.no ?? 0)) + 1
      const row: CommentRow = { id: 'pv-' + Math.random().toString(36).slice(2, 8), project_id: projectId, page_id: at.pageId, screen_id: at.screenId, thread_id: null, no, x: at.x, y: at.y, author_id: 'preview-me', body, mentions, resolved_at: null, resolved_by: null, created_at: new Date().toISOString(), edited_at: null }
      put(row)
      return row
    }
    const { data, error } = await supabase.from('comments').insert({ project_id: projectId, page_id: at.pageId, screen_id: at.screenId, x: at.x, y: at.y, body, mentions }).select('*').single()
    if (error) throw error
    put(data as CommentRow)
    return data as CommentRow
  }
  async function reply(root: CommentRow, body: string, mentions: string[]) {
    if (preview) {
      put({ ...root, id: 'pv-' + Math.random().toString(36).slice(2, 8), thread_id: root.id, no: null, x: null, y: null, author_id: 'preview-me', body, mentions, resolved_at: null, resolved_by: null, created_at: new Date().toISOString(), edited_at: null })
      return
    }
    const { data, error } = await supabase.from('comments').insert({ project_id: projectId, thread_id: root.id, body, mentions }).select('*').single()
    if (error) throw error
    put(data as CommentRow)
    markRead(root.id)
  }
  async function resolve(root: CommentRow, done: boolean) {
    const prev = { ...root }
    put({ ...root, resolved_at: done ? new Date().toISOString() : null, resolved_by: done ? myId.value : null })
    if (preview) return
    const { error } = await supabase.rpc('resolve_comment', { cid: root.id, done })
    if (error) { put(prev); throw error }
  }
  async function remove(c: CommentRow) {
    const arr = (list.data.value ?? []).filter((x) => x.id !== c.id && x.thread_id !== c.id)
    const prev = list.data.value
    list.data.value = arr
    if (preview) { pv.value = arr; return }
    const { error } = await supabase.from('comments').delete().eq('id', c.id)
    if (error) { list.data.value = prev; throw error }
  }
  async function edit(c: CommentRow, body: string, mentions: string[]) {
    const prev = { ...c }
    put({ ...c, body, mentions, edited_at: new Date().toISOString() })
    if (preview) return
    const { error } = await supabase.from('comments').update({ body, mentions, edited_at: new Date().toISOString() }).eq('id', c.id)
    if (error) { put(prev); throw error }
  }
  /** 핀을 다른 자리로(쓴 사람만) */
  async function movePin(root: CommentRow, at: { screenId: string | null; x: number; y: number }) {
    const prev = { ...root }
    put({ ...root, screen_id: at.screenId, x: at.x, y: at.y })
    if (preview) return
    const { error } = await supabase.from('comments').update({ screen_id: at.screenId, x: at.x, y: at.y }).eq('id', root.id)
    if (error) { put(prev); throw error }
  }
  function markRead(threadId: string) {
    const at = new Date().toISOString()
    reads.value = { ...reads.value, [threadId]: at }
    if (preview || !myId.value) return
    supabase.from('comment_reads').upsert({ member_id: myId.value, thread_id: threadId, seen_at: at }).then(() => undefined, () => undefined)
  }

  return { list, threads, myId, create, reply, resolve, remove, edit, movePin, markRead }
}

/** 글 속 @이름 → 멤버 id(글에 아직 남아 있는 것만) */
export function mentionIds(body: string, picked: { id: string; name: string }[]) {
  return [...new Set(picked.filter((m) => body.includes('@' + m.name)).map((m) => m.id))]
}
