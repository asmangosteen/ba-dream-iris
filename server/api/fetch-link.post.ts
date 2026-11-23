/**
 * 링크 문서 본문 가져오기 — POST /api/fetch-link { url } → { title, text }
 * 서버에서 페이지를 받아 태그를 걷어내고 읽을 수 있는 글(제목 + 문단)만 돌려줍니다.
 * - http(s) 만, localhost · 사설/예약 IP 로 가는 주소는 막습니다(리다이렉트도 한 번씩 다시 검사)
 * - 8초 제한, 2MB 까지만 읽고, 쿠키 · 인증 헤더는 넘기지 않습니다
 * - 미리보기가 아니면 로그인한 멤버만 쓸 수 있습니다
 */
import { serverSupabaseUser } from '#supabase/server'

// @types/node 없이 쓰려고 이름 해석만 동적으로 불러옵니다
type Lookup = (host: string, opts: { all: true }) => Promise<{ address: string; family: number }[]>
const DNS_MODULE = 'node:dns/promises'
async function lookup(host: string): Promise<{ address: string }[]> {
  const dns = (await import(/* @vite-ignore */ DNS_MODULE)) as { lookup: Lookup }
  return dns.lookup(host, { all: true })
}
const V4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
/** 4 · 6 · 0(IP 아님) — node:net isIP 와 같은 뜻 */
function isIP(s: string): 0 | 4 | 6 {
  if (V4.test(s)) return 4
  if (s.includes(':') && /^[0-9a-f:.]+$/i.test(s)) return 6
  return 0
}

const TIMEOUT_MS = 8000
const MAX_BYTES = 2 * 1024 * 1024
const MAX_TEXT = 100_000
const MAX_REDIRECTS = 3

export default defineEventHandler(async (event) => {
  const preview = import.meta.dev && !!useRuntimeConfig(event).public.devPreview
  if (!preview) {
    const user = await serverSupabaseUser(event).catch(() => null)
    if (!user) throw createError({ statusCode: 401, statusMessage: '로그인이 필요해요' })
  }

  const body = await readBody<{ url?: unknown }>(event).catch(() => null)
  const raw = typeof body?.url === 'string' ? body.url.trim() : ''
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw createError({ statusCode: 400, statusMessage: '주소 형식을 확인해주세요' })
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS)
  let res: Response | null = null
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(url)
      res = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: { 'user-agent': 'IrisLinkFetcher/1.0', accept: 'text/html,application/xhtml+xml,text/plain;q=0.9' },
      })
      const loc = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && loc) {
        url = new URL(loc, url)
        res = null
        continue
      }
      break
    }
  } catch (e) {
    if (isH3Error(e)) throw e
    throw createError({ statusCode: 502, statusMessage: (e as Error)?.name === 'TimeoutError' ? '페이지가 너무 늦게 응답해요' : '페이지에 연결하지 못했어요' })
  }
  if (!res) throw createError({ statusCode: 502, statusMessage: '페이지가 너무 많이 이동해요' })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `페이지가 응답하지 않아요 (${res.status})` })

  const type = (res.headers.get('content-type') ?? '').toLowerCase()
  if (type && !/text\/html|application\/xhtml|text\/plain/.test(type)) {
    throw createError({ statusCode: 415, statusMessage: '웹 페이지가 아니에요' })
  }

  let bytes: Uint8Array
  try {
    bytes = await readCapped(res, MAX_BYTES)
  } catch {
    throw createError({ statusCode: 502, statusMessage: '페이지를 끝까지 읽지 못했어요' })
  }
  const html = decode(bytes, type)
  const isHtml = !type.includes('text/plain')
  const title = isHtml ? extractTitle(html) : ''
  const text = (isHtml ? htmlToText(html) : normalizeLines(html)).slice(0, MAX_TEXT)
  if (!text.trim()) throw createError({ statusCode: 422, statusMessage: '본문을 찾지 못했어요' })

  return { title: title || url.hostname, text }
})

// ---------------------------------------------------------------------------
// SSRF 막기
// ---------------------------------------------------------------------------
async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw createError({ statusCode: 400, statusMessage: 'http · https 주소만 가져올 수 있어요' })
  if (url.username || url.password) throw createError({ statusCode: 400, statusMessage: '계정 정보가 들어간 주소는 쓸 수 없어요' })
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || host === 'localhost' || /\.(localhost|local|internal|lan|home|test)$/.test(host)) {
    throw createError({ statusCode: 400, statusMessage: '내부 주소는 가져올 수 없어요' })
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host).catch(() => [] as { address: string }[])
  if (!addrs.length) throw createError({ statusCode: 400, statusMessage: '주소를 찾지 못했어요' })
  if (addrs.some((a) => isPrivateIp(a.address))) throw createError({ statusCode: 400, statusMessage: '내부 주소는 가져올 수 없어요' })
}

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase()
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIp(mapped[1]!)
  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number) as [number, number]
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
  }
  if (isIP(v) === 6) {
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('64:ff9b:')
  }
  return true
}

function isH3Error(e: unknown): boolean {
  return !!e && typeof e === 'object' && 'statusCode' in e
}

// ---------------------------------------------------------------------------
// 읽기 · 글자 꺼내기
// ---------------------------------------------------------------------------
async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const room = max - size
    if (value.byteLength >= room) {
      chunks.push(value.subarray(0, room))
      size = max
      await reader.cancel().catch(() => {})
      break
    }
    chunks.push(value)
    size += value.byteLength
  }
  const out = new Uint8Array(size)
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.byteLength }
  return out
}

function decode(bytes: Uint8Array, contentType: string): string {
  let charset = contentType.match(/charset=["']?([\w-]+)/)?.[1]
  if (!charset) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
    charset = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*>/i)?.[0]?.match(/content=["']([^"']*)["']/i)?.[1]
  const t = og ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
  return decodeEntities(t).replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** 따옴표 안의 '>' 까지 감안한 태그 속성 부분 */
const ATTRS = `(?:"[^"]*"|'[^']*'|[^'">])*`
const TAG = new RegExp(`<${ATTRS}>`, 'g')
const BLOCK_TAG = new RegExp(`<\\/?(?:p|div|section|article|li|ul|ol|h[1-6]|tr|table|blockquote|pre|dt|dd|figure|figcaption|hr)\\b${ATTRS}>`, 'gi')

function htmlToText(html: string): string {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|iframe|head|canvas|form|select|button|nav|footer|header|aside)\b[\s\S]*?<\/\1\s*>/gi, '')
  // 본문 영역이 있으면 그 안만 씁니다
  const main = h.match(new RegExp(`<(article|main)\\b${ATTRS}>([\\s\\S]*)<\\/\\1\\s*>`, 'i'))?.[2]
  if (main && main.replace(TAG, '').trim().length > 200) h = main
  h = h
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(BLOCK_TAG, '\n')
    .replace(/<\/t[dh]\s*>/gi, ' ')
    .replace(TAG, '')
  return normalizeLines(decodeEntities(h))
}

function normalizeLines(s: string): string {
  const out: string[] = []
  for (const line of s.replace(/\r\n?/g, '\n').split('\n')) {
    const t = line.replace(/[\t  ]+/g, ' ').trim()
    if (!t || out[out.length - 1] === t) continue
    out.push(t)
  }
  return out.join('\n').trim()
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', bull: '•' }
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}
