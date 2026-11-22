/* Corner smoothing 60% — Iris 화면 부품(.sq · .act · .float …)의 채우기 · 선을 figma-squircle 경로로 자릅니다.
   디자인 시스템 컴포넌트는 자체 Squircle 레이어를 쓰므로 여기서 다루지 않습니다. 작업 캔버스 안 화면에는 쓰지 않습니다.
   알고리즘: figma-squircle (MIT) — @ba-dream/design-system squircle-path 와 같은 식 */
function irisSquircle(): void {
  const w = window as unknown as { __irisSq?: boolean };
  if (w.__irisSq) return;
  w.__irisSq = true;
  const SEL = '.sq,.ib,.fld,.float,.seg-item,.rail-btn,.dd,.menu,.menu-item,.grp,.act,.field';
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
  const path = (w: number, h: number, rad: number, x: number, y: number): string => {
    const budget = Math.min(w, h) / 2;
    const k = corner(Math.min(rad, budget), budget);
    if (!k) return 'M ' + f(x) + ' ' + f(y) + ' h ' + f(w) + ' v ' + f(h) + ' h ' + f(-w) + ' Z';
    const { r, a, b, c, d, p, L } = k, A = a + b + c, R = f(r) + ' ' + f(r) + ' 0 0 1 ';
    return 'M ' + f(x + w - p) + ' ' + f(y) +
      ' c ' + f(a) + ' 0 ' + f(a + b) + ' 0 ' + f(A) + ' ' + f(d) + ' a ' + R + f(L) + ' ' + f(L) + ' c ' + f(d) + ' ' + f(c) + ' ' + f(d) + ' ' + f(b + c) + ' ' + f(d) + ' ' + f(A) +
      ' L ' + f(x + w) + ' ' + f(y + h - p) +
      ' c 0 ' + f(a) + ' 0 ' + f(a + b) + ' ' + f(-d) + ' ' + f(A) + ' a ' + R + f(-L) + ' ' + f(L) + ' c ' + f(-c) + ' ' + f(d) + ' ' + f(-(b + c)) + ' ' + f(d) + ' ' + f(-A) + ' ' + f(d) +
      ' L ' + f(x + p) + ' ' + f(y + h) +
      ' c ' + f(-a) + ' 0 ' + f(-(a + b)) + ' 0 ' + f(-A) + ' ' + f(-d) + ' a ' + R + f(-L) + ' ' + f(-L) + ' c ' + f(-d) + ' ' + f(-c) + ' ' + f(-d) + ' ' + f(-(b + c)) + ' ' + f(-d) + ' ' + f(-A) +
      ' L ' + f(x) + ' ' + f(y + p) +
      ' c 0 ' + f(-a) + ' 0 ' + f(-(a + b)) + ' ' + f(d) + ' ' + f(-A) + ' a ' + R + f(L) + ' ' + f(-L) + ' c ' + f(c) + ' ' + f(-d) + ' ' + f(b + c) + ' ' + f(-d) + ' ' + f(A) + ' ' + f(-d) + ' Z';
  };
  const last = new WeakMap<HTMLElement, string>(), seen = new WeakSet<HTMLElement>();
  const apply = (el: HTMLElement) => {
    const ow = el.offsetWidth, oh = el.offsetHeight;
    if (!(ow > 0 && oh > 0)) return;
    const cs = getComputedStyle(el);
    const raw = cs.borderTopLeftRadius;
    let r = parseFloat(raw) || 0;
    if (raw.trim().endsWith('%')) r = Math.min(ow, oh) * r / 100;
    const lw = parseFloat(cs.getPropertyValue('--sq-line-w')) || 0;
    const key = ow + '|' + oh + '|' + r + '|' + lw;
    if (last.get(el) === key && el.style.getPropertyValue('--sq-path')) return;
    last.set(el, key);
    if (r <= 0) { el.removeAttribute('data-sq'); return; }
    const outer = path(ow, oh, r, 1, 1);
    el.style.setProperty('--sq-path', "path('" + outer + "')");
    el.style.setProperty('--sq-ring', lw > 0 && ow > lw * 2 && oh > lw * 2 ? "path(evenodd, '" + outer + ' ' + path(ow - lw * 2, oh - lw * 2, Math.max(r - lw, 0), 1 + lw, 1 + lw) + "')" : 'inset(50%)');
    if (el.classList.contains('sq-clip')) el.style.setProperty('--sq-clip', "path('" + path(ow, oh, r, 0, 0) + "')");
    if (!el.hasAttribute('data-sq')) el.setAttribute('data-sq', '');
  };
  let raf = 0;
  const ro = new ResizeObserver((es) => es.forEach((e) => apply(e.target as HTMLElement)));
  const tick = () => {
    raf = 0;
    document.querySelectorAll<HTMLElement>(SEL).forEach((el) => { if (!seen.has(el)) { seen.add(el); ro.observe(el); } apply(el); });
  };
  new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(tick); }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
  tick();
  if (document.fonts) document.fonts.ready.then(tick);
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => irisSquircle())
})
