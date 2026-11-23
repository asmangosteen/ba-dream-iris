import type { SupabaseClient } from '@supabase/supabase-js'
/**
 * 이미지 레이어 src 해석: 'storage://screens/<path>' 는 Supabase Storage 서명 URL(하루)로 바꿔 캐시합니다.
 * data: · blob: · https: 는 그대로 씁니다.
 */
const cache = reactive<Record<string, string>>({})
const loading = new Set<string>()

export function useImageSrc() {
  const supabase = useSupabaseClient()
  return (src?: string): string | undefined => {
    if (!src) return undefined
    if (!src.startsWith('storage://')) return src
    if (cache[src]) return cache[src]
    if (import.meta.client && !loading.has(src)) {
      loading.add(src)
      const [, bucket, ...rest] = src.replace('storage://', '/').split('/')
      supabase.storage.from(bucket!).createSignedUrl(rest.join('/'), 60 * 60 * 24).then(({ data }) => {
        if (data?.signedUrl) cache[src] = data.signedUrl
        loading.delete(src)
      })
    }
    return undefined
  }
}

/** 이미지 파일 올리기 → src 와 원래 크기. 미리보기 모드에서는 data URL 로 둡니다(저장되지 않음) */
export async function uploadImage(file: File, screenId: string, ctx: { supabase: Pick<SupabaseClient, 'storage'>; preview: boolean }): Promise<{ src: string; w: number; h: number }> {
  const size = await new Promise<{ w: number; h: number }>((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { resolve({ w: img.naturalWidth || 200, h: img.naturalHeight || 200 }); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve({ w: 200, h: 200 }); URL.revokeObjectURL(url) }
    img.src = url
  })
  if (ctx.preview) {
    const src = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file) })
    return { src, ...size }
  }
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${screenId}/${crypto.randomUUID()}.${ext}`
  const { error } = await ctx.supabase.storage.from('screens').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return { src: `storage://screens/${path}`, ...size }
}
