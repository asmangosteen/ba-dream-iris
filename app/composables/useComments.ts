import type { CommentRow } from '~~/shared/types/database'

/**
 * 코멘트(2단계, PRD/17 3장 2): 스레드 첫 글이 핀 자리를 가져요. 화면에 단 핀은 화면 기준 좌표(화면을 옮겨도 따라가요).
 * 모든 역할이 쓸 수 있어요(보기 전용도). 다른 사람 코멘트는 실시간으로 들어와요.
 */
export type { CommentRow }
/** 영역 코멘트 네모(핀과 같은 기준 좌표) */
/** 읽지 않음으로 표시한 스레드의 '읽은 시각' */
const UNREAD_AT = '1970-01-01T00:00:00.000Z'
export interface CommentArea { x: number; y: number; w: number; h: number }
/** 핀 자리: 화면(프레임) · 캔버스 섹션 · 프레임 레이어 · 캔버스 중 하나를 기준으로 */
export interface CommentAt { pageId: string | null; screenId: string | null; layerId?: string | null; x: number; y: number; area?: CommentArea | null }
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

  /** 문서 댓글까지 모든 스레드 */
  const allThreads = computed<Thread[]>(() => {
    const all = list.data.value ?? []
    const roots = all.filter((c) => !c.thread_id)
    return roots.map((root) => {
      const replies = all.filter((c) => c.thread_id === root.id)
      const last = replies[replies.length - 1] ?? root
      const seen = reads.value[root.id]
      // '읽지 않음으로 표시'는 읽은 시각을 맨 처음(UNREAD_AT)으로 — 내가 마지막에 쓴 스레드도 다시 새 글로 보여요
      const unread = !!seen?.startsWith('1970-01-01') || (last.author_id !== myId.value && (!seen || seen < last.created_at))
      return { root, replies, last, unread }
    }).sort((a, b) => (b.last.created_at > a.last.created_at ? 1 : -1))
  })
  /** 캔버스 · 코멘트 목록용: 화면 · 캔버스에 붙지 않은 문서 댓글(게시판 · 문서 옆 메모만)은 빼요 */
  const threads = computed<Thread[]>(() => allThreads.value.filter((t) => !(t.root.document_id && !t.root.screen_id && !t.root.page_id)))
  /** 한 문서의 댓글(문서 옆 메모 + 아래 게시판) */
  const docThreads = (docId: string) => allThreads.value.filter((t) => t.root.document_id === docId)

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
      // 지우기 신호는 거를 수 없어서(Supabase) 따로 받아요 — 지운 줄의 id 만 오니 내 목록에 있을 때만 빼요
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments' }, (msg) => {
        const id = (msg.old as { id?: string }).id
        const arr = list.data.value ?? []
        if (id && arr.some((c) => c.id === id || c.thread_id === id)) list.data.value = arr.filter((c) => c.id !== id && c.thread_id !== id)
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
  /** DB 가 코멘트 새 칸(영역 · 레이어)보다 뒤처져 있어 영역 없이 남겼을 때 true */
  const dbBehind = ref(false)
  async function create(at: CommentAt, body: string, mentions: string[], attachments: string[] = []) {
    if (preview) {
      const no = Math.max(0, ...(list.data.value ?? []).map((c) => c.no ?? 0)) + 1
      const row: CommentRow = { id: 'pv-' + Math.random().toString(36).slice(2, 8), project_id: projectId, page_id: at.pageId, screen_id: at.screenId, layer_id: at.layerId ?? null, area: at.area ?? null, thread_id: null, no, x: at.x, y: at.y, author_id: 'preview-me', body, mentions, attachments, resolved_at: null, resolved_by: null, created_at: new Date().toISOString(), edited_at: null }
      put(row)
      return row
    }
    // 이미지가 있을 때만 attachments 를 보내요(마이그레이션 전 DB 에서도 글만 쓰기는 되게)
    const base = { project_id: projectId, page_id: at.pageId, screen_id: at.screenId, x: at.x, y: at.y, body, mentions, ...(attachments.length ? { attachments } : {}) }
    let { data, error } = await supabase.from('comments').insert({ ...base, ...(at.layerId ? { layer_id: at.layerId } : {}), ...(at.area ? { area: at.area } : {}) }).select('*').single()
    // DB 에 영역 · 붙는 레이어 칸이 아직 없으면(마이그레이션 20261128000000 전): 그 둘을 빼고 점 코멘트로라도 남겨요 — 화면에는 알림
    if (error?.code === '42703' && (at.area || at.layerId)) {
      ({ data, error } = await supabase.from('comments').insert(base).select('*').single())
      if (!error) dbBehind.value = true
    }
    if (error) throw error
    put(data as CommentRow)
    return data as CommentRow
  }
  /**
   * 문서 댓글(3단계 B안): 자리(블록 · 표 행 · 고른 글)가 있으면 문서 옆 메모, 없으면 아래 게시판.
   * 정책이 연결된 화면이 있으면 그 화면 위에도 같은 스레드가 핀으로 보여요(screenId · x · y)
   */
  async function createDoc(docId: string, anchor: CommentRow['doc_anchor'], body: string, mentions: string[], pin: { screenId: string; pageId: string | null; x: number; y: number } | null = null) {
    const base = { project_id: projectId, document_id: docId, doc_anchor: anchor ?? null, page_id: pin?.pageId ?? null, screen_id: pin?.screenId ?? null, x: pin?.x ?? null, y: pin?.y ?? null, body, mentions }
    if (preview) {
      const no = Math.max(0, ...(list.data.value ?? []).map((c) => c.no ?? 0)) + 1
      const row: CommentRow = { id: 'pv-' + Math.random().toString(36).slice(2, 8), thread_id: null, no, author_id: 'preview-me', attachments: [], resolved_at: null, resolved_by: null, created_at: new Date().toISOString(), edited_at: null, ...base }
      put(row)
      return row
    }
    const { data, error } = await supabase.from('comments').insert(base).select('*').single()
    if (error) throw error
    put(data as CommentRow)
    return data as CommentRow
  }
  async function reply(root: CommentRow, body: string, mentions: string[], attachments: string[] = []) {
    if (preview) {
      put({ ...root, id: 'pv-' + Math.random().toString(36).slice(2, 8), thread_id: root.id, no: null, x: null, y: null, author_id: 'preview-me', body, mentions, attachments, resolved_at: null, resolved_by: null, created_at: new Date().toISOString(), edited_at: null })
      return
    }
    const { data, error } = await supabase.from('comments').insert({ project_id: projectId, thread_id: root.id, body, mentions, ...(root.document_id ? { document_id: root.document_id } : {}), ...(attachments.length ? { attachments } : {}) }).select('*').single()
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
  async function movePin(root: CommentRow, at: { screenId: string | null; layerId?: string | null; x: number; y: number; area?: CommentArea | null }) {
    const prev = { ...root }
    put({ ...root, screen_id: at.screenId, layer_id: at.layerId ?? null, x: at.x, y: at.y, area: at.area ?? null })
    // 답글도 같은 곳(화면)으로 — 목록 · 실시간이 같은 자리로 보이게
    for (const c of list.data.value ?? []) if (c.thread_id === root.id) put({ ...c, screen_id: at.screenId })
    if (preview) return
    const { error } = await supabase.from('comments').update({ screen_id: at.screenId, x: at.x, y: at.y, ...(at.layerId || root.layer_id ? { layer_id: at.layerId ?? null } : {}), ...(at.area || root.area ? { area: at.area ?? null } : {}) }).eq('id', root.id)
    if (error) { put(prev); throw error }
  }
  /** 이모지 반응 넣기 · 빼기(내가 단 건 다시 누르면 빠져요) — 바로 보이고, 실패하면 되돌려요 */
  async function react(c: CommentRow, emoji: string) {
    const me = myId.value
    if (!me) return
    const prev = { ...c }
    const cur = { ...(c.reactions ?? {}) }
    const ids = cur[emoji] ?? []
    const next = ids.includes(me) ? ids.filter((x) => x !== me) : [...ids, me]
    if (next.length) cur[emoji] = next; else delete cur[emoji]
    put({ ...c, reactions: cur })
    if (preview) return
    const { data, error } = await supabase.rpc('toggle_reaction', { cid: c.id, emo: emoji })
    if (error) { put(prev); throw error }
    if (data) put({ ...(list.data.value ?? []).find((x) => x.id === c.id) ?? c, reactions: data as Record<string, string[]> })
  }
  /** 읽지 않음으로 표시(스레드 ⋯ — 피그마와 같아요) */
  function markUnread(threadId: string) {
    reads.value = { ...reads.value, [threadId]: UNREAD_AT }
    if (preview || !myId.value) return
    supabase.from('comment_reads').upsert({ member_id: myId.value, thread_id: threadId, seen_at: UNREAD_AT }).then(() => undefined, () => undefined)
  }
  function markRead(threadId: string) {
    const at = new Date().toISOString()
    reads.value = { ...reads.value, [threadId]: at }
    if (preview || !myId.value) return
    supabase.from('comment_reads').upsert({ member_id: myId.value, thread_id: threadId, seen_at: at }).then(() => undefined, () => undefined)
  }

  return { list, threads, allThreads, docThreads, createDoc, myId, create, reply, resolve, remove, edit, movePin, markRead, markUnread, react, dbBehind }
}

/** 글 속 @이름 → 멤버 id(글에 아직 남아 있는 것만) */
export function mentionIds(body: string, picked: { id: string; name: string }[]) {
  return [...new Set(picked.filter((m) => body.includes('@' + m.name)).map((m) => m.id))]
}
