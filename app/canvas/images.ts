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
/** 크기 한도: 이미지 10MB · 영상 50MB. 이미지는 4096px 로 줄인 뒤의 크기로 잽니다 */
export const mediaLimit = (f: File) => (isVideoFile(f) ? 50 : 10) * 1024 * 1024
/** 줄이기 전 원본 이미지 한도 — 너무 큰 파일은 읽다가 브라우저가 멈추지 않게 미리 막아요 */
const RAW_IMAGE_LIMIT = 50 * 1024 * 1024
/** 한도를 넘는 파일 — 받는 쪽에서 "너무 커요" 안내를 띄웁니다 */
export class MediaTooLargeError extends Error {}

/** 이미지 긴 변 한도(피그마와 같아요): 넘으면 비율 그대로 4096px 로 줄여요. 형식은 원본 그대로 */
export const IMAGE_MAX_PX = 4096
/** 줄여도 원본 형식으로 다시 저장할 수 있는 형식. 그 밖(BMP · TIFF · HEIC 등)은 PNG 로 저장해요 */
const REENCODE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const
/** 줄이지 않는 형식: GIF(움직임이 사라져요) · SVG(벡터라 크기와 상관없어요) */
const KEEP_AS_IS = /^image\/(gif|svg\+xml)$/

/** 4096px 넘는 이미지를 원본 형식 그대로 줄입니다. 줄일 필요가 없으면 원본 파일을 그대로 돌려줘요 */
async function fitImage(file: File, size: { w: number; h: number }): Promise<{ file: File; w: number; h: number }> {
  const long = Math.max(size.w, size.h)
  if (long <= IMAGE_MAX_PX || KEEP_AS_IS.test(file.type)) return { file, ...size }
  const k = IMAGE_MAX_PX / long
  const w = Math.max(1, Math.round(size.w * k)), h = Math.max(1, Math.round(size.h * k))
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, 0, 0, w, h)
    const want = file.type in REENCODE ? file.type : 'image/png'
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, want, want === 'image/png' ? undefined : 0.92))
    if (!blob) return { file, ...size } // 다시 저장하지 못하면 원본 그대로 올려요
    // 브라우저가 그 형식으로 못 만들면(사파리의 WebP 등) PNG 로 나와요 → 확장자도 맞춰요
    const ext = REENCODE[blob.type as keyof typeof REENCODE] ?? 'png'
    const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext
    return { file: new File([blob], name, { type: blob.type || 'image/png' }), w, h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

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

/**
 * 이미지 · 영상 파일 올리기 → src 와 크기. 미리보기 모드에서는 저장하지 않아요(이미지는 data URL, 영상은 blob URL)
 * 이미지는 긴 변이 4096px 를 넘으면 줄여서 올려요(피그마와 같아요). 한도를 넘으면 MediaTooLargeError
 */
export async function uploadImage(input: File, screenId: string, ctx: { supabase: Pick<SupabaseClient, 'storage'>; preview: boolean }): Promise<{ src: string; w: number; h: number; video: boolean }> {
  const video = isVideoFile(input)
  if (input.size > (video ? mediaLimit(input) : RAW_IMAGE_LIMIT)) throw new MediaTooLargeError()
  const natural = await naturalSize(input)
  const { file, ...size } = video ? { file: input, ...natural } : await fitImage(input, natural)
  if (file.size > mediaLimit(file)) throw new MediaTooLargeError()
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
