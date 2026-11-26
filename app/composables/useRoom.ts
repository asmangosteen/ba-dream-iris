import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * 함께 보는 중(PRD/16 J-1): 같은 프로젝트를 연 사람 · 그 사람이 보는 페이지 · 고른 화면 · 커서.
 * Supabase Realtime 채널 하나 — 접속자는 presence, 커서 · 보는 자리는 broadcast(초당 최대 20번). 표에는 아무것도 남기지 않아요.
 * 미리보기 모드는 예시 두 사람이 캔버스 위를 돌아다녀요.
 */
export interface Peer {
  /** 사람 + 탭(같은 사람이 탭 둘이면 둘) */
  key: string
  id: string
  name: string
  avatar: string | null
  color: string
  pageId: string | null
  screenId: string | null
  /** editing = 화면을 고친 지 30초 안 · viewing · away = 다른 탭으로 감 */
  doing: 'editing' | 'viewing' | 'away'
  since: number
}
export interface PeerCursor { x: number; y: number; pageId: string | null; at: number; view?: { cx: number; cy: number; zoom: number } }

/** 사람마다 정해진 색(커서 · 이름표 · 고른 화면 테두리 · 접속자 테두리) — 흰 글자와 대비 4.5:1 이상 */
const COLORS = ['#E2601B', '#7C4DDB', '#1E8A5C', '#D1356F', '#0F7E96', '#A46A00', '#4F63E0', '#B04BB8']
export function peerColor(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]!
}

export function useRoom(projectId: string, opts: { pageId: Ref<string | null>; screenId: Ref<string | null>; editingAt: Ref<number> }) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const { data: me } = useMe()
  const tabKey = `${Math.random().toString(36).slice(2, 8)}`
  const peers = ref<Peer[]>([])
  const cursors = reactive<Record<string, PeerCursor>>({})
  const away = ref(false)
  let ch: RealtimeChannel | null = null
  let ready = false

  const myKey = () => `${me.value?.id ?? 'anon'}:${tabKey}`
  function meta() {
    const editing = Date.now() - opts.editingAt.value < 30_000
    return {
      id: me.value?.id ?? '', name: me.value?.name || me.value?.email || '', avatar: me.value?.avatar_url ?? null,
      pageId: opts.pageId.value, screenId: opts.screenId.value,
      doing: away.value ? 'away' : editing ? 'editing' : 'viewing', since: Date.now(),
    }
  }
  function readPresence() {
    if (!ch) return
    const st = ch.presenceState<Omit<Peer, 'key' | 'color'>>()
    const list: Peer[] = []
    for (const [key, metas] of Object.entries(st)) {
      const m = metas[metas.length - 1]
      if (!m || key === myKey()) continue
      list.push({ ...m, key, color: peerColor(m.id) } as Peer)
    }
    peers.value = list
    for (const k of Object.keys(cursors)) if (!list.some((p) => p.key === k)) delete cursors[k]
  }
  const track = () => { if (ch && ready) ch.track(meta()) }

  // 커서 · 보는 자리 보내기: 50ms 에 한 번(마지막 값)
  let pending: PeerCursor | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  function sendCursor(c: Omit<PeerCursor, 'at' | 'pageId'>) {
    pending = { ...c, pageId: opts.pageId.value, at: Date.now() }
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      if (pending && ch && ready) ch.send({ type: 'broadcast', event: 'cur', payload: { key: myKey(), ...pending } })
      pending = null
    }, 50)
  }

  // 미리보기: 예시 두 사람
  let demo: ReturnType<typeof setInterval> | null = null
  function startDemo() {
    const t0 = Date.now()
    peers.value = [
      { key: 'pv-2', id: 'preview-2', name: '김디자인', avatar: null, color: peerColor('preview-2'), pageId: opts.pageId.value, screenId: null, doing: 'editing', since: t0 },
      { key: 'pv-3', id: 'preview-3', name: '이개발', avatar: null, color: peerColor('preview-3'), pageId: opts.pageId.value, screenId: null, doing: 'viewing', since: t0 },
    ]
    demo = setInterval(() => {
      const t = (Date.now() - t0) / 1000
      const pg = opts.pageId.value
      for (const p of peers.value) p.pageId = pg
      cursors['pv-2'] = { x: 520 + Math.cos(t * 0.7) * 160, y: 380 + Math.sin(t * 1.1) * 120, pageId: pg, at: Date.now(), view: { cx: 600, cy: 400, zoom: 0.5 } }
      cursors['pv-3'] = { x: 900 + Math.sin(t * 0.5) * 120, y: 300 + Math.cos(t * 0.8) * 90, pageId: pg, at: Date.now(), view: { cx: 900, cy: 300, zoom: 0.75 } }
    }, 60)
  }

  onMounted(() => {
    if (preview) { startDemo(); return }
    ch = supabase.channel(`iris-project-${projectId}`, { config: { presence: { key: myKey() }, broadcast: { self: false } } })
    ch.on('presence', { event: 'sync' }, readPresence)
    ch.on('broadcast', { event: 'cur' }, ({ payload }) => {
      const p = payload as PeerCursor & { key: string }
      if (p?.key && p.key !== myKey()) cursors[p.key] = { x: p.x, y: p.y, pageId: p.pageId, at: Date.now(), view: p.view }
    })
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') { ready = true; track() } })
  })
  watch([opts.pageId, opts.screenId, () => me.value?.id], track)
  // 고치는 중 → 30초 뒤 보는 중으로
  let editT: ReturnType<typeof setTimeout> | null = null
  watch(opts.editingAt, () => { track(); if (editT) clearTimeout(editT); editT = setTimeout(track, 30_500) })
  function onVis() { away.value = document.visibilityState === 'hidden'; track() }
  onMounted(() => document.addEventListener('visibilitychange', onVis))
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVis)
    if (demo) clearInterval(demo)
    if (timer) clearTimeout(timer)
    if (editT) clearTimeout(editT)
    if (ch) { supabase.removeChannel(ch); ch = null }
  })

  /** 같은 페이지 · 10초 안에 움직인 커서만 */
  const now = ref(Date.now())
  let tick: ReturnType<typeof setInterval> | undefined
  onMounted(() => { tick = setInterval(() => (now.value = Date.now()), 2000) })
  onBeforeUnmount(() => clearInterval(tick))
  const liveCursors = computed(() => peers.value
    .filter((p) => p.doing !== 'away')
    .map((p) => ({ peer: p, cur: cursors[p.key] }))
    .filter((x): x is { peer: Peer; cur: PeerCursor } => !!x.cur && x.cur.pageId === opts.pageId.value && now.value - x.cur.at < 10_000))

  /** 같은 사람이 탭 여러 개면 하나로(목록 · 아바타 묶음) */
  const people = computed(() => {
    const by = new Map<string, Peer>()
    for (const p of peers.value) { const o = by.get(p.id); if (!o || (o.doing === 'away' && p.doing !== 'away')) by.set(p.id, p) }
    return [...by.values()]
  })

  return { peers, people, cursors, liveCursors, sendCursor }
}
