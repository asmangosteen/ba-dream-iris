/**
 * virtual:iris-ds-props — 디자인 시스템 컴포넌트 속성 목록(인스턴스 속성 패널용)
 *
 * @ba-dream/design-system 은 사내 전용이라 소스나 생성 결과를 저장소에 넣지 않습니다.
 * 대신 빌드 · 개발 서버가 뜰 때 node_modules 의 .vue.d.ts 를 TypeScript 컴파일러로 읽어 그 자리에서 만듭니다.
 * - 문자열 리터럴 유니온(다른 파일에서 가져온 별칭, `(typeof X)[number]` 같은 readonly 배열 포함)은 checker 가 풀어 줍니다
 * - 기본값은 d.ts 에 없어서 화면에서 런타임 컴포넌트(`DS[name].props[key].default`)로 채웁니다
 */
// node: 모듈 타입(@types/node)이 없어 파일 읽기 · 경로 찾기는 TypeScript 의 ts.sys 로 합니다
import ts from 'typescript'
import type { Plugin } from 'vite'

export type DsPropKind = 'enum' | 'boolean' | 'string' | 'number' | 'other'
export interface DsPropMeta {
  name: string
  kind: DsPropKind
  /** enum 선택지 — 숫자 리터럴 유니온이면 숫자 그대로 */
  options?: (string | number)[]
  default?: unknown
  /** JSDoc 첫 줄 */
  doc?: string
  /** true 면 속성이 아니라 슬롯(글자로 채우는 default 슬롯) */
  slot?: boolean
}

const ID = 'virtual:iris-ds-props'
const RESOLVED = '\0' + ID

let cache: Record<string, DsPropMeta[]> | null = null

/** index.d.ts 의 `export { default as X } from './components/…vue'` → { X: 절대 경로(.vue.d.ts) } */
function exportFiles(indexDts: string) {
  const dist = indexDts.slice(0, indexDts.lastIndexOf('/'))
  const src = ts.sys.readFile(indexDts) ?? ''
  const out: Record<string, string> = {}
  for (const m of src.matchAll(/export\s*\{\s*default as (\w+)\s*\}\s*from\s*'\.\/([^']+\.vue)'/g)) out[m[1]!] = `${dist}/${m[2]!}.d.ts`
  return out
}

const TEXT_SLOT = /라벨|글자|문구|텍스트|제목|이름|주 글|칸 글|글 칸|상세|날짜|\b(Text|Label)\b/
const CONTENT_SLOT = /넣|\]\s*들/
const firstLine = (s: string) => s.split('\n').map((l) => l.trim()).find(Boolean)?.replace(/\*\*/g, '').replace(/`/g, '')

function kindOf(checker: ts.TypeChecker, raw: ts.Type): Pick<DsPropMeta, 'kind' | 'options'> {
  const t = checker.getNonNullableType(raw)
  const parts = t.isUnion() ? t.types : [t]
  const F = ts.TypeFlags
  const has = (f: ts.TypeFlags) => parts.some((p) => p.flags & f)
  const only = (f: ts.TypeFlags) => parts.every((p) => p.flags & f)
  if (only(F.BooleanLiteral | F.Boolean)) return { kind: 'boolean' }
  if (only(F.StringLiteral)) return { kind: 'enum', options: parts.map((p) => (p as ts.StringLiteralType).value) }
  if (only(F.NumberLiteral)) return { kind: 'enum', options: parts.map((p) => (p as ts.NumberLiteralType).value) }
  if (only(F.StringLiteral | F.NumberLiteral)) return { kind: 'enum', options: parts.map((p) => (p as ts.StringLiteralType | ts.NumberLiteralType).value) }
  if (parts.some((p) => p.flags & F.Object)) return { kind: 'other' }
  if (has(F.Number | F.NumberLiteral) && !has(F.BooleanLiteral | F.Boolean)) return { kind: 'number' }
  // 'a' | 'b' | (string & {}) 같은 "자유 입력 + 추천값" 도 글자 입력으로 봅니다
  const stringish = (p: ts.Type): boolean => !!(p.flags & (F.String | F.StringLiteral)) || (p.isIntersection() && p.types.some((x) => x.flags & F.String))
  if (parts.every(stringish)) return { kind: 'string' }
  return { kind: 'other' }
}

/** 선택지를 d.ts 에 적힌 순서대로 — checker 의 유니온은 순서가 섞여서, 타입 노드(별칭 · `(typeof X)[number]`)를 따라가며 모읍니다 */
function declaredOrder(checker: ts.TypeChecker, node: ts.TypeNode | undefined, depth = 0): (string | number)[] {
  if (!node || depth > 8) return []
  const next = (n: ts.TypeNode | undefined) => declaredOrder(checker, n, depth + 1)
  const declOf = (n: ts.Node) => {
    let s = checker.getSymbolAtLocation(n)
    if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s)
    return s?.declarations?.[0]
  }
  if (ts.isLiteralTypeNode(node)) {
    if (ts.isStringLiteral(node.literal)) return [node.literal.text]
    if (ts.isNumericLiteral(node.literal)) return [Number(node.literal.text)]
    return []
  }
  if (ts.isUnionTypeNode(node)) return node.types.flatMap(next)
  if (ts.isParenthesizedTypeNode(node) || ts.isTypeOperatorNode(node)) return next(node.type)
  if (ts.isTupleTypeNode(node)) return node.elements.flatMap((e) => next(ts.isNamedTupleMember(e) ? e.type : e))
  if (ts.isTypeReferenceNode(node)) {
    const d = declOf(ts.isQualifiedName(node.typeName) ? node.typeName.right : node.typeName)
    return d && ts.isTypeAliasDeclaration(d) ? next(d.type) : []
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    let obj = node.objectType
    while (ts.isParenthesizedTypeNode(obj)) obj = obj.type
    if (ts.isTypeQueryNode(obj)) {
      const d = declOf(ts.isQualifiedName(obj.exprName) ? obj.exprName.right : obj.exprName)
      if (d && ts.isVariableDeclaration(d)) return next(d.type)
    }
  }
  return []
}

/** `__VLS_WithSlots<DefineComponent<P…>, S>` · `DefineComponent<P…>` · `typeof __VLS_base` 에서 [P, S] 타입 노드를 꺼냅니다 */
function componentTypeArgs(sf: ts.SourceFile): { props?: ts.TypeNode; slots?: ts.TypeNode } {
  const decls = new Map<string, ts.TypeNode>()
  sf.forEachChild((st) => {
    if (!ts.isVariableStatement(st)) return
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.type) decls.set(d.name.text, d.type)
  })
  const defineArgs = (n: ts.TypeNode | undefined): ts.TypeNode | undefined => {
    if (!n) return
    if (ts.isTypeQueryNode(n) && ts.isIdentifier(n.exprName)) return defineArgs(decls.get(n.exprName.text))
    if (ts.isImportTypeNode(n) || ts.isTypeReferenceNode(n)) return n.typeArguments?.[0]
  }
  const exp = decls.get('__VLS_export')
  if (!exp) return {}
  if (ts.isTypeReferenceNode(exp) && ts.isIdentifier(exp.typeName) && exp.typeName.text === '__VLS_WithSlots') {
    return { props: defineArgs(exp.typeArguments?.[0]), slots: exp.typeArguments?.[1] }
  }
  return { props: defineArgs(exp) }
}

export function buildDsProps(): Record<string, DsPropMeta[]> {
  if (cache) return cache
  const options: ts.CompilerOptions = {
    strict: true, noEmit: true, skipLibCheck: true, types: [],
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  }
  const from = ts.sys.resolvePath(ts.sys.getCurrentDirectory()) + '/package.json'
  const indexDts = ts.resolveModuleName('@ba-dream/design-system', from, options, ts.sys).resolvedModule?.resolvedFileName
  if (!indexDts) return (cache = {})
  const files = exportFiles(indexDts)
  const program = ts.createProgram([...new Set(Object.values(files))], options)
  const checker = program.getTypeChecker()
  const out: Record<string, DsPropMeta[]> = {}
  for (const [name, file] of Object.entries(files)) {
    const sf = program.getSourceFile(file)
    if (!sf) continue
    const { props, slots } = componentTypeArgs(sf)
    const list: DsPropMeta[] = []
    if (props) {
      for (const sym of checker.getTypeFromTypeNode(props).getProperties()) {
        const decl = sym.valueDeclaration ?? sym.declarations?.[0]
        const t = checker.getTypeOfSymbolAtLocation(sym, decl ?? sf)
        const doc = firstLine(ts.displayPartsToString(sym.getDocumentationComment(checker)))
        const k = kindOf(checker, t)
        if (k.kind === 'other') continue // 객체 · 함수 · 이벤트는 캔버스에서 고치지 않아요(번들도 가볍게)
        if (k.options && decl && (ts.isPropertySignature(decl) || ts.isPropertyDeclaration(decl))) {
          const order = declaredOrder(checker, decl.type).filter((v, i, a) => a.indexOf(v) === i && k.options!.includes(v))
          k.options = [...order, ...k.options.filter((v) => !order.includes(v))]
        }
        list.push({ name: sym.name, ...k, ...(doc ? { doc } : {}) })
      }
    }
    // 글자를 넣는 default 슬롯(버튼 라벨 · 칩 라벨 등)만 글자 입력으로 엽니다. 다른 컴포넌트를 넣는 슬롯은 빼요
    if (slots) {
      const def = checker.getTypeFromTypeNode(slots).getProperty('default')
      const doc = def && firstLine(ts.displayPartsToString(def.getDocumentationComment(checker)))
      if (def && (doc ? TEXT_SLOT.test(doc) && !CONTENT_SLOT.test(doc) : /Button$/.test(name))) list.push({ name: 'default', kind: 'string', slot: true, ...(doc ? { doc } : {}) })
    }
    out[name] = list
  }
  cache = out
  return out
}

/**
 * virtual:iris-ds-icons — 디자인 시스템 아이콘 이름 목록(종류별). 패키지가 목록을 내보내지 않아서,
 * dist/index.js 의 아이콘 파일 지도('…/icons/default/<종류>/<크기>px/<이름>.svg')에서 이름을 모읍니다
 */
const ICON_ID = 'virtual:iris-ds-icons'
const ICON_RESOLVED = '\0' + ICON_ID
function buildDsIcons(): Record<string, string[]> {
  const options: ts.CompilerOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext }
  const from = ts.sys.resolvePath(ts.sys.getCurrentDirectory()) + '/package.json'
  const indexDts = ts.resolveModuleName('@ba-dream/design-system', from, options, ts.sys).resolvedModule?.resolvedFileName
  if (!indexDts) return {}
  const js = ts.sys.readFile(indexDts.replace(/index\.d\.ts$/, 'index.js')) ?? ''
  const out: Record<string, Set<string>> = {}
  for (const m of js.matchAll(/icons\/default\/([a-z]+)\/\d+px\/([^/"']+)\.svg/g)) (out[m[1]!] ??= new Set()).add(m[2]!)
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]))
}

export default function dsPropsPlugin(): Plugin {
  return {
    name: 'iris-ds-props',
    resolveId(id) {
      if (id === ID) return RESOLVED
      if (id === ICON_ID) return ICON_RESOLVED
    },
    load(id) {
      if (id === RESOLVED) return `export default ${JSON.stringify(buildDsProps())}`
      if (id === ICON_RESOLVED) return `export default ${JSON.stringify(buildDsIcons())}`
    },
  }
}
