import type { CanvasBase } from './types'

type Ctx = CanvasBase

/** 픽셀 격자(400% 부터) · 픽셀에 맞추기 */
export function usePixelGrid(canvas: Ctx) {
  const { props, store, el, vp } = canvas
  /**
   * 픽셀 격자(피그마와 같아요): 400% 부터 서서히 나타나 800% 에서 다 보여요. 캔버스 · 화면 · 레이어 모두 위에 1px 선.
   * 선은 흰색을 difference 로 섞어서 밝은 바탕에선 살짝 어둡게, 어두운 바탕에선 살짝 밝게 — 어떤 배경 · 내용 위에서도 은은하게 보여요.
   */
  const PX_FROM = 4, PX_FULL = 8
  /** 격자가 보이는 정도: 400% 에서 0 → 800% 에서 1 (꺼져 있거나 400% 미만이면 0) */
  // 픽셀에 맞추기(Snap to pixel grid ⇧⌘', 피그마와 같아요): 격자 보이기(Pixel grid)와 따로 — 끄면 소수점 이동 · 크기
  watch(() => props.snapPixel, (v) => { store.pixelSnap.value = v !== false }, { immediate: true })
  const pxAlpha = computed(() => (props.pixelGrid === false ? 0 : Math.max(0, Math.min(1, (vp.value.zoom - PX_FROM) / (PX_FULL - PX_FROM)))))
  /**
   * 픽셀 격자는 <canvas> 에 직접 그려요: 선마다 기기 픽셀 1칸에 딱 맞춰서(피그마와 같아요) — 배율이 딱 떨어지지 않아도 선 진하기가 고르게.
   * 두 장: 흰 선(difference) · 중간 회색 선(보통). 아래 CSS 주석 참고
   */
  const pxDif = ref<HTMLCanvasElement | null>(null)
  const pxMid = ref<HTMLCanvasElement | null>(null)
  let pxRaf = 0
  function drawPx() {
    pxRaf = 0
    const host = el.value
    const cvs = [pxDif.value, pxMid.value]
    if (!host || cvs.some((c) => !c)) return
    const dpr = window.devicePixelRatio || 1
    const W = Math.round(host.clientWidth * dpr), H = Math.round(host.clientHeight * dpr)
    const { x, y, zoom: z } = vp.value
    const colors = ['rgb(255 255 255 / 5%)', 'rgb(128 128 128 / 6%)']
    cvs.forEach((c, k) => {
      if (c!.width !== W || c!.height !== H) { c!.width = W; c!.height = H }
      const g = c!.getContext('2d')!
      g.clearRect(0, 0, W, H)
      g.fillStyle = colors[k]!
      // 화면에 보이는 캔버스 정수 좌표마다 세로 · 가로 선 1 기기 픽셀
      const x0 = Math.ceil(-x / z), x1 = Math.floor((host.clientWidth - x) / z)
      for (let i = x0; i <= x1; i++) g.fillRect(Math.round((x + i * z) * dpr), 0, 1, H)
      const y0 = Math.ceil(-y / z), y1 = Math.floor((host.clientHeight - y) / z)
      for (let i = y0; i <= y1; i++) g.fillRect(0, Math.round((y + i * z) * dpr), W, 1)
    })
  }
  const pxOn = computed(() => pxAlpha.value > 0)
  watch([() => vp.value.x, () => vp.value.y, () => vp.value.zoom, pxOn], () => { if (pxOn.value && !pxRaf) pxRaf = requestAnimationFrame(() => nextTick(drawPx)) }, { immediate: true })
  const onPxResize = () => { if (pxOn.value && !pxRaf) pxRaf = requestAnimationFrame(drawPx) }
  onMounted(() => window.addEventListener('resize', onPxResize))
  onBeforeUnmount(() => { window.removeEventListener('resize', onPxResize); if (pxRaf) cancelAnimationFrame(pxRaf) })
  return { pxAlpha, pxDif, pxMid, pxOn }
}
export type CanvasPixelGrid = ReturnType<typeof usePixelGrid>
