<script setup lang="ts">
import type { Tool } from '~/components/editor/EditorToolbar.vue'
import { DEFAULT_STYLE, frameCss, frameDashStroke, frameSmoothLayers, frameStroke, type LayerType } from '~/canvas/schema'
import { useLayerStore } from '~/canvas/store'
import { ellipsePath, radiiOf, rectPath, vectorPath } from '~/canvas/paint'
import { nodePathIn } from '~/canvas/vector'
import GridOverlay from '~/components/editor/GridOverlay.vue'
import CanvasRulers from '~/components/editor/CanvasRulers.vue'
import { useMixScreens } from '~/composables/useLayerMenu'
import { handleCursor, type Guides } from '~/canvas/geom'
import LayerView from '~/components/editor/LayerView.vue'
import { fmtNum } from '~/canvas/num'
import { useImageSrc } from '~/canvas/images'
import ImageCropOverlay from '~/components/editor/ImageCropOverlay.vue'
import { rotCursor } from '~/canvas/cursors'
import { useImageEdit } from '~/composables/useImageEdit'
import { subHover } from '~/composables/useInstanceTree'
import type { CanvasBase, CanvasBox, CanvasEmits, CanvasProps, DragRef, Viewport } from './canvas/types'
import { useCanvasGeom } from './canvas/useCanvasGeom'
import { useCanvasViewport } from './canvas/useCanvasViewport'
import { useCanvasPick } from './canvas/useCanvasPick'
import { useCanvasSnap } from './canvas/useCanvasSnap'
import { useCanvasDrop } from './canvas/useCanvasDrop'
import { useCanvasHover } from './canvas/useCanvasHover'
import { useCanvasHandles } from './canvas/useCanvasHandles'
import { usePenTool } from './canvas/usePenTool'
import { useVectorEdit } from './canvas/useVectorEdit'
import { useDragStart } from './canvas/useDragStart'
import { useDragMove } from './canvas/useDragMove'
import { useDragEnd } from './canvas/useDragEnd'
import { useCanvasLabels } from './canvas/useCanvasLabels'
import { useCanvasMenu } from './canvas/useCanvasMenu'
import { useCanvasKeys } from './canvas/useCanvasKeys'
import { usePixelGrid } from './canvas/usePixelGrid'

/**
 * 무한 캔버스 + 화면 안 레이어 편집.
 * - 이동: 빈 곳 드래그 · 스페이스+드래그 · 가운데 버튼 · 트랙패드 스크롤 / 확대: ⌘·Ctrl+휠 · 핀치 · 단축키
 * - 화면: 고르기 · 끌어 옮기기, 빈 곳에 프레임 도구 → 새 화면
 * - 레이어: 고르기(Shift 여러 개) · 끌어 옮기기 · 변 · 모서리로 크기(⇧ 비율, ⌥ 가운데 기준) · 모서리 바깥으로 돌리기(⇧ 15°) · 두 번 눌러 글자 고치기, 화면 안에 사각형 · 프레임 · 텍스트 그리기
 * - 스냅: 옮기거나 크기를 바꿀 때 형제 · 부모의 가장자리 · 가운데 · 같은 간격에 붙어요(⌘ · Ctrl 누르면 끔) / ⌥ 호버: 고른 레이어와의 거리
 * 좌표: 화면(px) = 캔버스 좌표 × zoom + (x, y). 레이어 좌표는 화면(또는 부모 프레임) 왼쪽 위 기준
 * 기능별 코드는 ./canvas/ 에 나눠 두었어요(끌기 · 펜 · 점 편집 · 단축키 · 표시 등) — 이 파일은 상태를 만들어 넘기고 화면을 그려요
 */

const props = defineProps<CanvasProps>()
const tool = defineModel<Tool>('tool', { required: true })
const vp = defineModel<Viewport>('viewport', { required: true })
const emit = defineEmits<CanvasEmits>()
const store = useLayerStore()

const el = ref<HTMLElement | null>(null)
const space = ref(false)
const panning = ref(false)
const draft = ref<CanvasBox | null>(null) // 캔버스 좌표
/** 그리는 중인 도형 종류(사각형 · 원 · 다각형 · 별): 그 모양 그대로 미리 보여요(피그마와 같아요) */
const draftType = ref<LayerType | null>(null)
const DRAFT_SHAPES = new Set<LayerType>(['rect', 'ellipse', 'polygon', 'star'])
const draftShape = computed(() => {
  const r = draft.value, t = draftType.value
  if (!r || !t || !DRAFT_SHAPES.has(t) || marqueeOn.value) return null
  const st = DEFAULT_STYLE[t] ?? {}
  const d = t === 'rect' ? rectPath(r.width, r.height, radiiOf(st)) : t === 'ellipse' ? ellipsePath(r.width, r.height) : vectorPath(t, st, r.width, r.height)
  return { d, fill: st.fill ?? '#E9EBED' }
})
/** ⌥ 끌기로 복제될 화면들의 자리(놓으면 복제) */
const mixGhosts = ref<CanvasBox[]>([])
/** 선 · 연필 미리보기(캔버스 좌표 점들) */
const draftPts = ref<[number, number][] | null>(null)
/** 상자 선택 · Shift 클릭으로 함께 고른 화면들(첫 번째가 store.screenId). 페이지가 v-model:multi 로 받아 '화면 n개' 패널을 그려요 */
const multi = defineModel<string[]>('multi', { default: () => [] })
/** 레이어와 섞어 고른 화면들: 레이어 선택이 비거나 다른 화면으로 바뀌면 곧바로(sync) 비워요 — 섞어 고르는 쪽은 바꾼 뒤에 다시 채워요 */
const mix = useMixScreens()
const guides = ref<Guides | null>(null)
const marqueeOn = ref(false)
/** 지금 끄는 것(누르기 → 끌기 → 떼기) — 여러 파일이 같은 상자를 봐요 */
const dragRef: DragRef = { current: null }
/** 화면(프레임) 자체의 모양: 채우기 · 선(안쪽) · 모서리 · 투명도 · 내용 자르기 */
const frameImg = useImageSrc()
const imgEdit = useImageEdit()
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const
const EDGES = ['n', 's', 'e', 'w'] as const

// 기능별 파일을 차례로 붙여요: 뒤 파일은 앞 파일이 만든 것만 받아요(순서를 바꾸면 타입 검사가 알려 줘요)
const c0: CanvasBase = { props, emit, store, el, tool, vp, multi, mix, dragRef, space, panning, draft, draftType, mixGhosts, draftPts, marqueeOn, guides, frameImg, imgEdit }
const c1 = Object.assign(c0, useCanvasGeom(c0))
const c2 = Object.assign(c1, useCanvasViewport(c1))
const c3 = Object.assign(c2, useCanvasPick(c2))
const c4 = Object.assign(c3, useCanvasSnap(c3))
const c5 = Object.assign(c4, useCanvasDrop(c4))
const c6 = Object.assign(c5, useCanvasHover(c5))
const c7 = Object.assign(c6, useCanvasHandles(c6))
const c8 = Object.assign(c7, usePenTool(c7))
const c9 = Object.assign(c8, useVectorEdit(c8))
const c10 = Object.assign(c9, useDragStart(c9))
const c11 = Object.assign(c10, useDragMove(c10))
const c12 = Object.assign(c11, useDragEnd(c11))
const c13 = Object.assign(c12, useCanvasLabels(c12))
const c14 = Object.assign(c13, useCanvasMenu(c13))
const canvas = Object.assign(c14, useCanvasKeys(c14))
const {
  realScreens, canvasDoc, canvasRoots, figTagW, box, labelPos, frameTags, tagsFor, scrRot, scrTf, worldMat, tick, selFrame,
  multiBoxes, xAllWorld, xBoxes, selBoxes, alZones, compIds, selComp, single, peekBoxes, rbox, belowBox, rotating, sx, crisp, sy,
  ticks,
  zoomAt, focusOn, reveal, fit, onWheel, fitSelection, onGestureStart, onGestureChange, moving, zooming,
  guideFrames, guideSnaps, guideActive, onGuides,
  onDragOver, onDrop, dropAt, dropLine, onFileDragOver, onDragLeave, insertInstance,
  hover, leave, cmdMarks, selTextLines, hoverOutline, hoverTextLines, hoverKids, parentOutline, shown,
  radDrag, radHandles, startRadius, screenRad, startScreenRadius, radLabel, gapBands, padBands, padHot, gapHot, bandDrag,
  startBand, bandLabel,
  penView, selWorld,
  vedit, hoverShape, selShape, vshape, vmarq, vhandles, startVpt, vsegs, segOn, ptOn, startVseg,
  start, startResize, startResizeMany, edgeDbl, startScreenResize, startRotate, startScreenRotate,
  ghost, move,
  end,
  renamingScreen, commitScreenName, frameLabels, renamingFrame, pickFrameLabel, commitFrameName, onDblAny,
  rulersShown, doPaste, sectionScreens, onContext,
  onKeyDown, onKeyUp, onBlur,
} = canvas

defineExpose({ fit, zoomAt, fitSelection, reveal, focusOn, insertInstance, sectionScreens, paste: doPaste })

onMounted(() => {
  el.value?.addEventListener('wheel', onWheel, { passive: false })
  el.value?.addEventListener('gesturestart', onGestureStart)
  el.value?.addEventListener('gesturechange', onGestureChange)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
})
onBeforeUnmount(() => {
  el.value?.removeEventListener('wheel', onWheel)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
})
const { pxAlpha, pxDif, pxMid, pxOn } = usePixelGrid(canvas)

const vSelectAll = { mounted: (el: HTMLInputElement) => { el.focus(); el.select() } }
/** 캔버스 배경: 단색. 배경색은 페이지 설정(오른쪽 패널, 아무것도 안 골랐을 때)에서 바꿔요 */
const gridStyle = computed(() => (props.background ? { backgroundColor: props.background } : {}))
/** 크기 숫자: 정수면 그대로, 아니면 소수 한 자리(피그마와 같아요) */
// 크기 · 각도 표시: 피그마처럼 정수로(실제 크기는 소수 그대로) — app/canvas/num.ts
const fmt = fmtNum
/** 크기 표시 옆 크기 방식: 피그마처럼 "120 Hug × 40 Fill". 고정이면 비워요(인스펙터 W · H ▾ 와 같은 규칙).
 *  Hug · Fill(내용 · 부모가 정한 크기)은 숫자를 늘 정수로 — 손으로 바꾼 크기만 소수점(픽셀 맞춤을 껐을 때) 보여요(사용자 요청 2026-11-26) */
const singleModes = computed(() => {
  const sid = store.screenId.value
  const id = store.layerIds.value.length === 1 ? store.layerIds.value[0] : null
  const n = sid && id ? store.node(sid, id) : null
  if (!n) return { w: '', h: '' }
  const label = (v?: string) => (v === 'hug' ? tr('Hug') : v === 'fill' ? tr('Fill') : '')
  const text = n.type === 'text'
  return { w: label(n.sizeH ?? (text && n.style.autoWidth ? 'hug' : undefined)), h: label(n.sizeV ?? (text ? 'hug' : undefined)) }
})
/** 레이어 목록의 인스턴스 하위 줄에 올렸을 때: 그 부분을 캔버스에서 보라 테두리로(피그마와 같아요) */
const subBox = computed(() => {
  void vp.value
  const t = subHover.value
  if (!t || !t.isConnected || !el.value) return null
  const r = t.getBoundingClientRect(), c = el.value.getBoundingClientRect()
  if (!r.width && !r.height) return null
  return { left: r.left - c.left + 'px', top: r.top - c.top + 'px', width: r.width + 'px', height: r.height + 'px' }
})
/** 이미지 자르기 화면: 자르는 레이어 자리(레이어 안 좌표 → 캔버스 화면 좌표) */
const cropView = computed(() => {
  void tick.value
  void vp.value
  const e = imgEdit.value
  const s = e ? props.screens.find((v) => v.id === e.sid) : undefined
  const n = e && s ? store.node(e.sid, e.id) : undefined
  if (!e || !s || !n) return null
  const m = worldMat(s, e.id), z = vp.value.zoom
  return { e, n, mat: { a: m.a * z, b: m.b * z, c: m.c * z, d: m.d * z, e: m.e * z + vp.value.x, f: m.f * z + vp.value.y } }
})
/** 화면 바로 아래 마스크(하나만 골라 Use as mask): 그 위 레이어들을 마스크 모양으로 가려요(LayerView 의 프레임 안 마스크와 같아요) */
function rootMask(sid: string) {
  const d = store.doc(sid)
  const i = d.rootIds.findIndex((c) => d.nodes[c]?.isMask && !d.nodes[c]?.hidden)
  if (i < 0) return null
  const m = d.nodes[d.rootIds[i]!]!
  return { below: d.rootIds.slice(0, i), mask: m.id, above: d.rootIds.slice(i + 1), clip: `path(${m.evenodd ? 'evenodd, ' : ''}'${nodePathIn(d, m, 0, 0)}')` }
}
const frameLook = (s: ScreenRow) => (s.source === 'native' ? frameCss(store.doc(s.id).frame, store.color, frameImg, s.width, s.height) : {})
/** Corner smoothing 화면: 바탕 · 그림자 · 선을 squircle 모양으로 그리는 층 */
const frameDash = (s: ScreenRow) => (s.source === 'native' ? frameDashStroke(store.doc(s.id).frame, s.width, s.height, store.color) : null)
const frameSm = (s: ScreenRow) => (s.source === 'native' ? frameSmoothLayers(store.doc(s.id).frame, s.width, s.height, store.color, frameImg) : null)
const cursor = computed(() => (panning.value ? 'grabbing' : space.value || tool.value === 'hand' ? 'grab' : tool.value === 'move' || tool.value === 'scale' ? 'default' : tool.value === 'text' ? 'text' : 'crosshair'))
</script>

<template>
  <main
    ref="el"
    :aria-label="tr('Canvas')"
    class="canvas canvas-dots"
    :style="{ cursor, ...gridStyle }"
    @pointerdown.self="start($event)"
    @pointermove="move"
    @pointerleave="leave"
    @pointerup="end"
    @pointercancel="end"
    @dragover.prevent="onDragOver($event); onFileDragOver($event)"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
    @contextmenu="onContext"
    @dblclick="onDblAny"
  >
    <div class="world" :class="{ moving: moving && !zooming }" :style="{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }">
      <!-- 캔버스 위 섹션: 화면들 아래에 깔아요(피그마처럼 화면을 묶는 바탕) -->
      <div v-if="canvasDoc && canvasRoots.under.length" class="free" :data-screen="canvasDoc.id" @pointerdown.stop="start($event, canvasDoc)">
        <LayerView v-for="id in canvasRoots.under" :key="id" :doc="store.doc(canvasDoc.id)" :id="id" :screen-id="canvasDoc.id" />
      </div>
      <div
        v-for="s in realScreens"
        :key="s.id"
        class="frame"
        role="button"
        tabindex="-1"
        :data-screen="s.id"
        :style="{ left: s.x + 'px', top: s.y + 'px', width: s.width + 'px', height: s.height + 'px', cursor: space || panning ? 'inherit' : cursor, ...frameLook(s), transform: scrTf(s) }"
        :aria-label="tr('{name} frame', { name: s.name })"
        @pointerdown.stop="start($event, s)"
      >
        <img v-if="s.thumbnail_path && s.source === 'figma'" :src="frameImg(s.thumbnail_path)" alt="" draggable="false" class="thumb">
        <template v-else>
          <template v-for="sm in [frameSm(s)]" :key="'fsm'"><i v-if="sm" class="fsmw"><i class="fsmb" :style="sm.bg" /></i></template>
          <template v-for="rm in [rootMask(s.id)]" :key="'rm'">
            <template v-if="rm">
              <LayerView v-for="id in rm.below" :key="id" :doc="store.doc(s.id)" :id="id" :screen-id="s.id" />
              <!-- 마스크 자체는 그리지 않아요(프레임 안 마스크와 같아요) -->
              <div class="rmask" :style="{ clipPath: rm.clip }"><LayerView v-for="id in rm.above" :key="id" :doc="store.doc(s.id)" :id="id" :screen-id="s.id" /></div>
            </template>
            <LayerView v-for="id in rm ? [] : store.doc(s.id).rootIds" :key="id" :doc="store.doc(s.id)" :id="id" :screen-id="s.id" />
          </template>
          <GridOverlay v-if="store.doc(s.id).frame?.grids" :grids="store.doc(s.id).frame?.grids" :w="s.width" :h="s.height" />
          <!-- 화면 스트로크(안쪽): 자식 레이어 위에 — 피그마처럼 안에 든 레이어가 테두리를 덮지 않아요 -->
          <i v-if="s.source === 'native' && frameStroke(store.doc(s.id).frame, store.color, s.width, s.height)" class="frame-stk" :style="{ boxShadow: frameStroke(store.doc(s.id).frame, store.color, s.width, s.height) }" />
          <template v-for="sk in [frameSm(s)?.stroke ?? frameDash(s)]" :key="'fsk'"><svg v-if="sk" class="frame-sqk" :width="s.width" :height="s.height" overflow="visible" aria-hidden="true"><path v-for="(c, i) in sk.colors" :key="i" :d="sk.d" fill="none" :stroke="c" :stroke-width="sk.w" :stroke-dasharray="sk.dash" :stroke-linecap="sk.cap" /></svg></template>
        </template>
      </div>
      <!-- 캔버스 위(화면 밖) 레이어: 화면들 위에 그려요 -->
      <div v-if="canvasDoc" class="free" :data-screen="canvasDoc.id" @pointerdown.stop="start($event, canvasDoc)">
        <LayerView v-for="id in canvasRoots.over" :key="id" :doc="store.doc(canvasDoc.id)" :id="id" :screen-id="canvasDoc.id" />
      </div>
      <!-- 화면 밖으로 끄는 레이어: 맨 위에. 다른 화면 위면 그 화면 모양대로 잘라서(놓은 뒤와 같게) -->
      <div
        v-if="ghost"
        class="ghost"
        :class="{ clipped: !!ghost.clip }"
        :style="ghost.clip ? { left: ghost.clip.x + 'px', top: ghost.clip.y + 'px', width: ghost.clip.w + 'px', height: ghost.clip.h + 'px', borderRadius: ghost.clip.r } : { left: ghost.x + 'px', top: ghost.y + 'px' }"
      >
        <div v-for="g in ghost.items" :key="g.id" class="ghost-at" :style="{ left: g.x + (ghost.clip ? ghost.x - ghost.clip.x : 0) + 'px', top: g.y + (ghost.clip ? ghost.y - ghost.clip.y : 0) + 'px' }">
          <LayerView :doc="store.doc(ghost.sid)" :id="g.id" :screen-id="ghost.sid" ghost />
        </div>
      </div>
      <!-- 파일 끌어 놓을 자리 -->
      <div v-if="dropAt" class="drop-at" :class="{ line: dropLine }" :style="{ '--z': vp.zoom, left: dropAt.x + 'px', top: dropAt.y + 'px', width: dropAt.w + 'px', height: dropAt.h + 'px' }" />
 <div v-if="draft && !marqueeOn" :class="['draft', { shape: !!draftShape }]" :style="{ left: draft.x + 'px', top: draft.y + 'px', width: draft.width + 'px', height: draft.height + 'px' }">
        <!-- 도형은 그리는 동안에도 그 모양 · 기본 칠 그대로 -->
        <svg v-if="draftShape" class="draft-svg" :width="draft.width" :height="draft.height" aria-hidden="true"><path :d="draftShape.d" :fill="draftShape.fill" /></svg>
      </div>
    </div>

    <template v-if="pxOn"><canvas ref="pxDif" class="pxgrid dif" :style="{ opacity: pxAlpha }" aria-hidden="true" /><canvas ref="pxMid" class="pxgrid mid" :style="{ opacity: pxAlpha }" aria-hidden="true" /></template>
    <div class="overlay" aria-hidden="true">
      <span
        v-for="f in frameLabels"
        :key="'fl' + f.id"
        class="label"
        :data-label-layer="f.id"
        :class="{ on: canvasDoc && ((store.screenId.value === canvasDoc.id && store.layerIds.value.includes(f.id)) || (hover?.sid === canvasDoc.id && hover?.id === f.id)) }"
        :style="{ left: f.box.left, top: `calc(${f.box.top} - 20px)`, maxWidth: f.box.width }"
        @pointerdown.stop="pickFrameLabel(f.id)"
        @dblclick.stop="renamingFrame = f.id"
      >
        <input
          v-if="renamingFrame === f.id"
          v-select-all
          class="label-in"
          :value="f.name"
          :aria-label="tr('Frame name')"
          spellcheck="false"
          @pointerdown.stop
          @dblclick.stop
          @keydown.stop="($event.key === 'Enter' && ($event.target as HTMLInputElement).blur()) || ($event.key === 'Escape' && (renamingFrame = null))"
          @blur="commitFrameName(f.id, $event)"
        >
        <template v-else>{{ f.name }}</template>
      </span>
      <span
        v-for="s in realScreens"
        :key="'l' + s.id"
        class="label"
        :data-screen="s.id"
        :class="{ on: (store.screenId.value === s.id && !store.layerIds.value.length) || hoverOutline?.frame === s.id }"
        :style="{ ...labelPos(s), maxWidth: s.source === 'figma' ? `calc(${box(s).width} - ${figTagW(s)}px)` : box(s).width }"
        @pointerdown.stop="tool = 'move'; start($event, s)"
      >
        <input
          v-if="renamingScreen === s.id"
          v-select-all
          class="label-in"
          :value="s.name"
          :aria-label="tr('Frame name')"
          spellcheck="false"
          @pointerdown.stop
          @dblclick.stop
          @keydown.stop="($event.key === 'Enter' && ($event.target as HTMLInputElement).blur()) || ($event.key === 'Escape' && (renamingScreen = null))"
          @blur="commitScreenName(s.id, $event)"
        >
        <!-- 프로젝트 썸네일로 정한 프레임: 이름 앞에 네모 아이콘 -->
        <template v-else><svg v-if="coverId === s.id" class="lb-ic" width="12" height="12" viewBox="0 0 12 12" role="img" :aria-label="tr('Project thumbnail')" :data-tip="tr('Project thumbnail')"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>{{ s.name }}</template>
      </span>
      <!-- 피그마 연결 화면: 이름 줄 오른쪽 끝에 표시. 누르면 피그마에서 그 프레임 열기(편집은 피그마에서) -->
      <component
        :is="s.figma_url ? 'a' : 'span'"
        v-for="s in realScreens.filter((v) => v.source === 'figma' && figTagW(v))"
        :key="'f' + s.id"
        class="fig-tag"
        :href="s.figma_url || undefined"
        :target="s.figma_url ? '_blank' : undefined"
        :rel="s.figma_url ? 'noopener noreferrer' : undefined"
        tabindex="-1"
        :title="s.figma_url ? tr('Linked from Figma · Open in Figma') : tr('Linked from Figma')"
        :style="{ left: `calc(${box(s).left} + ${box(s).width})`, top: `calc(${box(s).top} - 20px)` }"
        @pointerdown.stop
      >
        <!-- 피그마 표시 7 × 10.5(로고 비율 2:3) --><svg width="7" height="10.5" viewBox="0 0 38 57" aria-hidden="true"><path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1ABCFE" /><path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="#0ACF83" /><path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" fill="#FF7262" /><path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="#F24E1E" /><path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="#A259FF" /></svg>
      </component>
      <div v-if="parentOutline" class="parent" :style="parentOutline" />
      <template v-if="gapHot || bandDrag?.kind === 'gap'"><div v-for="(b, i) in gapBands" :key="'gap' + i" class="gap" :class="{ v: b.v }" :style="{ left: b.left, top: b.top, width: b.width, height: b.height }"><i :style="{ cursor: b.v ? 'ns-resize' : 'ew-resize' }" @pointerdown="startBand($event, 'gap')" /></div></template>
      <template v-else-if="padHot || bandDrag?.kind === 'pad'"><div v-for="(b, i) in padBands" :key="'pad' + i" class="pad" :class="{ v: b.side === 0 || b.side === 2 }" :style="{ left: b.left, top: b.top, width: b.width, height: b.height }"><i :style="{ cursor: b.side === 0 || b.side === 2 ? 'ns-resize' : 'ew-resize' }" @pointerdown="startBand($event, 'pad', b.side)" /></div></template>
      <span v-if="radLabel && radDrag" class="sq size rlabel" :style="radLabel">{{ tr('Radius {n}', { n: radDrag.v }) }}</span>
      <span v-if="bandLabel && bandDrag" class="sq glabel" :class="{ gapl: bandDrag.kind === 'gap' }" :style="bandLabel">{{ bandDrag.value }}</span>
      <template v-if="hoverOutline && !gapHot && !padHot && !cmdMarks"><div v-for="(k, i) in hoverKids" :key="'hk' + i" class="kid" :style="k" /></template>
      <template v-if="hoverTextLines.length && !gapHot && !padHot && !cmdMarks"><div v-for="(l, i) in hoverTextLines" :key="'ht' + i" class="cmd-ul" :style="l" /></template>
      <div v-else-if="hoverOutline && !gapHot && !padHot && !cmdMarks" class="hover-ol" :class="{ comp: hoverOutline.comp, shaped: 'path' in hoverOutline }" :style="hoverOutline.style"><svg v-if="'path' in hoverOutline" class="shape-line" aria-hidden="true"><path :d="hoverOutline.path" stroke-width="2" /></svg></div>
      <!-- 고른 글자: 기준선 밑줄(마우스 올리면 굵게) -->
      <template v-if="!cmdMarks"><div v-for="(l, i) in selTextLines" :key="'st' + i" class="cmd-ul" :style="l" /></template>
      <!-- ⌘ + 마우스 올림: 글자 밑줄 · 요소 테두리(컴포넌트 안은 보라) -->
      <template v-if="cmdMarks">
        <div v-for="(b, i) in cmdMarks.boxes" :key="'cb' + i" class="cmd-box" :class="{ comp: cmdMarks.comp, shaped: !!b.path }" :style="{ left: b.left, top: b.top, width: b.width, height: b.height, borderRadius: b.borderRadius }"><svg v-if="b.path" class="shape-line" aria-hidden="true"><path :d="b.path" stroke-width="1" /></svg></div>
        <div v-for="(l, i) in cmdMarks.lines" :key="'cl' + i" class="cmd-ul" :class="{ comp: cmdMarks.comp }" :style="l" />
      </template>
      <div v-for="(b, i) in peekBoxes" :key="'pk' + i" class="peek" :style="b"><span class="peek-tag num">{{ peek?.label }}</span></div>
      <div v-for="id in highlight ?? []" :key="'h' + id" class="hl" :style="screens.find((s) => s.id === id) ? box(screens.find((s) => s.id === id)!) : { display: 'none' }" />
      <div v-for="m in multiBoxes" :key="'m' + m.id" class="sel" :style="box(m)" />
      <div v-if="selFrame && !multi.length && !selBoxes.length" class="sel" :style="{ ...box(selFrame), transform: scrRot(selFrame) ? `rotate(${scrRot(selFrame)}deg)` : undefined }">
        <template v-if="!selBoxes.length">
          <!-- 모서리 바깥: 돌리기(레이어와 같아요 — ⇧ 15° 씩) -->
          <span v-for="c in CORNERS" :key="'r' + c" :class="['rot', 'at-' + c]" :style="{ cursor: rotCursor(c, scrRot(selFrame)) }" @pointerdown.stop.prevent="startScreenRotate($event)" />
          <span v-for="h in EDGES" :key="h" :class="['edge', h]" :style="{ cursor: handleCursor(h, 0) }" @pointerdown.stop.prevent="startScreenResize($event, h)" />
          <span v-for="c in CORNERS" :key="c" :class="['handle', 'live', 'at-' + c]" @pointerdown.stop.prevent="startScreenResize($event, c)" />
          <span v-if="!scrRot(selFrame)" class="sq size">{{ rotating ? fmt(scrRot(selFrame)) + '°' : `${fmt(selFrame.width)} × ${fmt(selFrame.height)}` }}</span>
          <span v-for="h in screenRad ?? []" :key="'srh' + h.c" class="rh" :style="{ left: h.x + 'px', top: h.y + 'px' }" :title="tr('Corner radius (⌥ one corner)')" @pointerdown.stop.prevent="startScreenRadius($event, h.c)" />
        </template>
      </div>
      <!-- 돌린 화면의 크기 · 각도 표시: 아래에 오는 변 가운데 아래, 각도를 따라 기울되 거꾸로 서지 않게(피그마와 같아요) -->
      <span v-if="selFrame && !multi.length && !selBoxes.length && scrRot(selFrame)" class="sq size below" :style="frameTags(selFrame)!.size">{{ rotating ? fmt(scrRot(selFrame)) + '°' : `${fmt(selFrame.width)} × ${fmt(selFrame.height)}` }}</span>
      <!-- 점 편집 중에는 선택 상자 · 크기를 감춰요(피그마와 같아요 — 점 · 선만) -->
      <div v-for="b in vedit ? [] : selBoxes" :key="'s' + b.id" class="sel" :class="{ comp: compIds.has(b.id) }" :style="rbox(b)" />
      <div v-for="b in vedit ? [] : xBoxes" :key="'x' + b.id" class="sel" :style="rbox(b)" />
      <!-- 오토 레이아웃 간격 · 여백 표시(오른쪽 패널 칸에 올렸을 때) -->
      <div v-for="a in alZones" :key="'al' + a.key" class="al-hint" :style="rbox(a.g)" aria-hidden="true">
        <span v-for="(z, k) in a.zones" :key="k" class="al-zone" :style="{ left: z.x * vp.zoom + 'px', top: z.y * vp.zoom + 'px', width: z.w * vp.zoom + 'px', height: z.h * vp.zoom + 'px' }" />
      </div>
      <!-- 여러 개 고름: 전체를 감싸는 상자(손잡이로 함께 크기 바꾸기) + 크기 -->
      <div v-if="xAllWorld && !multi.length && !vedit" class="sel group" :style="box({ x: xAllWorld.x, y: xAllWorld.y, width: xAllWorld.w, height: xAllWorld.h })"><span class="sq size">{{ fmt(xAllWorld.w) }} × {{ fmt(xAllWorld.h) }}</span></div>
      <div v-else-if="selBoxes.length > 1 && selWorld && !multi.length && !vedit" class="sel group" :class="{ comp: selComp }" :style="box({ x: selWorld.x, y: selWorld.y, width: selWorld.w, height: selWorld.h })">
        <span v-for="h in EDGES" :key="h" :class="['edge', h]" :style="{ cursor: handleCursor(h, 0) }" @pointerdown.stop.prevent="startResizeMany($event, h)" />
        <span v-for="c in CORNERS" :key="c" :class="['handle', 'live', 'at-' + c]" :style="{ cursor: handleCursor(c, 0) }" @pointerdown.stop.prevent="startResizeMany($event, c)" />
        <span class="sq size">{{ fmt(selWorld.w) }} × {{ fmt(selWorld.h) }}</span>
      </div>
      <!-- 점 편집 중에는 상자 · 손잡이 · 크기 표시를 숨겨요(피그마와 같아요) -->
      <div v-if="subBox" class="hover-ol comp" :style="subBox" />
      <ImageCropOverlay v-if="cropView" :edit="cropView.e" :node="cropView.n" :mat="cropView.mat" />
      <template v-if="single && !vhandles && !cropView">
        <div class="sel none" :class="{ comp: selComp }" :style="rbox(single)">
          <template v-if="!single.locked">
            <span v-for="c in CORNERS" :key="'r' + c" :class="['rot', 'at-' + c]" :style="{ cursor: rotCursor(c, single.angle) }" @pointerdown.stop.prevent="startRotate($event)" />
            <span v-for="h in EDGES" :key="h" :class="['edge', h]" :style="{ cursor: handleCursor(h, single.angle) }" @pointerdown.stop.prevent="startResize($event, h)" @dblclick.stop="edgeDbl(h)" />
            <span v-for="c in CORNERS" :key="c" :class="['handle', 'live', 'at-' + c]" :style="{ cursor: handleCursor(c, single.angle) }" @pointerdown.stop.prevent="startResize($event, c)" />
            <span v-for="h in radHandles ?? []" :key="'rh' + h.c" class="rh" :style="{ left: h.x + 'px', top: h.y + 'px' }" :title="tr('Corner radius (⌥ one corner)')" @pointerdown.stop.prevent="startRadius($event, h.c)" />
          </template>
        </div>
        <span class="sq size below" :class="{ comp: selComp }" :style="single.angle ? tagsFor(single).size : belowBox(single)">
          <template v-if="rotating">{{ fmt(single.rotation) }}°</template>
          <template v-else>{{ singleModes.w ? Math.round(single.w) : fmt(single.w) }}<span v-if="singleModes.w" class="mode">{{ singleModes.w }}</span> × {{ singleModes.h ? Math.round(single.h) : fmt(single.h) }}<span v-if="singleModes.h" class="mode">{{ singleModes.h }}</span></template>
        </span>
      </template>
      <svg v-if="shown" class="guides" width="100%" height="100%">
        <template v-for="(l, i) in shown.lines" :key="i">
          <line :x1="l.x1 === l.x2 ? crisp(sx(l.x1)) : sx(l.x1)" :y1="l.y1 === l.y2 ? crisp(sy(l.y1)) : sy(l.y1)" :x2="l.x1 === l.x2 ? crisp(sx(l.x2)) : sx(l.x2)" :y2="l.y1 === l.y2 ? crisp(sy(l.y2)) : sy(l.y2)" :stroke-dasharray="l.dash ? '3 3' : undefined" />
          <template v-if="l.tick"><line v-for="(t, j) in ticks(l)" :key="j" :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2" /></template>
          <!-- 맞춰진 점마다 작은 ×(피그마와 같아요) -->
          <path v-if="l.marks?.length" class="gmark" :d="l.marks.map((m) => `M${sx(m.x) - 3} ${sy(m.y) - 3}l6 6M${sx(m.x) + 3} ${sy(m.y) - 3}l-6 6`).join('')" />
        </template>
      </svg>
      <template v-if="shown"><span v-for="(lb, i) in shown.labels" :key="'g' + i" class="sq glabel" :style="{ left: sx(lb.x) + 'px', top: sy(lb.y) + 'px' }">{{ lb.text }}</span></template>
      <div v-for="(g, i) in mixGhosts" :key="'mg' + i" class="sel" :style="box(g)" />
      <div v-if="draft && !marqueeOn" class="sel" :style="box(draft)"><span class="sq size">{{ fmt(draft.width) }} × {{ fmt(draft.height) }}</span></div>
      <div v-if="draft && marqueeOn" class="marq" :style="box(draft)" />
      <!-- 펜 미리보기 -->
      <svg v-if="penView" class="pen" width="100%" height="100%">
        <path :d="penView.d" class="pp" />
        <path v-if="penView.rubber" :d="penView.rubber" class="pr" />
        <template v-for="(q, k) in penView.pts" :key="k">
          <line v-if="q.i" :x1="q.a.x" :y1="q.a.y" :x2="q.i.x" :y2="q.i.y" class="hl" /><line v-if="q.o" :x1="q.a.x" :y1="q.a.y" :x2="q.o.x" :y2="q.o.y" class="hl" />
          <circle v-if="q.i" :cx="q.i.x" :cy="q.i.y" r="3" class="hd" /><circle v-if="q.o" :cx="q.o.x" :cy="q.o.y" r="3" class="hd" />
          <circle :cx="q.a.x" :cy="q.a.y" r="3.5" class="an" :class="{ cur: k === penView.pts.length - 1 }" />
        </template>
      </svg>
      <!-- 벡터 점 편집 -->
      <svg v-if="hoverShape || selShape" class="shape-ol" width="100%" height="100%" aria-hidden="true">
        <path v-if="selShape" :d="selShape.d" :transform="selShape.tf" vector-effect="non-scaling-stroke" stroke-width="1" />
        <path v-if="hoverShape" :d="hoverShape.d" :transform="hoverShape.tf" vector-effect="non-scaling-stroke" stroke-width="2" />
      </svg>
      <svg v-if="vhandles" class="vedit" width="100%" height="100%">
        <defs><pattern id="vhatch" :width="vshape?.pw ?? 6" :height="vshape?.pw ?? 6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" :y2="vshape?.pw ?? 6" class="vh-line" :stroke-width="(vshape?.pw ?? 6) / 6" /></pattern></defs>
        <!-- 편집 중: 모양은 회색 선, 칠이 있으면 파란 빗금(피그마와 같아요) -->
        <!-- 피그마와 같아요: 모양 칠 위에 마우스를 올렸을 때만 파란 빗금. 둥근 모양 윤곽선 · 바깥 상자는 그리지 않고 점 사이 선(회색)만 -->
        <path v-if="vshape?.filled" :d="vshape.d" :transform="vshape.tf" class="vhatch" />
        <rect v-if="vmarq" :x="vmarq.x" :y="vmarq.y" :width="vmarq.w" :height="vmarq.h" class="vmarq" />
        <!-- 선 손잡이: 보이지 않는 굵은 선(누르기 쉬움) · 고른 선은 파란 2px -->
        <g v-for="g in vsegs ?? []" :key="'s' + g.pi + ':' + g.qi" :class="['vseg', { on: segOn(g.pi, g.qi) }]">
          <path :d="g.d" class="vs-line" />
          <path :d="g.d" class="vs-hit" @pointerdown.stop.prevent="startVseg($event, g.pi, g.qi)" />
        </g>
        <template v-for="q in vhandles" :key="q.pi + ':' + q.qi">
          <line v-if="q.i" :x1="q.a.x" :y1="q.a.y" :x2="q.i.x" :y2="q.i.y" class="hl" /><line v-if="q.o" :x1="q.a.x" :y1="q.a.y" :x2="q.o.x" :y2="q.o.y" class="hl" />
          <circle v-if="q.i" :cx="q.i.x" :cy="q.i.y" r="3.5" class="hd" @pointerdown.stop.prevent="startVpt($event, q.pi, q.qi, 'i')" />
          <circle v-if="q.o" :cx="q.o.x" :cy="q.o.y" r="3.5" class="hd" @pointerdown.stop.prevent="startVpt($event, q.pi, q.qi, 'o')" />
          <circle :cx="q.a.x" :cy="q.a.y" r="4" class="an" :class="{ on: ptOn.has(q.pi + ':' + q.qi) }" @pointerdown.stop.prevent="startVpt($event, q.pi, q.qi, 'a')" />
        </template>
      </svg>
      <svg v-if="draftPts" class="guides draw" width="100%" height="100%"><polyline :points="draftPts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')" /></svg>
    </div>
    <CanvasRulers :vp="vp" :guides="props.guides ?? { x: [], y: [] }" :frames="guideFrames" :active="guideActive" :snaps="guideSnaps" :sel="selWorld" :rulers="rulersShown" @change="onGuides" />
  </main>
</template>

<style scoped src="./canvas/EditorCanvas.css"></style>
