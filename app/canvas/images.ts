import type { SupabaseClient } from '@supabase/supabase-js'
import { keepStorageImage, loadStorageImage } from '~/canvas/imageCache'
/**
 * 이미지 레이어 src 해석: 'storage://screens/<path>' 는 Supabase Storage 서명 URL(하루)로 바꿔 캐시합니다.
 * data: · blob: · https: 는 그대로 씁니다.
 */
const cache = reactive<Record<string, string>>({})
const loading = new Set<string>()

/** 화면에 한 번 그린 이미지의 실제 주소('storage://' → 서명 URL · 이 기기 보관본). 아직 안 그렸으면 undefined — SVG 로 복사할 때 써요 */
export const loadedImageUrl = (src: string): string | undefined => (src.startsWith('storage://') ? cache[src] : src)
export function useImageSrc() {
  const supabase = useSupabaseClient()
  return (src?: string): string | undefined => {
    if (!src) return undefined
    if (!src.startsWith('storage://')) return src
    if (cache[src]) return cache[src]
    if (import.meta.client && !loading.has(src)) {
      loading.add(src)
      const [, bucket, ...rest] = src.replace('storage://', '/').split('/')
      // 이 기기에 보관해 둔 그림이 있으면 바로, 없으면 받아서 보관(app/canvas/imageCache.ts)
      const signed = () => supabase.storage.from(bucket!).createSignedUrl(rest.join('/'), 60 * 60 * 24).then(({ data }) => data?.signedUrl)
      loadStorageImage(src, signed, isVideoSrc(src)).then((url) => {
        if (url) cache[src] = url
        loading.delete(src)
      }, () => loading.delete(src))
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

/**
 * 화면 밖(브라우저의 다른 일꾼)에서 줄이기: 디코드 · 크기 바꾸기는 createImageBitmap, 다시 저장은 OffscreenCanvas.
 * 화면을 그리는 쪽이 멈추지 않아요(6000×4000 사진에서 0.1~0.5초 멈추던 것). 지원하지 않는 브라우저면 null → 예전 방식
 */
async function fitOffThread(file: File, w: number, h: number, want: string): Promise<Blob | null> {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null
  // 다시 저장(JPEG · PNG 인코딩)은 화면 쪽에서 돌면 0.1초쯤 멈춰서, 줄이기 · 저장을 통째로 작업 스레드(Worker)에서 해요
  const url = URL.createObjectURL(new Blob([FIT_WORKER], { type: 'text/javascript' }))
  try {
    const worker = new Worker(url)
    try {
      return await new Promise<Blob | null>((resolve) => {
        worker.onmessage = (e: MessageEvent<{ blob: Blob | null }>) => resolve(e.data.blob)
        worker.onerror = () => resolve(null)
        worker.postMessage({ file, w, h, type: want, q: want === 'image/png' ? null : 0.92 })
      })
    } finally { worker.terminate() }
  } catch { return null } finally { URL.revokeObjectURL(url) }
}
/** 작업 스레드 코드: 디코드 · 크기 바꾸기(createImageBitmap) → 다시 저장(OffscreenCanvas). 크기 옵션을 무시하는 브라우저면 null → 예전 방식 */
const FIT_WORKER = `self.onmessage = async (e) => {
  const { file, w, h, type, q } = e.data
  try {
    const bmp = await createImageBitmap(file, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })
    if (bmp.width !== w || bmp.height !== h) { bmp.close(); self.postMessage({ blob: null }); return }
    const c = new OffscreenCanvas(w, h)
    c.getContext('bitmaprenderer').transferFromImageBitmap(bmp)
    self.postMessage({ blob: await c.convertToBlob(q == null ? { type } : { type, quality: q }) })
  } catch { self.postMessage({ blob: null }) }
}`

/** 4096px 넘는 이미지를 원본 형식 그대로 줄입니다. 줄일 필요가 없으면 원본 파일을 그대로 돌려줘요 */
async function fitImage(file: File, size: { w: number; h: number }): Promise<{ file: File; w: number; h: number }> {
  const long = Math.max(size.w, size.h)
  if (long <= IMAGE_MAX_PX || KEEP_AS_IS.test(file.type)) return { file, ...size }
  const k = IMAGE_MAX_PX / long
  const w = Math.max(1, Math.round(size.w * k)), h = Math.max(1, Math.round(size.h * k))
  const want0 = file.type in REENCODE ? file.type : 'image/png'
  const off = await fitOffThread(file, w, h, want0)
  if (off) {
    const ext = REENCODE[off.type as keyof typeof REENCODE] ?? 'png'
    return { file: new File([off], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: off.type || 'image/png' }), w, h }
  }
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

/** 뒤에서 올리는 중인 파일 수 — 0 이 아니면 창을 닫을 때 경고해요(다 올라가기 전에 닫으면 그 이미지가 비어요) */
export const pendingUploads = ref(0)

type Prepared = { src: string; w: number; h: number; video: boolean; done: Promise<void> }

/**
 * 이미지 · 영상 넣기(피그마처럼 바로 보이게): 크기 재기 · 4096 줄이기만 기다리고 바로 돌려줘요. 올리기는 뒤에서(done).
 * - src 는 올라갈 자리('storage://screens/…')를 미리 정해 두고, 그 주소를 내 컴퓨터 파일(blob)로 먼저 보여 줘요 —
 *   올린 뒤에도 같은 파일을 쓰니 다시 내려받지 않아요(다른 사람은 원래대로 서명 URL 로 받아요)
 * - done 이 실패하면(인터넷 끊김 등) 받는 쪽에서 레이어를 되돌리고 안내를 띄워요
 * - 미리보기 모드에서는 저장하지 않아요(이미지는 data URL, 영상은 blob URL)
 * 이미지는 긴 변이 4096px 를 넘으면 줄여서 올려요(피그마와 같아요). 한도를 넘으면 MediaTooLargeError
 */
export async function prepareImage(input: File, screenId: string, ctx: { supabase: Pick<SupabaseClient, 'storage'>; preview: boolean }): Promise<Prepared> {
  const video = isVideoFile(input)
  if (input.size > (video ? mediaLimit(input) : RAW_IMAGE_LIMIT)) throw new MediaTooLargeError()
  const natural = await naturalSize(input)
  const { file, ...size } = video ? { file: input, ...natural } : await fitImage(input, natural)
  if (file.size > mediaLimit(file)) throw new MediaTooLargeError()
  if (ctx.preview) {
    if (video) return { src: URL.createObjectURL(file) + '#video', ...size, video, done: Promise.resolve() }
    const src = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file) })
    return { src, ...size, video, done: Promise.resolve() }
  }
  const ext = (file.name.split('.').pop() || (video ? 'mp4' : 'png')).toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${screenId}/${crypto.randomUUID()}.${ext}`
  const src = `storage://screens/${path}`
  // 이 창에서는 이 주소를 내 파일로 바로 보여 줘요(서명 URL 을 받으러 가지 않아요). 페이지를 새로 열면 원래대로 받아요
  cache[src] = URL.createObjectURL(file)
  pendingUploads.value++
  const done = Promise.resolve(ctx.supabase.storage.from('screens').upload(path, file, { contentType: file.type || undefined, upsert: false }))
    .then(({ error }) => {
      if (error) throw error
      // 이 기기 보관함에도 넣어 둬요(다음에 열 때도 다시 받지 않게 — app/canvas/imageCache.ts)
      if (!video) keepStorageImage(src, file).catch(() => {})
    })
    .catch((e) => { URL.revokeObjectURL(cache[src]!); delete cache[src]; throw e })
    .finally(() => { pendingUploads.value-- })
  done.catch(() => {}) // 받는 쪽이 처리해요 — 처리하지 않은 거절 경고만 막아요
  return { src, ...size, video, done }
}

/** 다 올라간 뒤 돌려받기(올리기를 기다려야 하는 곳용). 보통은 prepareImage 로 바로 보여 주세요 */
export async function uploadImage(input: File, screenId: string, ctx: { supabase: Pick<SupabaseClient, 'storage'>; preview: boolean }): Promise<{ src: string; w: number; h: number; video: boolean }> {
  const { done, ...r } = await prepareImage(input, screenId, ctx)
  await done
  return r
}
