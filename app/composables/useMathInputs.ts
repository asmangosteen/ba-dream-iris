/**
 * 숫자 칸 계산식(피그마와 같아요): 784-6 → 778, 100/3 → 33.33, (10+2)*3 → 36. 단위(%, °, px, x)는 그대로 붙여요.
 * 모든 숫자 칸(inputmode numeric · decimal)에서, 칸의 change 처리보다 먼저(문서 capture 단계) 값을 계산 결과로 바꿔 둬요
 */
const ALLOWED = /^[\d\s.+\-*/()]+$/

/** + - * / 와 괄호만 읽는 작은 계산기(eval 쓰지 않아요). 못 읽으면 null */
export function evalExpr(src: string): number | null {
  const s = src.replace(/\s+/g, '')
  let i = 0
  const num = (): number | null => {
    if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') return null; i++; return v }
    if (s[i] === '-') { i++; const v = num(); return v === null ? null : -v }
    if (s[i] === '+') { i++; return num() }
    const m = /^\d*\.?\d+/.exec(s.slice(i))
    if (!m) return null
    i += m[0].length
    return parseFloat(m[0])
  }
  const term = (): number | null => {
    let v = num()
    while (v !== null && (s[i] === '*' || s[i] === '/')) {
      const op = s[i++]
      const r = num()
      if (r === null) return null
      v = op === '*' ? v * r : r === 0 ? null : v / r
    }
    return v
  }
  function expr(): number | null {
    let v = term()
    while (v !== null && (s[i] === '+' || s[i] === '-')) {
      const op = s[i++]
      const r = term()
      if (r === null) return null
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  const v = expr()
  return v !== null && i === s.length && Number.isFinite(v) ? v : null
}

export function useMathInputs() {
  /** 칸에 들어갈 때의 값(% 를 지금 값의 비율로 계산할 때 써요) */
  const orig = new WeakMap<HTMLInputElement, string>()
  function onFocus(e: Event) { const t = e.target; if (t instanceof HTMLInputElement) orig.set(t, t.value) }
  function onChange(e: Event) {
    const t = e.target
    if (!(t instanceof HTMLInputElement)) return
    if (t.inputMode !== 'numeric' && t.inputMode !== 'decimal') return
    // 지금 값이 % 가 아닌 칸(W · H · X · Y 등)에 50% 를 넣으면 지금 값의 50%(피그마와 같아요: W 50 → 50% → 25)
    const pct = /^\s*(\d*\.?\d+)\s*%\s*$/.exec(t.value)
    const was = orig.get(t) ?? ''
    if (pct && !/%/.test(was) && /^\s*-?\d*\.?\d+\s*$/.test(was)) { t.value = String(Math.round(parseFloat(was) * parseFloat(pct[1]!)) / 100); return }
    const m = /^(.*?)(\s*(?:%|°|px|x))?\s*$/.exec(t.value)
    const body = m?.[1] ?? ''
    // 계산식일 때만: 맨 앞 부호를 뺀 자리에 연산자가 있어야 해요
    if (!ALLOWED.test(body) || !/[+\-*/]/.test(body.trim().replace(/^[-+]/, ''))) return
    const v = evalExpr(body)
    if (v === null) return
    t.value = String(Math.round(v * 100) / 100) + (m?.[2]?.trim() ?? '')
  }
  onMounted(() => { document.addEventListener('change', onChange, true); document.addEventListener('focusin', onFocus, true) })
  onBeforeUnmount(() => { document.removeEventListener('change', onChange, true); document.removeEventListener('focusin', onFocus, true) })
}
