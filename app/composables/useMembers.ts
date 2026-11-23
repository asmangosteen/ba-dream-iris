export type MemberRole = 'planner' | 'designer' | 'developer'

export interface MemberRow {
  id: string
  email: string
  name: string
  role: MemberRole
  is_admin: boolean
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  planner: '기획',
  designer: '디자인',
  developer: '개발',
}

const MEMBER_COLS = 'id, email, name, role, is_admin'

/** 미리보기(로그인 없이)에서 쓰는 내 정보. 고친 내용은 useState 에만 둡니다 */
const PREVIEW_ME: MemberRow = { id: 'preview-me', email: 'preview@ba-dream.com', name: '미리보기', role: 'planner', is_admin: true }
const PREVIEW_TEAM: MemberRow[] = [
  { id: 'preview-2', email: 'designer@ba-dream.com', name: '김디자인', role: 'designer', is_admin: false },
  { id: 'preview-3', email: 'developer@ba-dream.com', name: '이개발', role: 'developer', is_admin: false },
]
const previewMe = () => useState<MemberRow>('pv-me', () => ({ ...PREVIEW_ME }))

/** 지금 로그인한 사람의 id (supabase 모듈이 돌려주는 claims 는 sub, 예전 user 객체는 id) */
function useMyId() {
  const user = useSupabaseUser()
  return computed(() => {
    const u = user.value as { sub?: string; id?: string } | null
    return (u?.sub ?? u?.id ?? null) as string | null
  })
}

/** 내 멤버 정보 (id · email · name · role · is_admin) */
export function useMe() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const myId = useMyId()
  return useAsyncData<MemberRow | null>('me', async () => {
    if (preview) return { ...previewMe().value }
    if (!myId.value) return null
    const { data, error } = await supabase.from('members').select(MEMBER_COLS).eq('id', myId.value).maybeSingle()
    if (error) throw error
    return (data ?? null) as MemberRow | null
  }, { watch: [myId] })
}

/** 워크스페이스 멤버 전체 (RLS 로 멤버만 읽힘) */
export function useMembers() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  return useAsyncData<MemberRow[]>('members', async () => {
    if (preview) return [{ ...previewMe().value }, ...PREVIEW_TEAM]
    const { data, error } = await supabase.from('members').select(MEMBER_COLS).order('name')
    if (error) throw error
    return (data ?? []) as MemberRow[]
  })
}

/** 내 이름 · 역할 고치기. RLS 가 본인 행만 허락하고, is_admin 은 보내지 않습니다 */
export function useUpdateMe() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const myId = useMyId()
  const me = useNuxtData<MemberRow | null>('me').data
  const members = useNuxtData<MemberRow[]>('members').data

  return async function updateMe(patch: { name: string; role: MemberRole }): Promise<MemberRow> {
    const clean = { name: patch.name.trim(), role: patch.role }
    let next: MemberRow
    if (preview) {
      const state = previewMe()
      state.value = { ...state.value, ...clean }
      next = { ...state.value }
    } else {
      if (!myId.value) throw new Error('로그인이 필요해요')
      const { data, error } = await supabase.from('members').update(clean).eq('id', myId.value).select(MEMBER_COLS).single()
      if (error) throw error
      next = data as MemberRow
    }
    me.value = next
    if (members.value) members.value = members.value.map((m) => (m.id === next.id ? { ...m, ...next } : m))
    return next
  }
}
