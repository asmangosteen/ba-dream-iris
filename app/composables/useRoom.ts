import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * 함께 보는 중(PRD/16 J-1): 같은 프로젝트를 연 사람 · 그 사람이 보는 페이지 · 고른 화면 · 커서.
 * Supabase Realtime 채널 하나 — 접속자는 presence, 커서 · 보는 자리는 broadcast(초당 최대 20번). 표에는 아무것도 남기지 않아요.
 * 커서 채팅(피그마 '/'): 치는 글자를 그대로 broadcast — 저장하지 않고, 멈추면 몇 초 뒤 사라져요.
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
  /** 마지막으로 소식을 보낸 시각 — 20초마다 다시 보내요(오래 조용하면 연결이 끊긴 것으로 봐요) */
  since: number
  /** Spotlight me(피그마와 같아요): 켠 시각 — 0 이면 꺼짐. 다른 사람에게 '따라갈까요?' 안내가 떠요 */
  spot?: number
  /** 지금 따라가는 사람(그 사람의 key) — Spotlight 중인 사람이 '몇 명이 따라오는지' 알 수 있게 */
  follows?: string | null
}
export interface PeerCursor { x: number; y: number; pageId: string | null; at: number; view?: { cx: number; cy: number; zoom: number } }
/** 커서 채팅: 지금 치는(또는 방금 보낸) 글, at = 마지막으로 바뀐 시각 */
export interface PeerChat { text: string; at: number }
/** 커서 채팅이 멈춘 뒤 보이는 시간 */
export const CHAT_LINGER = 5000
/** 스르륵 사라지는 시간 */
export const CHAT_FADE = 500

/** 사람마다 정해진 색(커서 · 이름표 · 고른 화면 테두리 · 접속자 테두리) — 흰 글자와 대비 4.5:1 이상 */
const COLORS = ['#E2601B', '#7C4DDB', '#1E8A5C', '#D1356F', '#0F7E96', '#A46A00', '#4F63E0', '#B04BB8']
export function peerColor(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]!
}

export function useRoom(projectId: string, opts: { pageId: Ref<string | null>; screenId: Ref<string | null>; editingAt: Ref<number>; following?: Ref<string | null> }) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const { data: me } = useMe()
  const tabKey = `${Math.random().toString(36).slice(2, 8)}`
  const peers = ref<Peer[]>([])
  const cursors = reactive<Record<string, PeerCursor>>({})
  const chats = reactive<Record<string, PeerChat>>({})
  const away = ref(false)
  /** 내 Spotlight(켠 시각, 0 = 꺼짐) — 접속 정보(presence)에 실어서 나중에 들어온 사람에게도 안내가 떠요 */
  const spot = ref(0)
  let ch: RealtimeChannel | null = null
  let ready = false

  const myKey = () => `${me.value?.id ?? 'anon'}:${tabKey}`
  function meta() {
    const editing = Date.now() - opts.editingAt.value < 30_000
    return {
      id: me.value?.id ?? '', name: me.value?.name || me.value?.email || '', avatar: me.value?.avatar_url ?? null,
      pageId: opts.pageId.value, screenId: opts.screenId.value,
      doing: away.value ? 'away' : editing ? 'editing' : 'viewing', since: Date.now(), spot: spot.value, follows: opts.following?.value ?? null,
    }
  }
  function readPresence() {
    if (!ch) return
    const st = ch.presenceState<Omit<Peer, 'key' | 'color'>>()
    const list: Peer[] = []
    const t = Date.now()
    for (const [key, metas] of Object.entries(st)) {
      const m = metas[metas.length - 1]
      if (!m || key === myKey()) continue
      // 받은 시각(내 시계)으로 재요 — 보낸 사람 컴퓨터 시계가 달라도 엉뚱하게 흐려지지 않게
      const o = heard.get(key)
      if (!o || o.since !== m.since) heard.set(key, { since: m.since, at: t })
      list.push({ ...m, key, color: peerColor(m.id) } as Peer)
    }
    for (const k of heard.keys()) if (!list.some((p) => p.key === k)) heard.delete(k)
    peers.value = list
    markStale()
    for (const k of Object.keys(cursors)) if (!list.some((p) => p.key === k)) delete cursors[k]
  }
  const track = () => { if (ch && ready) ch.track(meta()) }
  /**
   * 연결이 끊긴 사람(앱 · 브라우저를 그냥 끄거나 노트북을 덮은 경우 등 — 나간다는 소식을 못 보낸 채): 50초 넘게 소식이 없으면 흐리게(자리 비움),
   * 2분 반이 넘으면 목록에서 빼요(사용자 제보 2026-11-29). 탭을 닫거나 다른 화면으로 나가면 그 자리에서 바로 빠져요(pagehide · 화면 닫힘)
   */
  const STALE = 50_000, GONE = 150_000
  /** 사람(탭)마다 마지막으로 소식을 받은 시각(내 시계) */
  const heard = new Map<string, { since: number; at: number }>()
  function markStale() {
    if (preview) return
    const t = Date.now()
    const quiet = (p: Peer) => t - (heard.get(p.key)?.at ?? t)
    if (peers.value.some((p) => quiet(p) > GONE)) peers.value = peers.value.filter((p) => quiet(p) <= GONE)
    for (const p of peers.value) if (p.doing !== 'away' && quiet(p) > STALE) p.doing = 'away'
  }

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

  // 커서 채팅 보내기: 글이 바뀔 때마다(100ms 에 한 번, 마지막 값). 빈 글 = 닫음
  let chatPending: string | null = null
  let chatTimer: ReturnType<typeof setTimeout> | null = null
  function sendChat(text: string) {
    chatPending = text.slice(0, 120)
    if (chatTimer) return
    chatTimer = setTimeout(() => {
      chatTimer = null
      if (chatPending !== null && ch && ready) ch.send({ type: 'broadcast', event: 'chat', payload: { key: myKey(), text: chatPending } })
      chatPending = null
    }, 100)
  }

  // 미리보기: 예시 두 사람
  let demo: ReturnType<typeof setInterval> | null = null
  function startDemo() {
    const t0 = Date.now()
    peers.value = [
      { key: 'pv-2', id: 'preview-2', name: '김디자인', avatar: null, color: peerColor('preview-2'), pageId: opts.pageId.value, screenId: null, doing: 'editing', since: t0 },
      { key: 'pv-3', id: 'preview-3', name: '이개발', avatar: null, color: peerColor('preview-3'), pageId: opts.pageId.value, screenId: null, doing: 'viewing', since: t0 },
    ]
    // 미리보기: 주소에 ?people=7 이면 나 포함 7명(아바타 줄 · +n 확인용)
    const extra = Math.max(0, Math.min(20, Number(useRoute().query.people ?? 0) - 3))
    const NAMES = ['박기획', '최마케팅', '정QA', '한운영', '오PM', '윤데이터', '장CS', '임백엔드']
    for (let i = 0; i < extra; i++) { const id = `preview-x${i}`; peers.value.push({ key: `pv-x${i}`, id, name: NAMES[i % NAMES.length]!, avatar: null, color: peerColor(id), pageId: opts.pageId.value, screenId: null, doing: 'viewing', since: t0 }) }
    // 미리보기에서 받는 쪽 안내 보기: 주소에 ?spot=1 이면 2초 뒤 김디자인이 Spotlight 를 켜요
    if (useRoute().query.spot) setTimeout(() => { const p = peers.value[0]; if (p) p.spot = Date.now() }, 2000)
    // 미리보기: 내가 Spotlight 를 켜면 3초 뒤 김디자인이 따라와요(따라오는 사람 표시 확인용), 끄면 그만 따라와요
    watch(spot, (v) => { const p = peers.value[0]; if (!p) return; if (v) setTimeout(() => { if (spot.value) p.follows = myKey() }, 3000); else p.follows = null })
    // 미리보기: 김디자인이 몇 초마다 커서 채팅을 쳐요(한 글자씩)
    const LINES = ['여기 간격 좀 넓혀 볼까요?', '이 버튼 색 괜찮아요 👍', '잠깐 이쪽 봐 주세요']
    let li = 0, ci = 0, pause = 0
    demo = setInterval(() => {
      const t = (Date.now() - t0) / 1000
      if (pause > 0) pause -= 1
      else {
        const line = LINES[li % LINES.length]!
        if (ci < line.length) { ci += 1; chats['pv-2'] = { text: line.slice(0, ci), at: Date.now() } }
        else { li += 1; ci = 0; pause = 140 } // 다 치면 잠깐 쉬었다가(그동안 말풍선은 5초 뒤 사라짐)
      }
      const pg = opts.pageId.value
      for (const p of peers.value) p.pageId = pg
      cursors['pv-2'] = { x: 520 + Math.cos(t * 0.7) * 160, y: 380 + Math.sin(t * 1.1) * 120, pageId: pg, at: Date.now(), view: { cx: 600, cy: 400, zoom: 0.5 } }
      cursors['pv-3'] = { x: 900 + Math.sin(t * 0.5) * 120, y: 300 + Math.cos(t * 0.8) * 90, pageId: pg, at: Date.now(), view: { cx: 900, cy: 300, zoom: 0.75 } }
    }, 60)
  }

  function connect() {
    if (ch) return
    ch = supabase.channel(`iris-project-${projectId}`, { config: { presence: { key: myKey() }, broadcast: { self: false } } })
    ch.on('presence', { event: 'sync' }, readPresence)
    ch.on('broadcast', { event: 'cur' }, ({ payload }) => {
      const p = payload as PeerCursor & { key: string }
      if (p?.key && p.key !== myKey()) cursors[p.key] = { x: p.x, y: p.y, pageId: p.pageId, at: Date.now(), view: p.view }
    })
    ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
      const p = payload as { key?: string; text?: string }
      if (!p?.key || p.key === myKey()) return
      if (p.text) chats[p.key] = { text: String(p.text).slice(0, 120), at: Date.now() }
      else if (chats[p.key]) chats[p.key]!.at = Math.min(chats[p.key]!.at, Date.now() - CHAT_LINGER) // 닫으면 바로 스르륵
    })
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') { ready = true; track() } })
  }
  onMounted(() => {
    if (preview) { startDemo(); return }
    connect()
    // 살아 있다는 소식: 20초마다 다시 보내고, 받은 쪽은 5초마다 조용한 사람을 살펴요
    beat = setInterval(() => { track(); markStale() }, 20_000)
    staleT = setInterval(markStale, 5_000)
    window.addEventListener('pagehide', onLeave)
    window.addEventListener('pageshow', onBack)
  })
  let beat: ReturnType<typeof setInterval> | undefined
  let staleT: ReturnType<typeof setInterval> | undefined
  /** 탭 · 창을 닫거나 다른 사이트로 갈 때: 나간다는 소식을 바로 보내요(연결이 끊길 때까지 기다리지 않게) */
  function onLeave() { if (!ch) return; ch.untrack(); supabase.removeChannel(ch); ch = null; ready = false }
  /** 뒤로 가기로 이 화면에 돌아오면(브라우저가 화면을 그대로 보관했던 경우) 다시 들어가요 */
  function onBack(e: PageTransitionEvent) { if (e.persisted) connect() }
  watch([opts.pageId, opts.screenId, () => me.value?.id, spot, () => opts.following?.value], track)
  // 고치는 중 → 30초 뒤 보는 중으로
  let editT: ReturnType<typeof setTimeout> | null = null
  watch(opts.editingAt, () => { track(); if (editT) clearTimeout(editT); editT = setTimeout(track, 30_500) })
  function onVis() { away.value = document.visibilityState === 'hidden'; track() }
  onMounted(() => document.addEventListener('visibilitychange', onVis))
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVis)
    if (demo) clearInterval(demo)
    if (timer) clearTimeout(timer)
    if (chatTimer) clearTimeout(chatTimer)
    if (editT) clearTimeout(editT)
    window.removeEventListener('pagehide', onLeave)
    window.removeEventListener('pageshow', onBack)
    clearInterval(beat); clearInterval(staleT)
    if (ch) { ch.untrack(); supabase.removeChannel(ch); ch = null }
  })

  /** 같은 페이지 · 10초 안에 움직인 커서만 */
  const now = ref(Date.now())
  let tick: ReturnType<typeof setInterval> | undefined
  onMounted(() => { tick = setInterval(() => (now.value = Date.now()), 250) })
  onBeforeUnmount(() => clearInterval(tick))
  const liveCursors = computed(() => peers.value
    .filter((p) => p.doing !== 'away')
    .map((p) => ({ peer: p, cur: cursors[p.key] }))
    .filter((x): x is { peer: Peer; cur: PeerCursor } => !!x.cur && x.cur.pageId === opts.pageId.value && now.value - x.cur.at < 10_000)
    .map((x) => { const c = chats[x.peer.key]; const age = c ? now.value - c.at : Infinity; return { ...x, chat: age < CHAT_LINGER + CHAT_FADE ? c!.text : '', chatFading: age >= CHAT_LINGER } }))

  /** 같은 사람이 탭 여러 개면 하나로(목록 · 아바타 묶음) */
  const people = computed(() => {
    const by = new Map<string, Peer>()
    for (const p of peers.value) { const o = by.get(p.id); if (!o || (o.doing === 'away' && p.doing !== 'away')) by.set(p.id, p) }
    return [...by.values()]
  })

  /** 내 색(커서 · 테두리 — 다른 사람 화면에 보이는 색과 같아요) */
  const myColor = computed(() => peerColor(me.value?.id ?? 'preview-me'))
  /** 나를 따라오는 사람(Spotlight 중에 보여 줘요) */
  const followers = computed(() => people.value.filter((p) => p.follows === myKey()))
  /** 내 사람 id — 같은 사람의 다른 탭도 '나'로 보고 빼요(캔버스 '보는 중' 표시) */
  const myId = computed(() => me.value?.id ?? '')
  return { peers, people, cursors, liveCursors, sendCursor, sendChat, spot, myColor, followers, myKey, myId }
}
