/* Corner smoothing 60% — Iris 화면 부품(.sq · .act · .float …)의 채우기 · 선을 figma-squircle 경로로 자릅니다.
   디자인 시스템 컴포넌트는 자체 Squircle 레이어를 쓰므로 여기서 다루지 않습니다. 작업 캔버스 안 화면에는 쓰지 않습니다.
   알고리즘: figma-squircle (MIT) — @ba-dream/design-system squircle-path 와 같은 식 */
function irisSquircle(): void {
  const w = window as unknown as { __irisSq?: boolean };
  if (w.__irisSq) return;
  w.__irisSq = true;
  const SEL = '.sq,.ib,.fld,.float,.seg-item,.rail-btn,.dd,.menu,.menu-item,.grp,.act,.field,.sqc';
  const S = 0.6;
  const f = (n: number) => n.toFixed(3);
  const corner = (r: number, budget: number) => {
    if (!r) return null;
    const sm = Math.min(S, budget / r - 1);
    const p = Math.min((1 + S) * r, budget);
    const arc = 90 * (1 - sm);
    const L = Math.sin((arc / 2) * Math.PI / 180) * r * Math.SQRT2;
    const p34 = r * Math.tan(((90 - arc) / 4) * Math.PI / 180);
    const beta = (45 * sm) * Math.PI / 180;
    const c = p34 * Math.cos(beta), d = c * Math.tan(beta);
    const b = (p - L - c - d) / 3, a = 2 * b;
    return { r, a, b, c, d, p, L };
  };
  /**
   * rev: 좌우로 뒤집어 그려요(같은 모양, 반대 방향). 테두리 고리(--sq-ring)의 안쪽 경로를 반대 방향으로 그려서
   * 채우기 규칙(evenodd · nonzero)과 상관없이 늘 고리만 남게 해요 — 규칙이 빠지면 상자 전체가 선 색(회색)으로 덮이던 문제
   */
  const path = (w: number, h: number, rad: number, x: number, y: number, rev = false): string => {
    const budget = Math.min(w, h) / 2;
    const k = corner(Math.min(rad, budget), budget);
    const X = (v: number) => f(rev ? 2 * x + w - v : v);
    const D = (v: number) => f(rev ? -v : v);
    if (!k) return 'M ' + X(x) + ' ' + f(y) + ' h ' + D(w) + ' v ' + f(h) + ' h ' + D(-w) + ' Z';
    const { r, a, b, c, d, p, L } = k, A = a + b + c, R = f(r) + ' ' + f(r) + ' 0 0 ' + (rev ? '0 ' : '1 ');
    return 'M ' + X(x + w - p) + ' ' + f(y) +
      ' c ' + D(a) + ' 0 ' + D(a + b) + ' 0 ' + D(A) + ' ' + f(d) + ' a ' + R + D(L) + ' ' + f(L) + ' c ' + D(d) + ' ' + f(c) + ' ' + D(d) + ' ' + f(b + c) + ' ' + D(d) + ' ' + f(A) +
      ' L ' + X(x + w) + ' ' + f(y + h - p) +
      ' c 0 ' + f(a) + ' 0 ' + f(a + b) + ' ' + D(-d) + ' ' + f(A) + ' a ' + R + D(-L) + ' ' + f(L) + ' c ' + D(-c) + ' ' + f(d) + ' ' + D(-(b + c)) + ' ' + f(d) + ' ' + D(-A) + ' ' + f(d) +
      ' L ' + X(x + p) + ' ' + f(y + h) +
      ' c ' + D(-a) + ' 0 ' + D(-(a + b)) + ' 0 ' + D(-A) + ' ' + f(-d) + ' a ' + R + D(-L) + ' ' + f(-L) + ' c ' + D(-d) + ' ' + f(-c) + ' ' + D(-d) + ' ' + f(-(b + c)) + ' ' + D(-d) + ' ' + f(-A) +
      ' L ' + X(x) + ' ' + f(y + p) +
      ' c 0 ' + f(-a) + ' 0 ' + f(-(a + b)) + ' ' + D(d) + ' ' + f(-A) + ' a ' + R + D(L) + ' ' + f(-L) + ' c ' + D(c) + ' ' + f(-d) + ' ' + D(b + c) + ' ' + f(-d) + ' ' + D(A) + ' ' + f(-d) + ' Z';
  };
  const last = new WeakMap<HTMLElement, string>(), seen = new WeakSet<HTMLElement>();
  const apply = (el: HTMLElement) => {
    // 글자 폭으로 크기가 정해지는 요소(토큰 칩 등)는 59.55px 처럼 소수점이라 offsetWidth(반올림)로 그리면 선이 어긋나요 → 실제 폭(회전 · 확대 중이면 offset 값)
    const br = el.getBoundingClientRect();
    const ow = Math.abs(br.width - el.offsetWidth) < 1 ? Math.round(br.width * 100) / 100 : el.offsetWidth;
    const oh = Math.abs(br.height - el.offsetHeight) < 1 ? Math.round(br.height * 100) / 100 : el.offsetHeight;
    if (!(ow > 0 && oh > 0)) return;
    const cs = getComputedStyle(el);
    const raw = cs.borderTopLeftRadius;
    let r = parseFloat(raw) || 0;
    if (raw.trim().endsWith('%')) r = Math.min(ow, oh) * r / 100;
    const lw = parseFloat(cs.getPropertyValue('--sq-line-w')) || 0;
    const key = ow + '|' + oh + '|' + r + '|' + lw;
    if (last.get(el) === key && (el.style.getPropertyValue('--sq-path') || el.style.getPropertyValue('--sq-clip'))) return;
    last.set(el, key);
    if (r <= 0) { el.removeAttribute('data-sq'); el.removeAttribute('data-sqc'); return; }
    // .sqc: 요소 자체를 squircle 로 자르기만(견본 · 썸네일 · 입력칸처럼 배경 · 그림을 직접 칠하는 요소)
    if (el.classList.contains('sqc')) {
      el.style.setProperty('--sq-clip', "path('" + path(ow, oh, r, 0, 0) + "')");
      if (!el.hasAttribute('data-sqc')) el.setAttribute('data-sqc', '');
      return;
    }
    const outer = path(ow, oh, r, 1, 1);
    el.style.setProperty('--sq-path', "path('" + outer + "')");
    el.style.setProperty('--sq-r', Math.min(r, Math.min(ow, oh) / 2) + 'px'); // 선(::after 안쪽 그림자)의 둥글기
    el.style.setProperty('--sq-ring', lw > 0 && ow > lw * 2 && oh > lw * 2 ? "path('" + outer + ' ' + path(ow - lw * 2, oh - lw * 2, Math.max(r - lw, 0), 1 + lw, 1 + lw, true) + "')" : 'inset(50%)');
    if (el.classList.contains('sq-clip')) el.style.setProperty('--sq-clip', "path('" + path(ow, oh, r, 0, 0) + "')");
    if (!el.hasAttribute('data-sq')) el.setAttribute('data-sq', '');
  };
  let raf = 0;
  const ro = new ResizeObserver((es) => es.forEach((e) => apply(e.target as HTMLElement)));
  const tick = () => {
    raf = 0;
    document.querySelectorAll<HTMLElement>(SEL).forEach((el) => { if (!seen.has(el)) { seen.add(el); ro.observe(el); } apply(el); });
  };
  // 문서 전체를 다시 훑는 건 대상(SEL)을 품은 요소가 새로 붙었거나 class 가 바뀔 때만. 크기 변화는 ResizeObserver 가 맡아요.
  // 대상 요소 자신의 style 만 바뀌면(선택 상자 아래 크기 표시 · 확대 % 버튼처럼 확대마다 자리만 바뀌는 것) 그 요소만 다시 계산해요 —
  // 캔버스를 확대 · 이동할 때마다 문서 전체를 훑으면 확대가 무거워져요
  const hasSq = (n: Node) => n instanceof Element && (n.matches(SEL) || !!n.querySelector(SEL));
  const own = new Set<HTMLElement>();
  let ownRaf = 0;
  const applyOwn = () => { ownRaf = 0; const els = [...own]; own.clear(); els.forEach((el) => { if (el.isConnected) apply(el); }); };
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'childList' ? [...m.addedNodes].some(hasSq) : m.attributeName === 'class') { if (!raf) raf = requestAnimationFrame(tick); return; }
      if (m.target instanceof HTMLElement && m.target.matches(SEL)) own.add(m.target);
    }
    if (own.size && !ownRaf) ownRaf = requestAnimationFrame(applyOwn);
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
  // :focus-within · :focus-visible 로 --sq-line-w 가 바뀌는 요소(입력칸 · 카드 포커스 선): 포커스가 옮겨질 때 조상 · 자손만 다시 계산
  const refocus = (e: Event) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    requestAnimationFrame(() => {
      for (let el = t.closest<HTMLElement>(SEL); el; el = el.parentElement?.closest<HTMLElement>(SEL) ?? null) apply(el);
      t.querySelectorAll<HTMLElement>(SEL).forEach(apply);
    });
  };
  document.addEventListener('focusin', refocus);
  document.addEventListener('focusout', refocus);
  tick();
  if (document.fonts) document.fonts.ready.then(tick);
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => irisSquircle())
})
