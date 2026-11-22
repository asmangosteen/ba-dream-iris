/* 화면 위계 검사 (PRD/05_UI_GUIDE.md 4장)
   시안을 1440 × 900 으로 연 페이지의 개발자 도구 콘솔에 붙여 넣으면,
   예외 영역(작업 캔버스 · 컴포넌트 미리보기 · 장식)을 뺀 글자 크기와 컨트롤 높이 중 가이드를 벗어난 것을 보여 줍니다. */
(() => {
  const ex = (e) => e.closest('main[aria-label="캔버스"],[data-preview],[aria-hidden="true"]');
  const bad = [], titles = [];
  document.querySelectorAll('body *').forEach((e) => {
    if (ex(e) || !e.offsetWidth) return;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    const cs = getComputedStyle(e), k = cs.fontSize + '/' + cs.lineHeight;
    const code = /monospace|Menlo/.test(cs.fontFamily), avatar = e.offsetWidth <= 28 && cs.borderRadius === '50%';
    if (k === '16px/24px' && cs.fontWeight === '600') { titles.push(e.innerText.trim()); return; }
    if (k === '14px/22px' && (cs.fontWeight === '600' && e.closest('aside[aria-label="오른쪽 패널"]') || e.innerText.trim() === 'Iris')) return;
    if ((code && k === '11px/16px') || avatar) return;
    if (k !== '12px/18px' && k !== '12px/20px') bad.push(k + ' ' + e.innerText.trim().slice(0, 20));
  });
  const H = { act: [26, 32], ib: [28, 24], 'seg-item': [26], fld: [28, 26], dd: [28], field: [28, 32], 'nav-item': [28] };
  document.querySelectorAll('.act,.ib,.seg-item,.fld,.dd,.field,.nav-item').forEach((e) => {
    if (ex(e) || !e.offsetWidth) return;
    const c = [...e.classList].find((x) => H[x]), h = Math.round(e.getBoundingClientRect().height);
    if (!H[c].includes(h)) bad.push(c + ' 높이 ' + h + ' ' + e.innerText.trim().slice(0, 20));
  });
  if (titles.length > 1) bad.push('페이지 제목이 ' + titles.length + '개: ' + titles.join(', '));
  console.table(bad.length ? bad : ['위반 0개']);
  return bad;
})();
