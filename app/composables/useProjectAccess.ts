import type { ProjectRole } from '~~/shared/types/database'
import type { MemberRow } from './useMembers'

/**
 * 프로젝트 역할 · 초대 (PRD/12, 1단계). DB 규칙이 진짜로 막고(supabase/migrations/20261126000000_project_roles.sql),
 * 화면은 그 결과를 미리 보여 줘요(권한 없는 메뉴 숨김 · 잠금 표시).
 * 초대는 메일 없이: 초대 기록이 회사 이메일로 남고, 그 사람이 로그인하면 바로 보여요.
 */
export type { ProjectRole }
export type InviteStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled'
export interface InviteRow { id: string; project_id: string; email: string; kind: 'invite' | 'join'; requested_by: string; status: InviteStatus; role: Exclude<ProjectRole, 'owner'> | null; decided_by: string | null; seen_at: string | null; created_at: string; expires_at: string }
export interface ProjectMemberRow { member_id: string; role: ProjectRole; created_at: string; member: MemberRow | null }

/** 화면에 보이는 역할 이름(영어 원문 — 보여 줄 때 tr) */
export const ROLE_NAME: Record<ProjectRole, string> = {
  owner: 'Owner',
  deputy: 'Co-owner',
  planner_editor: 'Can edit docs',
  designer_editor: 'Can edit design',
  reviewer: 'Can review',
  viewer: 'Can view',
}
/** 고를 수 있는 역할(방장은 '방장 넘기기'로만) */
export const ASSIGNABLE: Exclude<ProjectRole, 'owner'>[] = ['deputy', 'planner_editor', 'designer_editor', 'reviewer', 'viewer']

/** 역할별로 할 수 있는 일(PRD/12 2장 표) */
export function abilities(role: ProjectRole | null) {
  const r = role
  return {
    view: !!r,
    comment: !!r,
    editDesign: r === 'owner' || r === 'deputy' || r === 'designer_editor',
    editDocs: r === 'owner' || r === 'deputy' || r === 'planner_editor',
    link: r === 'owner' || r === 'deputy' || r === 'planner_editor' || r === 'designer_editor',
    review: !!r && r !== 'viewer',
    manage: r === 'owner' || r === 'deputy',
    owner: r === 'owner',
  }
}
export type Abilities = ReturnType<typeof abilities>

/** DB 함수 오류 → 영어 원문(보여 줄 때 tr) */
const ERR: Record<string, string> = {
  not_member: 'You\'re not a member of this project',
  bad_domain: 'Only @ba-dream.com emails can be invited',
  already_member: 'This person is already a member',
  owner_only: 'Only the owner can do this',
  admins_only: 'Only owners and co-owners can do this',
  role_required: 'Choose a role first',
  expired: 'This request has expired',
  not_pending: 'This request was already handled',
  transfer_first: 'Transfer ownership before leaving',
  use_transfer: 'Use Transfer ownership to change the owner',
  bad_role: 'That role doesn\'t exist',
}
export function accessError(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? ''
  const key = Object.keys(ERR).find((k) => msg.includes(k))
  return key ? ERR[key]! : 'Something went wrong. Try again'
}

// --- 미리보기(로그인 없이): 예시 역할 · 초대를 useState 에 ---
interface PreviewAccess { roles: Record<string, Record<string, ProjectRole>>; invites: InviteRow[] }
const day = 86_400_000
function previewAccess() {
  return useState<PreviewAccess>('pv-access', () => ({
    roles: {},
    invites: [
      { id: 'pv-inv-1', project_id: 'preview-1', email: 'jung.ux@ba-dream.com', kind: 'invite', requested_by: 'preview-2', status: 'pending', role: null, decided_by: null, seen_at: null, created_at: new Date(Date.now() - 2 * day).toISOString(), expires_at: new Date(Date.now() + 5 * day).toISOString() },
      { id: 'pv-inv-2', project_id: 'preview-1', email: 'han.qa@ba-dream.com', kind: 'join', requested_by: 'preview-x', status: 'pending', role: null, decided_by: null, seen_at: null, created_at: new Date(Date.now() - 6 * 3_600_000).toISOString(), expires_at: new Date(Date.now() + 7 * day - 6 * 3_600_000).toISOString() },
    ],
  }))
}
/** 미리보기 역할: 내가 방장, 김디자인 디자인 편집, 이개발 검토자(?role=… 로 내 역할 바꿔 보기) */
function previewRoles(pid: string): Record<string, ProjectRole> {
  const st = previewAccess()
  if (!st.value.roles[pid]) {
    const q = useRoute().query.role
    const none = q === 'none'
    const mine = (typeof q === 'string' && (ASSIGNABLE as string[]).concat('owner').includes(q) ? q : 'owner') as ProjectRole
    st.value.roles[pid] = { ...(none ? {} : { 'preview-me': mine }), 'preview-2': mine === 'owner' ? 'designer_editor' : 'owner', 'preview-3': 'reviewer' }
    // ?gate=invited|expired|requested: 나에게 온 초대 · 요청 예시(권한 안내 화면 미리보기)
    const g = useRoute().query.gate
    if (g === 'invited' || g === 'expired' || g === 'requested') {
      st.value.invites.unshift({ id: 'pv-gate', project_id: pid, email: 'preview@ba-dream.com', kind: g === 'requested' ? 'join' : 'invite', requested_by: g === 'requested' ? 'preview-me' : 'preview-2', status: g === 'invited' ? 'approved' : g === 'expired' ? 'expired' : 'pending', role: g === 'invited' ? 'designer_editor' : null, decided_by: g === 'invited' ? 'preview-2' : null, seen_at: null, created_at: new Date(Date.now() - 9 * day).toISOString(), expires_at: new Date(Date.now() + (g === 'expired' ? -2 : 7) * day).toISOString() })
      if (g === 'invited') st.value.roles[pid]!['preview-me'] = 'designer_editor'
    }
  }
  return st.value.roles[pid]!
}

function useMyId() {
  const user = useSupabaseUser()
  return computed(() => {
    const u = user.value as { sub?: string; id?: string } | null
    return (u?.sub ?? u?.id ?? null) as string | null
  })
}

/**
 * 한 프로젝트의 내 역할 · 멤버 · 초대. 역할은 화면이 메뉴를 숨기고 잠그는 데 써요(진짜 막는 건 DB).
 * - role: 내 역할(멤버가 아니면 null)
 * - members: 프로젝트 멤버(이름 · 이메일 · 역할)
 * - invites: 대기 중 요청(방장 · 부방장은 전부, 다른 사람은 내가 보낸 것) + 나에게 온 승인된 초대
 */
export function useProjectAccess(projectId: string) {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const myId = useMyId()
  const members = useMembers()

  const data = useAsyncData(`access-${projectId}`, async () => {
    if (preview) {
      const roles = previewRoles(projectId)
      return { roles: Object.entries(roles).map(([member_id, role]) => ({ member_id, role, created_at: '' })), invites: previewAccess().value.invites.filter((i) => i.project_id === projectId), legacy: false }
    }
    if (!myId.value) return { roles: [], invites: [], legacy: false }
    await supabase.rpc('expire_invites').then(() => undefined, () => undefined) // 7일 지난 요청 정리(실패해도 화면은 열어요)
    const [r, i] = await Promise.all([
      supabase.from('project_members').select('member_id, role, created_at').eq('project_id', projectId),
      supabase.from('project_invites').select('id, project_id, email, kind, requested_by, status, role, decided_by, seen_at, created_at, expires_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100),
    ])
    // 마이그레이션 전 DB(역할 표가 없음): 예전처럼 누구나 편집 — 화면은 막지 않아요
    if (r.error) return { roles: [], invites: [], legacy: true }
    return { roles: (r.data ?? []) as { member_id: string; role: ProjectRole; created_at: string }[], invites: (i.data ?? []) as InviteRow[], legacy: false }
  }, { watch: [myId] })

  const me = computed(() => (preview ? 'preview-me' : myId.value))
  /** 마이그레이션 전 DB면 모두 방장처럼(예전 동작) */
  const legacy = computed(() => !!data.data.value?.legacy)
  const role = computed<ProjectRole | null>(() => (legacy.value ? 'owner' : data.data.value?.roles.find((x) => x.member_id === me.value)?.role ?? null))
  const can = computed(() => abilities(role.value))
  const memberList = computed<ProjectMemberRow[]>(() => {
    const byId = new Map((members.data.value ?? []).map((m) => [m.id, m]))
    const order: ProjectRole[] = ['owner', 'deputy', 'planner_editor', 'designer_editor', 'reviewer', 'viewer']
    return (data.data.value?.roles ?? [])
      .map((x) => ({ ...x, member: byId.get(x.member_id) ?? null }))
      .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || (a.member?.name ?? '').localeCompare(b.member?.name ?? '', 'ko'))
  })
  const pending = computed(() => (data.data.value?.invites ?? []).filter((i) => i.status === 'pending' && new Date(i.expires_at).getTime() > Date.now()))
  const myEmail = computed(() => (members.data.value ?? []).find((m) => m.id === me.value)?.email?.toLowerCase() ?? '')
  /** 나에게 온, 아직 보지 않은 승인된 초대('초대됐어요' 화면) */
  const welcome = computed(() => (data.data.value?.invites ?? []).find((i) => i.status === 'approved' && !i.seen_at && i.email === myEmail.value) ?? null)
  /** 나와 관련된 가장 최근 초대 · 요청(권한 안내 화면이 씀) */
  const mine = computed(() => (data.data.value?.invites ?? []).find((i) => i.email === myEmail.value || (i.kind === 'join' && i.requested_by === me.value)) ?? null)
  /**
   * 권한 안내 화면 상태(PRD/16 B): invited = 초대받고 아직 안 봄 · requested = 참여 요청 대기 · expired = 초대 만료 · none = 멤버 아님.
   * null = 그냥 열기(멤버이거나 아직 불러오는 중 · 마이그레이션 전)
   */
  const gate = computed<'invited' | 'requested' | 'expired' | 'none' | null>(() => {
    if (data.status.value !== 'success' || legacy.value) return null
    if (welcome.value) return 'invited'
    if (role.value) return null
    const m = mine.value
    if (m?.status === 'pending' && new Date(m.expires_at).getTime() > Date.now()) return 'requested'
    if (m && (m.status === 'expired' || (m.status === 'pending' && new Date(m.expires_at).getTime() <= Date.now()))) return 'expired'
    return 'none'
  })

  async function call<T>(fn: () => PromiseLike<{ data: T; error: { message: string } | null }>) {
    const { data: out, error } = await fn()
    if (error) throw new Error(error.message)
    await data.refresh()
    return out
  }
  const pv = () => previewAccess()
  /**
   * 요청을 처리하면(승인 · 거절 · 취소) 그 요청 알림도 바로 '처리됨'으로 — 읽음 + 결과 표시(사용자 요청 2026-11-27).
   * 다른 방장 · 부방장의 알림은 DB 트리거가 같이 바꿔요(20261128000001_invite_notifications.sql)
   */
  const pvNotes = useState<{ id: string; target_id: string | null; read_at: string | null; payload: Record<string, unknown> }[] | undefined>('pv-notes')
  const notes = useNuxtData<{ id: string; target_id: string | null; read_at: string | null; payload: Record<string, unknown> }[]>('notifications')
  function settleNotes(inviteId: string, status: 'approved' | 'rejected' | 'cancelled') {
    const at = new Date().toISOString()
    const list = notes.data.value ?? []
    const ids = list.filter((n) => n.target_id === inviteId).map((n) => n.id)
    if (!ids.length) return
    const mark = <T extends { target_id: string | null; read_at: string | null; payload: Record<string, unknown> }>(n: T): T => (n.target_id === inviteId ? { ...n, read_at: n.read_at ?? at, payload: { ...n.payload, decided: status } } : n)
    notes.data.value = list.map(mark)
    if (preview) { if (pvNotes.value) pvNotes.value = pvNotes.value.map(mark); return }
    supabase.from('notifications').update({ read_at: at }).in('id', ids).is('read_at', null).then(() => undefined, () => undefined)
  }
  const actions = {
    /** 초대: 방장 · 부방장은 역할과 함께 바로, 다른 멤버는 승인 요청 */
    async invite(email: string, r?: Exclude<ProjectRole, 'owner'> | null) {
      const mail = email.trim().toLowerCase()
      if (!/^[^\s@]+@ba-dream\.com$/.test(mail)) throw new Error('bad_domain')
      if (preview) {
        if (can.value.manage && r) { const t = (members.data.value ?? []).find((m) => m.email.toLowerCase() === mail); if (t) previewRoles(projectId)[t.id] = r }
        else pv().value.invites.unshift({ id: 'pv-' + Math.random().toString(36).slice(2, 8), project_id: projectId, email: mail, kind: 'invite', requested_by: 'preview-me', status: 'pending', role: null, decided_by: null, seen_at: null, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * day).toISOString() })
        return data.refresh()
      }
      return call(() => supabase.rpc('invite_to_project', { pid: projectId, mail, r: can.value.manage ? r ?? null : null }))
    },
    async requestJoin() {
      if (preview) { pv().value.invites.unshift({ id: 'pv-' + Math.random().toString(36).slice(2, 8), project_id: projectId, email: 'preview@ba-dream.com', kind: 'join', requested_by: 'preview-me', status: 'pending', role: null, decided_by: null, seen_at: null, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * day).toISOString() }); return data.refresh() }
      return call(() => supabase.rpc('request_join', { pid: projectId }))
    },
    async decide(id: string, approve: boolean, r?: Exclude<ProjectRole, 'owner'> | null) {
      if (approve && !r) throw new Error('role_required')
      if (preview) { const inv = pv().value.invites.find((x) => x.id === id); if (inv) { inv.status = approve ? 'approved' : 'rejected'; inv.role = r ?? null } settleNotes(id, approve ? 'approved' : 'rejected'); return data.refresh() }
      const out = await call(() => supabase.rpc('decide_invite', { inv: id, approve, r: r ?? null }))
      settleNotes(id, approve ? 'approved' : 'rejected')
      return out
    },
    async cancel(id: string) {
      if (preview) { const inv = pv().value.invites.find((x) => x.id === id); if (inv) inv.status = 'cancelled'; settleNotes(id, 'cancelled'); return data.refresh() }
      const out = await call(() => supabase.rpc('cancel_invite', { inv: id }))
      settleNotes(id, 'cancelled')
      return out
    },
    async setRole(memberId: string, r: Exclude<ProjectRole, 'owner'>) {
      if (preview) { previewRoles(projectId)[memberId] = r; return data.refresh() }
      return call(() => supabase.rpc('set_project_role', { pid: projectId, mid: memberId, r }))
    },
    async remove(memberId: string) {
      if (preview) { delete previewRoles(projectId)[memberId]; return data.refresh() }
      return call(() => supabase.rpc('remove_project_member', { pid: projectId, mid: memberId }))
    },
    async transfer(memberId: string) {
      if (preview) { const rs = previewRoles(projectId); rs['preview-me'] = 'deputy'; rs[memberId] = 'owner'; return data.refresh() }
      return call(() => supabase.rpc('transfer_project_owner', { pid: projectId, mid: memberId }))
    },
    async markSeen() {
      if (preview) { for (const i of pv().value.invites) if (i.project_id === projectId && i.status === 'approved') i.seen_at = new Date().toISOString(); return data.refresh() }
      return call(() => supabase.rpc('mark_invites_seen', { pid: projectId }))
    },
  }

  return { data, role, can, legacy, members: memberList, pending, welcome, mine, gate, me, myEmail, ...actions }
}

/** 내가 멤버인 프로젝트들과 역할(홈 목록 · 카드의 역할 표시 · '승인 대기' 배지) */
export function useMyProjectRoles() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const myId = useMyId()
  return useAsyncData('my-project-roles', async () => {
    if (preview) return { roles: { 'preview-1': 'owner' } as Record<string, ProjectRole>, pendingByProject: { 'preview-1': 2 } as Record<string, number>, all: true }
    if (!myId.value) return { roles: {}, pendingByProject: {}, all: false }
    const [r, i] = await Promise.all([
      supabase.from('project_members').select('project_id, role').eq('member_id', myId.value),
      supabase.from('project_invites').select('project_id').eq('status', 'pending').gt('expires_at', new Date().toISOString()),
    ])
    // 마이그레이션 전 DB: 테이블이 없으면(42P01 · PGRST205) 예전처럼 모든 프로젝트를 보여 줘요
    if (r.error) return { roles: {}, pendingByProject: {}, all: true }
    const roles = Object.fromEntries(((r.data ?? []) as { project_id: string; role: ProjectRole }[]).map((x) => [x.project_id, x.role])) as Record<string, ProjectRole>
    const pendingByProject: Record<string, number> = {}
    for (const x of (i.data ?? []) as { project_id: string }[]) if (roles[x.project_id] === 'owner' || roles[x.project_id] === 'deputy') pendingByProject[x.project_id] = (pendingByProject[x.project_id] ?? 0) + 1
    return { roles, pendingByProject, all: false }
  }, { watch: [myId] })
}
