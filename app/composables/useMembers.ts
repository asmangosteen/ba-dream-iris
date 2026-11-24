export type MemberRole = 'planner' | 'designer' | 'developer'

export interface MemberRow {
  id: string
  email: string
  name: string
  role: MemberRole
  is_admin: boolean
  /** 프로필 사진: 'storage://avatars/<내 id>/<시각>.webp'(미리보기는 data: URL). 없으면 이니셜 */
  avatar_url?: string | null
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  planner: '기획',
  designer: '디자인',
  developer: '개발',
}

const MEMBER_COLS = 'id, email, name, role, is_admin, avatar_url'
const MEMBER_COLS_OLD = 'id, email, name, role, is_admin'
/** avatar_url 칸이 아직 없는 DB(마이그레이션 20261125 전)에서도 열리게: 칸이 없다는 오류(42703)면 예전 칸으로 다시 읽어요 */
const noAvatarCol = (e: { code?: string } | null) => e?.code === '42703' || e?.code === 'PGRST204'

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
    let { data, error } = await supabase.from('members').select(MEMBER_COLS).eq('id', myId.value).maybeSingle()
    if (noAvatarCol(error)) ({ data, error } = await supabase.from('members').select(MEMBER_COLS_OLD).eq('id', myId.value).maybeSingle())
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
    let res = await supabase.from('members').select(MEMBER_COLS).order('name')
    if (noAvatarCol(res.error)) res = (await supabase.from('members').select(MEMBER_COLS_OLD).order('name')) as unknown as typeof res
    if (res.error) throw res.error
    return (res.data ?? []) as MemberRow[]
  })
}

/** 내 이름 · 역할 · 사진 고치기. RLS 가 본인 행만 허락하고, is_admin 은 보내지 않습니다 */
export function useUpdateMe() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const myId = useMyId()
  const me = useNuxtData<MemberRow | null>('me').data
  const members = useNuxtData<MemberRow[]>('members').data

  return async function updateMe(patch: { name: string; role: MemberRole; avatar_url?: string | null }): Promise<MemberRow> {
    const clean: Partial<MemberRow> = { name: patch.name.trim(), role: patch.role }
    if (patch.avatar_url !== undefined) clean.avatar_url = patch.avatar_url
    let next: MemberRow
    if (preview) {
      const state = previewMe()
      state.value = { ...state.value, ...clean }
      next = { ...state.value }
    } else {
      if (!myId.value) throw new Error('로그인이 필요해요')
      let { data, error } = await supabase.from('members').update(clean).eq('id', myId.value).select(MEMBER_COLS).single()
      if (noAvatarCol(error)) {
        if (clean.avatar_url !== undefined) throw new Error('프로필 사진 칸이 아직 DB 에 없어요(마이그레이션 20261125 필요)')
        ;({ data, error } = await supabase.from('members').update(clean).eq('id', myId.value).select(MEMBER_COLS_OLD).single())
      }
      if (error) throw error
      next = data as MemberRow
    }
    me.value = next
    if (members.value) members.value = members.value.map((m) => (m.id === next.id ? { ...m, ...next } : m))
    return next
  }
}

/** 프로필 사진 크기: 가운데를 정사각형으로 잘라 256px webp 로 줄여 올려요(원본은 10MB 까지) */
export const AVATAR_PX = 256
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024

/** 고른 사진 → 가운데 정사각형 256px webp. 브라우저가 webp 를 못 만들면 png */
export async function squareAvatar(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = c.height = AVATAR_PX
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX)
  bmp.close()
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/webp', 0.9))
  return blob ?? await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('사진을 만들지 못했어요'))), 'image/png'))
}

/** 프로필 사진 올리기 → members.avatar_url 에 넣을 값. 미리보기는 저장소 없이 data: URL */
export function useUploadAvatar() {
  const supabase = useSupabaseClient()
  const preview = useDevPreview()
  const myId = useMyId()
  return async function uploadAvatar(blob: Blob): Promise<string> {
    if (preview) return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob) })
    if (!myId.value) throw new Error('로그인이 필요해요')
    const ext = blob.type === 'image/png' ? 'png' : 'webp'
    const path = `${myId.value}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: blob.type, upsert: false })
    if (error) throw error
    return `storage://avatars/${path}`
  }
}
