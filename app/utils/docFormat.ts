/**
 * 기획서 양식 읽기(3단계, PRD/11): AI 가 쓴 Markdown → 문서 블록(제목 · 문단 · 목록 · 표) → 정책 · 화면 칸 · 연결 · 경고.
 * 화면과 DB 를 모르는 순수 함수만 둬요(저장은 useIrisData 의 syncDocFormat).
 */

export type BlockType = 'h1' | 'h2' | 'p' | 'li' | 'table'
/** 문서 블록. 표는 rows(첫 줄이 머리), text 는 검색 · 미리보기용으로 칸을 이어 붙인 글 */
export interface FormatBlock { id: string; type: BlockType; text: string; rows?: string[][] }
type RawBlock = Omit<FormatBlock, 'id'>

// ---------------------------------------------------------------------------
// Markdown ↔ 블록
// ---------------------------------------------------------------------------
/** 굵게 · 기울임 · 코드 표시는 지우고 글만 남겨요(Iris 문서는 꾸밈 없이 블록으로 보여 줘요) */
function plain(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\\|/g, '|')
    .trim()
}
const isTableLine = (s: string) => /^\|.*\|$/.test(s)
const isDivider = (s: string) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(s)
function cells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  // '\|' 는 칸 나눔이 아니에요
  return inner.split(/(?<!\\)\|/).map((c) => plain(c))
}
/** 표 칸을 이어 붙인 글(검색 · plain_text · 옛 번호 찾기용) */
export const tableText = (rows: string[][]) => rows.map((r) => r.join(' | ')).join('\n')

/**
 * 줄 단위로 나눕니다: '# ' → h1, '## ' · '### ' → h2, '- ' · '* ' · '1. ' → li, '| … |' 줄 묶음 → 표, 나머지 → 문단(빈 줄로 구분)
 */
export function parseMarkdown(src: string): RawBlock[] {
  const out: RawBlock[] = []
  let para: string[] = []
  const flush = () => { if (para.length) out.push({ type: 'p', text: plain(para.join(' ')) }); para = [] }
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (!line) { flush(); continue }
    if (isTableLine(line)) {
      flush()
      const rows: string[][] = []
      let j = i
      for (; j < lines.length && isTableLine(lines[j]!.trim()); j++) {
        const l = lines[j]!.trim()
        if (isDivider(l)) continue
        rows.push(cells(l))
      }
      i = j - 1
      const width = Math.max(...rows.map((r) => r.length))
      const even = rows.map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill('')])
      if (even.length) out.push({ type: 'table', text: tableText(even), rows: even })
      continue
    }
    const m = line.match(/^(#{1,6}|[-*•]|\d+[.)])\s+(.*)$/)
    if (m) {
      flush()
      const t = plain(m[2]!)
      if (!t) continue
      const mark = m[1]!
      out.push({ type: mark === '#' ? 'h1' : mark.startsWith('#') ? 'h2' : 'li', text: t })
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush()
    } else para.push(line.replace(/^>\s?/, ''))
  }
  flush()
  return out
}

/** 블록을 다시 Markdown 으로. 문단 · 제목 앞뒤는 빈 줄, 이어지는 목록은 한 줄씩 */
export function blocksToMarkdown(blocks: RawBlock[]): string {
  let out = ''
  const esc = (c: string) => c.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  blocks.forEach((b, i) => {
    let line: string
    if (b.type === 'table') {
      const rows = b.rows?.length ? b.rows : [['']]
      const head = `| ${rows[0]!.map(esc).join(' | ')} |`
      const div = `| ${rows[0]!.map(() => '---').join(' | ')} |`
      line = [head, div, ...rows.slice(1).map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
    } else line = b.type === 'h1' ? `# ${b.text}` : b.type === 'h2' ? `## ${b.text}` : b.type === 'li' ? `- ${b.text}` : b.text
    if (i > 0) out += b.type === 'li' && blocks[i - 1]!.type === 'li' ? '\n' : '\n\n'
    out += line
  })
  return out
}

// ---------------------------------------------------------------------------
// ID 규칙(PRD/11 3장): 정책 P-영역-연번, 화면 C · A · S · N · CMP-번호
// ---------------------------------------------------------------------------
export type SlotKind = 'C' | 'A' | 'S' | 'N' | 'CMP'
export const SLOT_KINDS: SlotKind[] = ['C', 'A', 'S', 'N', 'CMP']
export const POLICY_RE = /\bP-([A-Z]{2,6})-(\d{1,4})\b/g
const POLICY_ONE = /^P-([A-Z]{2,6})-(\d{1,4})$/
/** 옛 약자 대응(프로젝트 설정 '문서 규칙'): { M: 'C', MA: 'A' } */
export type Aliases = Record<string, SlotKind>

function screenRe(aliases: Aliases = {}): RegExp {
  const prefixes = [...SLOT_KINDS, ...Object.keys(aliases)].sort((a, b) => b.length - a.length)
  return new RegExp(`\\b(${prefixes.join('|')})-(\\d{1,4})\\b`, 'g')
}
/** 글 속 정책 ID 들(나온 순서, 겹치지 않게) */
export function policyCodesIn(t: string): string[] {
  return [...new Set([...t.matchAll(POLICY_RE)].map((m) => m[0]))]
}
/** 글 속 화면 ID 들 — 옛 약자는 새 약자로 바꿔서(M-05 → C-05) */
export function screenCodesIn(t: string, aliases: Aliases = {}): string[] {
  const out: string[] = []
  for (const m of t.matchAll(screenRe(aliases))) {
    // 정책 ID 안쪽(P-ORD-05 의 ORD-05 등)은 건너뛰어요
    const before = t.slice(Math.max(0, (m.index ?? 0) - 1), m.index ?? 0)
    if (before === '-') continue
    const kind = (aliases[m[1]!] ?? m[1]) as SlotKind
    out.push(`${kind}-${m[2]}`)
  }
  return [...new Set(out)]
}
/** 칸 하나가 정확히 화면 ID 인지 — 'C-05', '몰 C-05', 'C-05 상품 상세' 의 앞 ID */
function leadScreen(cell: string, aliases: Aliases): { code: string; kind: SlotKind } | null {
  const m = cell.trim().match(new RegExp(`^(?:\\S{1,8}\\s)?(${[...SLOT_KINDS, ...Object.keys(aliases)].sort((a, b) => b.length - a.length).join('|')})-(\\d{1,4})\\b`))
  if (!m) return null
  const kind = (aliases[m[1]!] ?? m[1]) as SlotKind
  return { code: `${kind}-${m[2]}`, kind }
}
const leadPolicy = (cell: string) => cell.trim().match(/^P-[A-Z]{2,6}-\d{1,4}\b/)?.[0] ?? null
export const policyArea = (code: string) => code.match(POLICY_ONE)?.[1] ?? null

// ---------------------------------------------------------------------------
// 표기(PRD/11 4장)
// ---------------------------------------------------------------------------
export type Mark = 'default' | 'pending' | 'dev_check' | 'legal' | 'no_screen'
export const MARK_LABEL: Record<Mark, string> = { default: 'Default', pending: 'Pending decision', dev_check: 'Dev check', legal: 'Legal check', no_screen: 'No screen' }
export const MARK_ICON: Record<Mark, string> = { default: '〔〕', pending: '⏸', dev_check: '📌', legal: '⚖️', no_screen: '〔〕' }
export function marksIn(t: string): Mark[] {
  const out: Mark[] = []
  if (/〔\s*기본값\s*〕|\[\s*기본값\s*\]|〔\s*default\s*〕/i.test(t)) out.push('default')
  if (t.includes('⏸')) out.push('pending')
  if (t.includes('📌')) out.push('dev_check')
  if (t.includes('⚖')) out.push('legal')
  // 화면이 없는 정책(법무 고지 · 서버 규칙 등): 경고에서 빼고 반영률에서도 빼요
  if (/〔\s*화면\s*없음\s*〕|\[\s*화면\s*없음\s*\]|〔\s*no\s*screen\s*〕/i.test(t)) out.push('no_screen')
  return out
}
/** 정책 이름에서 표기 기호는 빼요(배지로 따로 보여 줘요) */
const stripMarks = (t: string) => t.replace(/〔[^〕]*〕|\[\s*화면\s*없음\s*\]|⏸️?|📌|⚖️?|✅/g, '').replace(/\s{2,}/g, ' ').trim()

// ---------------------------------------------------------------------------
// 양식 검사
// ---------------------------------------------------------------------------
export interface FoundPolicy { code: string; area: string | null; title: string; body: string; marks: Mark[]; block: string; row: number | null }
export interface FoundSlot { code: string; kind: SlotKind; name: string; spec: string; states: string[]; policyCodes: string[]; fromText: boolean; block: string; row: number }
export type WarnKind = 'missing_policy' | 'empty_policy_col' | 'no_screen' | 'duplicate'
/** 경고: 문구는 화면에서 tr 로 만들어요(code · other 를 끼워 넣어요) */
export interface FormatWarning { kind: WarnKind; code: string; other?: string; block: string; row: number | null }
export interface FormatResult {
  /** 'iris' = 정책 표 · 화면 표 둘 다, 'partial' = 하나만, 'none' = 못 찾음 */
  format: 'iris' | 'partial' | 'none'
  abbr: string | null
  status: 'draft' | 'review' | 'confirmed' | null
  version: string | null
  policies: FoundPolicy[]
  slots: FoundSlot[]
  links: number
  warnings: FormatWarning[]
}
/** DB documents.check_result 에 두는 모양 */
export interface CheckResult { policies: number; slots: number; links: number; format: FormatResult['format']; warnings: FormatWarning[] }

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
function col(head: string[], ...words: string[]): number {
  return head.findIndex((h) => words.some((w) => norm(h).includes(norm(w))))
}
const STATUS_WORDS: [RegExp, FormatResult['status']][] = [[/확정|confirm/i, 'confirmed'], [/검토|review/i, 'review'], [/초안|draft/i, 'draft']]

/** 문서 블록을 읽어 정책 · 화면 칸 · 연결 · 경고를 돌려줘요 */
export function analyzeDoc(blocks: FormatBlock[], aliases: Aliases = {}): FormatResult {
  const res: FormatResult = { format: 'none', abbr: null, status: null, version: null, policies: [], slots: [], links: 0, warnings: [] }
  const seenP = new Set<string>(), seenS = new Set<string>()
  let policyTable = false, screenTable = false

  for (const b of blocks) {
    if (b.type === 'table' && b.rows?.length) {
      const rows = b.rows
      const head = rows[0]!
      const body = rows.slice(1)
      // 문서 정보 표: 두 칸, 앞 칸이 '문서 약어' · '상태' · '버전'
      if (head.length <= 3) {
        for (const r of rows) {
          const k = norm(r[0] ?? ''), v = (r[1] ?? '').trim()
          if (!v) continue
          if (/약어|약자|abbr/.test(k)) res.abbr ??= v.slice(0, 8)
          else if (/^상태$|^status$/.test(k)) res.status ??= STATUS_WORDS.find(([re]) => re.test(v))?.[1] ?? null
          else if (/^버전$|^version$/.test(k)) res.version ??= v
        }
      }
      if (!body.length) continue
      let idCol = col(head, 'ID', '번호')
      if (idCol < 0) idCol = 0
      const ids = body.map((r) => r[idCol] ?? '')
      const pCount = ids.filter((c) => leadPolicy(c)).length
      const sCount = ids.filter((c) => leadScreen(c, aliases)).length
      if (pCount && pCount >= sCount) {
        policyTable = true
        const others = head.map((_, i) => i).filter((i) => i !== idCol)
        let tCol = col(head, '정책', 'policy', '이름', 'name', '제목', 'title')
        if (tCol === idCol || tCol < 0) tCol = others[0] ?? -1
        let dCol = col(head, '세부', '규칙', 'rule', '내용', 'detail', '설명', 'description')
        if (dCol === idCol || dCol === tCol || dCol < 0) dCol = others.find((i) => i !== tCol) ?? -1
        body.forEach((r, i) => {
          const code = leadPolicy(r[idCol] ?? '')
          if (!code) return
          const rawTitle = tCol >= 0 ? r[tCol] ?? '' : ''
          const rawBody = dCol >= 0 ? r[dCol] ?? '' : ''
          const restOfId = (r[idCol] ?? '').replace(code, '')
          if (seenP.has(code)) { res.warnings.push({ kind: 'duplicate', code, block: b.id, row: i + 1 }); return }
          seenP.add(code)
          res.policies.push({ code, area: policyArea(code), title: stripMarks(rawTitle) || stripMarks(rawBody).slice(0, 60) || code, body: rawBody, marks: marksIn(rawTitle + ' ' + rawBody + ' ' + restOfId), block: b.id, row: i + 1 })
        })
      } else if (sCount) {
        screenTable = true
        let nCol = col(head, '화면', 'screen', '이름', 'name')
        if (nCol === idCol) nCol = -1
        const sCol = col(head, '보여', 'show', '구성', '내용', 'spec', '설명')
        const stCol = col(head, '상태', 'state')
        const pCol = col(head, '정책', 'polic')
        body.forEach((r, i) => {
          const lead = leadScreen(r[idCol] ?? '', aliases)
          if (!lead) return
          if (seenS.has(lead.code)) { res.warnings.push({ kind: 'duplicate', code: lead.code, block: b.id, row: i + 1 }); return }
          seenS.add(lead.code)
          const spec = sCol >= 0 ? r[sCol] ?? '' : ''
          const fromCol = pCol >= 0 ? policyCodesIn(r[pCol] ?? '') : []
          const fromText = !fromCol.length ? policyCodesIn(spec) : []
          const name = (nCol >= 0 ? r[nCol] : (r[idCol] ?? '').replace(/^(?:\S{1,8}\s)?[A-Z]{1,3}-\d{1,4}\s*/, '')) ?? ''
          const states = stCol >= 0 ? (r[stCol] ?? '').split(/[,·、/\n]/).map((x) => x.trim()).filter((x) => x && !/^[-–—]$/.test(x)) : []
          res.slots.push({ code: lead.code, kind: lead.kind, name: name.trim() || lead.code, spec, states, policyCodes: fromCol.length ? fromCol : fromText, fromText: !fromCol.length && !!fromText.length, block: b.id, row: i + 1 })
        })
      }
    } else if ((b.type === 'li' || b.type === 'p') && leadPolicy(b.text)) {
      // 표 밖 '- P-ORD-05 배송지 확인 …' 줄도 정책으로
      const code = leadPolicy(b.text)!
      if (seenP.has(code)) continue
      seenP.add(code)
      const rest = b.text.slice(code.length).replace(/^[\s.:)\-–—]+/, '')
      res.policies.push({ code, area: policyArea(code), title: stripMarks(rest).slice(0, 60) || code, body: rest, marks: marksIn(rest), block: b.id, row: null })
    }
  }

  // 경고 · 연결 수
  const known = new Set(res.policies.map((p) => p.code))
  const used = new Set<string>()
  for (const s of res.slots) {
    if (!s.policyCodes.length) res.warnings.push({ kind: 'empty_policy_col', code: s.code, block: s.block, row: s.row })
    else if (s.fromText) res.warnings.push({ kind: 'empty_policy_col', code: s.code, other: s.policyCodes.join(', '), block: s.block, row: s.row })
    for (const c of s.policyCodes) {
      used.add(c)
      if (known.has(c)) res.links++
      else res.warnings.push({ kind: 'missing_policy', code: c, other: s.code, block: s.block, row: s.row })
    }
  }
  // 화면 표가 있는 문서에서만 '화면 없는 정책'을 알려요
  if (screenTable) for (const p of res.policies) if (!used.has(p.code) && !p.marks.includes('no_screen')) res.warnings.push({ kind: 'no_screen', code: p.code, block: p.block, row: p.row })
  res.format = policyTable && screenTable ? 'iris' : policyTable || screenTable || res.policies.length ? 'partial' : 'none'
  return res
}

export function toCheckResult(r: FormatResult): CheckResult {
  return { policies: r.policies.length, slots: r.slots.length, links: r.links, format: r.format, warnings: r.warnings }
}

/** 경고 한 줄 문구(영어 원문 열쇠 + 끼울 값). 화면에서 tr(key, vars) */
export function warningText(w: FormatWarning): { key: string; vars: Record<string, string> } {
  switch (w.kind) {
    case 'missing_policy': return { key: '{code} is used in {other} but isn’t in the policy table', vars: { code: w.code, other: w.other ?? '' } }
    case 'empty_policy_col': return w.other
      ? { key: '{code} has nothing in the Policy column — read {other} from its text instead', vars: { code: w.code, other: w.other } }
      : { key: '{code} has nothing in the Policy column', vars: { code: w.code } }
    case 'no_screen': return { key: '{code} has no screen', vars: { code: w.code } }
    case 'duplicate': return { key: '{code} appears more than once', vars: { code: w.code } }
  }
}

/** 경고를 없애는 방법(영어 원문 열쇠 + 끼울 값) — 문서를 [Edit] 로 고쳐서 없애요 */
export function warningFix(w: FormatWarning): { key: string; vars: Record<string, string> } {
  switch (w.kind) {
    case 'missing_policy': return { key: 'Add a {code} row to the policy table, or fix the ID in {other}', vars: { code: w.code, other: w.other ?? '' } }
    case 'empty_policy_col': return w.other
      ? { key: 'Write {other} in the Policy column of {code}', vars: { code: w.code, other: w.other } }
      : { key: 'Write the policy IDs this screen follows in the Policy column of {code}', vars: { code: w.code } }
    case 'no_screen': return { key: 'Add {code} to a screen’s Policy column — or if it has no screen, write 〔화면 없음〕 after the policy name', vars: { code: w.code } }
    case 'duplicate': return { key: 'Give one of the {code} rows a new number', vars: { code: w.code } }
  }
}

/** 화면 이름에서 화면 칸 ID · 상태 변형 읽기: 'C-05 상품 상세' → C-05, 'C-05/일시품절' → C-05 · 일시품절 */
export function slotFromName(name: string, aliases: Aliases = {}): { code: string; state: string | null } | null {
  const lead = leadScreen(name, aliases)
  if (!lead) return null
  const st = name.match(/^[^/]*\/\s*(.+)$/)?.[1]?.trim() ?? null
  return { code: lead.code, state: st || null }
}

/** ID 순서 비교: 종류(C → A → S → N → CMP) → 번호 */
export function compareCodes(a: string, b: string): number {
  const pa = a.match(/^([A-Z]+)-(\d+)/), pb = b.match(/^([A-Z]+)-(\d+)/)
  if (!pa || !pb) return pa ? -1 : pb ? 1 : a.localeCompare(b)
  const ka = SLOT_KINDS.indexOf(pa[1] as SlotKind), kb = SLOT_KINDS.indexOf(pb[1] as SlotKind)
  if (ka !== kb) return (ka < 0 ? 99 : ka) - (kb < 0 ? 99 : kb)
  return Number(pa[2]) - Number(pb[2])
}

/** 정책 ID 추천: 'P-OR' 를 치면 영역 ORD 의 다음 번호 + 이미 있는 것 */
export function suggestPolicyIds(typed: string, existing: string[]): { code: string; isNew: boolean }[] {
  const t = typed.trim().toUpperCase()
  if (!t.startsWith('P')) return []
  const m = t.match(/^P-?([A-Z]*)-?(\d*)$/)
  const area = m?.[1] ?? ''
  const areas = [...new Set(existing.map(policyArea).filter((x): x is string => !!x))].filter((a) => a.startsWith(area))
  const out: { code: string; isNew: boolean }[] = []
  for (const a of areas.slice(0, 3)) {
    const max = existing.filter((c) => policyArea(c) === a).reduce((n, c) => Math.max(n, Number(c.split('-')[2])), 0)
    out.push({ code: `P-${a}-${String(max + 1).padStart(2, '0')}`, isNew: true })
  }
  for (const c of existing.filter((c) => c.startsWith(t)).sort().slice(0, 6)) out.push({ code: c, isNew: false })
  return out
}
