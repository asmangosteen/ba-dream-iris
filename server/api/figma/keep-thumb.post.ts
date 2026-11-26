// 피그마 썸네일을 Iris 저장소(Storage 'screens')에 보관 (서버 전용)
// 피그마 이미지 주소(S3)는 시간이 지나면 만료돼서, 가져오기 · 다시 불러오기 때 이미지를 복사해 두고 'storage://' 주소를 돌려줘요.
// 아무 주소나 받지 않게 피그마 이미지 서버 주소만 받아요(서버가 다른 곳을 대신 열지 않도록)
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

const ALLOWED = [/\.figma\.com$/i, /^figma-alpha-api\.s3\.[\w-]+\.amazonaws\.com$/i, /\.amazonaws\.com$/i]

export default defineEventHandler(async (event): Promise<{ path: string }> => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  const body = await readBody<{ url?: unknown; fileKey?: unknown; nodeId?: unknown }>(event).catch(() => null)
  const url = typeof body?.url === 'string' ? body.url : ''
  const fileKey = typeof body?.fileKey === 'string' ? body.fileKey.replace(/[^\w-]/g, '') : ''
  const nodeId = typeof body?.nodeId === 'string' ? body.nodeId.replace(/[^\w-]/g, '-') : ''
  let host = ''
  try { const u = new URL(url); if (u.protocol !== 'https:') throw new Error('protocol'); host = u.hostname } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid image URL' }) }
  if (!fileKey || !nodeId || !ALLOWED.some((r) => r.test(host))) throw createError({ statusCode: 400, statusMessage: 'Not a Figma image URL' })

  const res = await fetch(url)
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: 'Could not download the Figma image' })
  const type = res.headers.get('content-type') || 'image/png'
  if (!type.startsWith('image/')) throw createError({ statusCode: 502, statusMessage: 'Not an image' })
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > 15 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Image too large' })

  const path = `figma/${fileKey}/${nodeId}-${Date.now()}.png`
  const supabase = await serverSupabaseClient(event)
  const { error } = await supabase.storage.from('screens').upload(path, buf, { contentType: type, upsert: false })
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not store the image' })
  return { path: `storage://screens/${path}` }
})
