import { Comment, Fragment, Text, type ComponentInternalInstance, type VNode } from 'vue'
import type { SubOverride } from '~/canvas/schema'

/**
 * 디자인 시스템 인스턴스의 하위 구조(읽기 전용 — 피그마 인스턴스 하위 레이어처럼).
 * 인스턴스는 실제 Vue 컴포넌트를 그려서 Iris 레이어로는 저장돼 있지 않아요 → 캔버스에 그려진 컴포넌트(InstanceView 가 등록)를 읽어서
 * 하위 컴포넌트(Button · Icon …) · 글자 줄을 만들어요. 감싸기만 하는 div 는 건너뛰어요(피그마처럼 의미 있는 것만)
 */
export interface SubNode { kind: 'component' | 'text' | 'icon'; name: string; el: Element | null; children: SubNode[]; key: string; /** 글자 줄: 글자 자체(Text 노드) — 글자 덮어쓰기에 */ tnode?: Node | null }

/** 화면:레이어 → 그 인스턴스가 그린 디자인 시스템 컴포넌트(내부 인스턴스) */
const registry = new Map<string, () => ComponentInternalInstance | null>()
/** 인스턴스가 다시 그려지면 올라가요(레이어 목록이 하위 줄을 새로 읽게) */
export const instTick = ref(0)
/** 레이어 목록 하위 줄에 마우스를 올렸을 때 캔버스에서 강조할 요소 */
export const subHover = shallowRef<Element | null>(null)

export const instKey = (sid: string, id: string) => `${sid}:${id}`
export function registerInstance(key: string, get: () => ComponentInternalInstance | null) { registry.set(key, get); instTick.value++ }
export function unregisterInstance(key: string) { registry.delete(key); instTick.value++ }

/** 흐름만 돕고 보이지 않는 컴포넌트는 건너뛰고 안쪽만 */
/** 디자인 시스템 안에서 모양만 그리는 도우미(Squircle 바탕 등)도 줄로 보이지 않게 */
const SKIP = new Set(['Transition', 'TransitionGroup', 'BaseTransition', 'KeepAlive', 'Teleport', 'Suspense', 'RouterLink', 'NuxtLink', 'ClientOnly', 'Squircle', 'SquircleLayer'])
const elOf = (n: Node | null | undefined): Element | null => {
  let c: Node | null | undefined = n
  while (c && c.nodeType !== 1) c = c.nextSibling
  return (c as Element | null) ?? null
}
function walk(v: unknown, out: SubNode[], path: string) {
  if (!v || typeof v !== 'object') return
  if (Array.isArray(v)) { v.forEach((c, i) => walk(c, out, `${path}.${i}`)); return }
  const vn = v as VNode
  if (vn.component) {
    const c = vn.component
    const t = c.type as { name?: string; __name?: string }
    const name = t.name || t.__name || 'Component'
    const kids: SubNode[] = []
    walk(c.subTree, kids, `${path}>`)
    if (SKIP.has(name)) { out.push(...kids); return }
    out.push({ kind: /Icon$/.test(name) ? 'icon' : 'component', name, el: elOf(c.subTree?.el as Node | null), children: /Icon$/.test(name) ? [] : kids, key: path })
    return
  }
  if (vn.type === Comment) return
  if (vn.type === Text) {
    const s = String(vn.children ?? '').trim()
    if (s) out.push({ kind: 'text', name: s.slice(0, 40), el: (vn.el as Node | null)?.parentElement ?? null, children: [], key: path, tnode: vn.el as Node | null })
    return
  }
  if (vn.type === Fragment) { walk(vn.children, out, path); return }
  if (typeof vn.type === 'string') {
    if (vn.type === 'svg') { out.push({ kind: 'icon', name: 'Icon', el: vn.el as Element, children: [], key: path }); return }
    if (typeof vn.children === 'string') {
      const s = vn.children.trim()
      if (s) out.push({ kind: 'text', name: s.slice(0, 40), el: vn.el as Element, children: [], key: path, tnode: (vn.el as Element | null)?.firstChild ?? null })
      return
    }
    walk(vn.children, out, path)
    return
  }
  if (Array.isArray(vn.children)) walk(vn.children, out, path)
}
/** 그린 컴포넌트(내부 인스턴스)의 하위 구조 */
export function treeOf(inst: ComponentInternalInstance | null | undefined): SubNode[] {
  if (!inst) return []
  const out: SubNode[] = []
  walk(inst.subTree, out, 'r')
  return out
}
/** 인스턴스 하위 구조(맨 위 = 그 컴포넌트 안쪽). 아직 안 그려졌으면 빈 목록 */
export const readInstanceTree = (sid: string, id: string): SubNode[] => treeOf(registry.get(instKey(sid, id))?.())

/** 레이어 목록에서 고른 하위 줄(오른쪽 패널이 그 줄의 글자 · 색 · 칠을 보여 줘요) */
export const subSel = shallowRef<{ sid: string; id: string; key: string; kind: SubNode['kind']; name: string } | null>(null)

/**
 * 덮어쓰기 입히기(그린 뒤마다): 숨김 = display none, 글자 색 = color(아이콘은 currentColor 라 함께), 칠 = background, 글자 = 글자 노드 내용.
 * 이름은 레이어 목록에만 써요
 */
export function applyOverrides(tree: SubNode[], ov: Record<string, SubOverride> | undefined, color: (v?: string) => string | undefined) {
  if (!ov) return
  const map = new Map<string, SubNode>()
  const visit = (l: SubNode[]) => { for (const n of l) { map.set(n.key, n); visit(n.children) } }
  visit(tree)
  for (const [k, o] of Object.entries(ov)) {
    const n = map.get(k)
    if (!n) continue
    if (o.text !== undefined) { if (n.tnode) n.tnode.textContent = o.text; else if (n.el) n.el.textContent = o.text }
    const el = n.el as HTMLElement | null
    if (!el?.style) continue
    if (o.hidden) { if (n.kind === 'text' && n.tnode) n.tnode.textContent = ''; else el.style.display = 'none' }
    if (o.color) el.style.color = color(o.color) ?? o.color
    if (o.fill) el.style.backgroundColor = color(o.fill) ?? o.fill
  }
}

/** 하위 줄의 화면 위 자리(글자는 글자 자체 크기) */
export function subRect(n: SubNode): DOMRect | null {
  if (n.kind === 'text' && n.tnode) { const r = document.createRange(); r.selectNodeContents(n.tnode); return r.getBoundingClientRect() }
  return n.el?.getBoundingClientRect() ?? null
}
/** 캔버스에서 누른 자리(화면 좌표)의 하위 줄 — 글자를 먼저, 없으면 가장 안쪽 컴포넌트 */
export function subAt(sid: string, id: string, x: number, y: number): SubNode | null {
  const all: SubNode[] = []
  const visit = (l: SubNode[]) => { for (const n of l) { all.push(n); visit(n.children) } }
  visit(readInstanceTree(sid, id))
  const hit = (n: SubNode) => { const r = subRect(n); return !!r && r.width > 0 && x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2 }
  return all.filter((n) => n.kind === 'text').reverse().find(hit) ?? all.filter((n) => n.kind !== 'text').reverse().find(hit) ?? null
}
/** 캔버스에서 두 번 눌러 고치는 인스턴스 글자(InstanceTextEdit 가 그 자리에 입력칸을 띄워요) */
export const instEdit = shallowRef<{ sid: string; id: string; key: string } | null>(null)
