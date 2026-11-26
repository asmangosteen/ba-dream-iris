/**
 * 받은 이미지를 이 기기에 보관해 두기(피그마처럼) — 두 번째로 열 때부터는 창고(Supabase)에서 다시 받지 않고 바로 떠요.
 *
 * - 창고의 이미지 파일은 한 번 올리면 바뀌지 않아요(이름이 매번 새 UUID · 덮어쓰기 없음). 그래서 주소('storage://…')가 같으면 같은 그림이에요.
 * - 서명 주소는 열 때마다 달라 브라우저 기본 캐시가 못 알아봐요 → 'storage://…' 이름표로 브라우저 Cache Storage 에 따로 보관해요.
 * - 보관본은 사본일 뿐이에요. 없거나 지워져도 창고에서 다시 받으면 돼서, 다른 사람이 못 보는 일은 생기지 않아요.
 * - 영상은 크고 끊어 받기(스트리밍)를 써서 보관하지 않아요.
 * - 너무 쌓이지 않게 MAX 개를 넘으면 오래된 것부터 지워요. 브라우저가 Cache Storage 를 못 쓰면(사생활 보호 모드 등) 그냥 서명 주소를 써요.
 * 데스크탑 앱에서도 앱 데이터 폴더에 그대로 남아요.
 */
const NAME = 'iris-images-v1'
const MAX = 400
/** 보관함 열쇠: 실제로 요청하지 않는 가짜 주소(storage 경로만 담아요) */
const keyOf = (src: string) => 'https://iris-image-cache.local/' + encodeURIComponent(src.replace('storage://', ''))

const box = () => (import.meta.client && 'caches' in window ? caches.open(NAME).catch(() => null) : Promise.resolve(null))

/** 보관본이 있으면 blob 주소, 없으면 null */
async function fromBox(src: string): Promise<string | null> {
  const c = await box()
  const res = await c?.match(keyOf(src)).catch(() => undefined)
  if (!res) return null
  const blob = await res.blob().catch(() => null)
  return blob && blob.size ? URL.createObjectURL(blob) : null
}

async function trim(c: Cache) {
  const keys = await c.keys()
  // keys() 는 넣은 순서 — 넘친 만큼 앞(오래된 것)부터
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) await c.delete(k)
}

/** 창고에서 받아 보관하고 blob 주소로. 받기에 실패하면(CORS 등) 서명 주소를 그대로 써요 */
async function fetchAndKeep(src: string, signedUrl: string): Promise<string> {
  try {
    const res = await fetch(signedUrl)
    if (!res.ok) return signedUrl
    const blob = await res.blob()
    const c = await box()
    if (c) {
      await c.put(keyOf(src), new Response(blob, { headers: { 'content-type': blob.type || 'application/octet-stream' } })).catch(() => {})
      trim(c).catch(() => {})
    }
    return URL.createObjectURL(blob)
  } catch {
    return signedUrl
  }
}

/**
 * 'storage://…' 이미지를 화면에 쓸 주소로: 보관본 → 없으면 서명 주소를 받아(getSignedUrl) 받고 보관.
 * 영상이면 보관하지 않고 서명 주소 그대로.
 */
export async function loadStorageImage(src: string, getSignedUrl: () => Promise<string | undefined>, video: boolean): Promise<string | undefined> {
  if (!video) {
    const hit = await fromBox(src)
    if (hit) return hit
  }
  const signed = await getSignedUrl()
  if (!signed || video) return signed
  return fetchAndKeep(src, signed)
}

/** 방금 올린 이미지를 바로 보관(올린 사람은 다시 받지 않아도 되게 — 올리기 쪽에서 불러요) */
export async function keepStorageImage(src: string, blob: Blob) {
  const c = await box()
  if (!c) return
  await c.put(keyOf(src), new Response(blob, { headers: { 'content-type': blob.type || 'application/octet-stream' } })).catch(() => {})
  trim(c).catch(() => {})
}
