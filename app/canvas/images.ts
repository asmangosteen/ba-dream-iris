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

/** 영상 파일 확장자 · 형식 */
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i
/** 영상 주소인지(이미지 레이어가 영상도 담아요: 'storage://…/x.mp4' · data:video · blob 은 이름표 #video) */
export const isVideoSrc = (src?: string) => !!src && (VIDEO_EXT.test(src) || src.startsWith('data:video/') || src.endsWith('#video'))
export const isVideoFile = (f: File) => f.type.startsWith('video/') || VIDEO_EXT.test(f.name)
/** 캔버스에 넣을 수 있는 파일: 이미지 · 영상 */
export const isMediaFile = (f: File) => f.type.startsWith('image/') || isVideoFile(f)
/** 크기 한도: 이미지 10MB · 영상 50MB */
export const mediaLimit = (f: File) => (isVideoFile(f) ? 50 : 10) * 1024 * 1024

/** 이미지 · 영상 원래 크기 */
function naturalSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const done = (w: number, h: number) => { resolve({ w: w || 200, h: h || 200 }); URL.revokeObjectURL(url) }
    if (isVideoFile(file)) {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight)
      v.onerror = () => done(320, 180)
      v.src = url
      return
    }
    const img = new Image()
    img.onload = () => done(img.naturalWidth, img.naturalHeight)
    img.onerror = () => done(200, 200)
    img.src = url
  })
}

/** 이미지 · 영상 파일 올리기 → src 와 원래 크기. 미리보기 모드에서는 저장하지 않아요(이미지는 data URL, 영상은 blob URL) */
export async function uploadImage(file: File, screenId: string, ctx: { supabase: Pick<SupabaseClient, 'storage'>; preview: boolean }): Promise<{ src: string; w: number; h: number; video: boolean }> {
  const size = await naturalSize(file)
  const video = isVideoFile(file)
  if (ctx.preview) {
    if (video) return { src: URL.createObjectURL(file) + '#video', ...size, video }
    const src = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file) })
    return { src, ...size, video }
  }
  const ext = (file.name.split('.').pop() || (video ? 'mp4' : 'png')).toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${screenId}/${crypto.randomUUID()}.${ext}`
  const { error } = await ctx.supabase.storage.from('screens').upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw error
  return { src: `storage://screens/${path}`, ...size, video }
}
