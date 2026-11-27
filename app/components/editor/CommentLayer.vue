<script setup lang="ts">
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import CommentComposer, { type MentionPerson } from '~/components/editor/CommentComposer.vue'
import EmojiPicker from '~/components/editor/EmojiPicker.vue'
import ImageLightbox from '~/components/app/ImageLightbox.vue'
import EditorIcon from '~/components/editor/EditorIcon.vue'
import type { Thread, CommentRow, CommentArea } from '~/composables/useComments'
import type { Viewport } from '~/components/editor/canvas/types'
import { relativeTime } from '~/composables/useProjects'
import { useImageSrc } from '~/canvas/images'

/**
 * 캔버스 위 코멘트(피그마와 같아요): 핀 · 열린 스레드 · 새 코멘트 입력. 캔버스와 같은 자리에 덮는 층(핀 · 창만 누를 수 있어요).
 * - 핀은 화면(프레임) · 캔버스 섹션 · 프레임 레이어 기준 자리라 그걸 옮기면 따라가요. 끌어서 옮길 수 있어요(쓴 사람 · 관리자)
 * - 영역 코멘트는 점선 네모(마우스를 올리거나 열면 보여요)
 * - 마우스를 올리면 핀이 펼쳐져 글 미리보기, 누르면 스레드 창
 * 해결한 스레드는 숨겨요(목록에서 '해결됨'으로 열면 보여요)
 */
type Box = { x: number; y: number; w: number; h: number }
const props = defineProps<{
  vp: Viewport
  threads: Thread[]
  screens: { id: string; name: string; x: number; y: number; width: number; height: number }[]
  pageId: string | null
  people: (MentionPerson & { email?: string })[]
  /** 글쓴이 · 멘션 이름표용: 프로젝트를 나간 사람까지(이름 · 사진을 그대로 보여 줘요). 없으면 people */
  authors?: { id: string; name: string; avatar?: string | null }[]
  myId: string | null
  canModerate: boolean
  draft: { screenId: string | null; layerId?: string | null; x: number; y: number; area?: CommentArea | null } | null
  /** 새 코멘트에 쓰던 게 있는데 바깥을 눌렀어요(숫자가 바뀌면 입력칸이 흔들려요) */
  draftNudge?: number
  /** 답글에 쓰던 게 있는데 바깥을 눌렀어요(같은 방식) */
  replyNudge?: number
  /** 코멘트 커서로 끌고 있는 영역(캔버스 좌표) */
  drawing?: Box | null
  openId: string | null
  /** 캔버스 섹션 · 프레임 레이어의 캔버스 위 자리 */
  layerBox: (id: string) => Box | null
}>()
const emit = defineEmits<{
  open: [id: string | null]
  create: [body: string, mentions: string[], attachments: string[]]
  cancelDraft: []
  draftDirty: [has: boolean]
  /** 새 영역 코멘트의 영역을 점으로 끌어 바꿨어요(캔버스 좌표) */
  draftArea: [area: Box]
  replyDirty: [has: boolean]
  reply: [root: CommentRow, body: string, mentions: string[], attachments: string[]]
  resolve: [root: CommentRow, done: boolean]
  remove: [root: CommentRow]
  /** 글 하나 고치기 · 지우기(답글) · 읽지 않음 · 링크 복사 */
  edit: [c: CommentRow, body: string, mentions: string[]]
  removeMsg: [c: CommentRow]
  unread: [root: CommentRow]
  copyLink: [root: CommentRow]
  /** 이모지 반응 넣기 · 빼기 */
  react: [c: CommentRow, emoji: string]
  /** 핀을 끌어 놓았어요: 새 핀 자리 · 영역(캔버스 좌표) */
  move: [root: CommentRow, at: { x: number; y: number }, area: Box | null]
}>()
const resolveSrc = useImageSrc()

/** 기준(화면 · 레이어 · 캔버스)의 캔버스 위 원점. 그 기준이 이 페이지에 없으면 null */
function origin(at: { screen_id?: string | null; screenId?: string | null; layer_id?: string | null; layerId?: string | null; page_id?: string | null }) {
  const sid = at.screen_id ?? at.screenId ?? null
  if (sid) { const s = props.screens.find((v) => v.id === sid); return s ? { x: s.x, y: s.y } : null }
  if (at.page_id && at.page_id !== props.pageId) return null
  const lid = at.layer_id ?? at.layerId ?? null
  if (lid) { const b = props.layerBox(lid); if (b) return { x: b.x, y: b.y } }
  return { x: 0, y: 0 }
}
function world(at: Parameters<typeof origin>[0] & { x: number | null; y: number | null }) {
  const o = origin(at)
  return o ? { x: o.x + (at.x ?? 0), y: o.y + (at.y ?? 0) } : null
}
function areaWorld(at: Parameters<typeof origin>[0] & { area?: CommentArea | null }): Box | null {
  const o = at.area ? origin(at) : null
  return o && at.area ? { x: o.x + at.area.x, y: o.y + at.area.y, w: at.area.w, h: at.area.h } : null
}
const sx = (x: number) => props.vp.x + x * props.vp.zoom
const sy = (y: number) => props.vp.y + y * props.vp.zoom
const rectStyle = (b: Box) => ({ left: sx(b.x) + 'px', top: sy(b.y) + 'px', width: b.w * props.vp.zoom + 'px', height: b.h * props.vp.zoom + 'px' })
const person = (id: string | null) => (props.authors ?? props.people).find((p) => p.id === id) ?? null
const nameOf = (id: string | null) => person(id)?.name ?? tr('Former member')
const me = computed(() => person(props.myId))

const pins = computed(() => props.threads
  .filter((t) => !t.root.resolved_at || t.root.id === props.openId)
  .map((t) => ({ t, w: world(t.root) }))
  .filter((p): p is { t: Thread; w: { x: number; y: number } } => !!p.w))
const open = computed(() => props.threads.find((t) => t.root.id === props.openId) ?? null)
const openPos = computed(() => (open.value ? pinAt(open.value) : null))
const draftPos = computed(() => (props.draft ? world(props.draft) : null))
const draftArea = computed(() => (props.draft ? areaWorld(props.draft) : null))
/**
 * 영역 코멘트의 큰 점(피그마와 같아요): 핀 반대쪽 꼭짓점 — 올리면 일반 화살표 커서, 끌면 영역 크기를 바꿔요(핀 자리는 그대로)
 */
const draftDot = computed(() => {
  const a = draftArea.value, p = draftPos.value
  if (!a || !p) return null
  return { x: p.x <= a.x + a.w / 2 ? a.x + a.w : a.x, y: p.y <= a.y + a.h / 2 ? a.y + a.h : a.y }
})
function dotDown(e: PointerEvent) {
  const p = draftPos.value
  if (e.button !== 0 || !p) return
  e.preventDefault(); e.stopPropagation()
  const hr = host.value?.getBoundingClientRect()
  const move = (ev: PointerEvent) => {
    if (!hr) return
    const x = (ev.clientX - hr.left - props.vp.x) / props.vp.zoom, y = (ev.clientY - hr.top - props.vp.y) / props.vp.zoom
    emit('draftArea', { x: Math.min(x, p.x), y: Math.min(y, p.y), w: Math.max(1, Math.abs(p.x - x)), h: Math.max(1, Math.abs(p.y - y)) })
  }
  const up = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true) }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
}

// --- 핀 끌어 옮기기(피그마와 같아요): 3px 넘게 움직이면 끌기, 아니면 누르기(열기 · 닫기) ---
const drag = ref<{ id: string; sx: number; sy: number; dx: number; dy: number; moved: boolean } | null>(null)
const canMove = (t: Thread) => t.root.author_id === props.myId || props.canModerate
function pinAt(t: Thread) {
  const w = world(t.root)
  if (!w || drag.value?.id !== t.root.id) return w
  return { x: w.x + drag.value.dx, y: w.y + drag.value.dy }
}
function areaAt(t: Thread) {
  const a = areaWorld(t.root)
  if (!a || drag.value?.id !== t.root.id) return a
  return { ...a, x: a.x + drag.value.dx, y: a.y + drag.value.dy }
}
/**
 * 핀 끌기: 누른 뒤 움직임은 창 전체에서 받아요(요소에 붙잡기 X) — 끄는 사이 호버 카드가 사라지거나 다시 그려져도 끊기지 않아요.
 * 누를 때 기본 동작을 막아 핀 속 아바타 그림이 브라우저 '그림 끌기'로 넘어가 옆으로 밀리던 것도 막아요(사용자 요청 2026-11-27)
 */
function pinDown(e: PointerEvent, t: Thread) {
  if (e.button !== 0) return
  e.stopPropagation()
  e.preventDefault()
  drag.value = { id: t.root.id, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false }
  const move = (ev: PointerEvent) => pinMove(ev, t)
  const up = (ev: PointerEvent) => { off(); if (ev.type === 'pointercancel') drag.value = null; else pinUp(t) }
  const off = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true) }
  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
}
function pinMove(e: PointerEvent, t: Thread) {
  const d = drag.value
  if (!d || d.id !== t.root.id) return
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return
  if (!canMove(t)) return
  hoverId.value = null
  drag.value = { ...d, moved: true, dx: (e.clientX - d.sx) / props.vp.zoom, dy: (e.clientY - d.sy) / props.vp.zoom }
}
function pinUp(t: Thread) {
  const d = drag.value
  if (!d || d.id !== t.root.id) return
  if (d.moved) {
    const p = pinAt(t)
    const a = areaAt(t)
    drag.value = null
    if (p) emit('move', t.root, p, a)
    return
  }
  drag.value = null
  emit('open', t.root.id === props.openId ? null : t.root.id)
}

// --- 마우스 올림: 핀이 펼쳐져 미리보기(피그마와 같아요) ---
const hoverId = ref<string | null>(null)
let hoverTimer: ReturnType<typeof setTimeout> | undefined
function hoverIn(id: string) { clearTimeout(hoverTimer); if (drag.value) return; if (hoverId.value === id) return; hoverTimer = setTimeout(() => (hoverId.value = id), 120) }
/** 핀 → 펼친 카드로 옮겨 가는 사이에 닫히지 않게 조금 기다려요 */
function hoverOut() { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => (hoverId.value = null), 60) }
const imgCount = (c: CommentRow) => c.attachments?.length ?? 0
const imgsLabel = (n: number) => (n === 1 ? tr('1 image') : tr('{n} images', { n }))
const repliesLabel = (n: number) => (n === 1 ? tr('1 reply') : tr('{n} replies', { n }))

/**
 * 창 자리(피그마와 같아요): 핀 오른쪽, 자리가 모자라면 핀 왼쪽 — 어느 쪽이든 파란 핀은 절대 가리지 않아요.
 * 양옆 패널(왼쪽 · 오른쪽 사이드바) 사이 빈 캔버스를 기준으로 재요. 위 끝은 핀 위 끝과 같아요(입력칸 높이 = 핀 높이 36)
 */
const host = ref<HTMLElement | null>(null)
function bounds() {
  const h = host.value
  const W = h?.clientWidth ?? 1200
  const hr = h?.getBoundingClientRect()
  const l = h?.parentElement?.querySelector<HTMLElement>('.panel-left')?.getBoundingClientRect()
  const r = h?.parentElement?.querySelector<HTMLElement>('.panel-right')?.getBoundingClientRect()
  return { min: l && hr ? l.right - hr.left + 8 : 8, max: r && hr ? r.left - hr.left - 8 : W - 8 }
}
function sideLeft(w: { x: number }, width: number, gap = 8) {
  const { min, max } = bounds()
  const px = sx(w.x) // 핀 왼쪽 끝(핀 폭 36)
  const right = px + 36 + gap, left = px - gap - width
  if (right + width <= max) return right
  if (left >= min) return left
  return right + width - max < min - left ? right : left // 둘 다 모자라면 덜 잘리는 쪽(핀은 그대로 보이게)
}
/**
 * 스레드 창(피그마와 같아요): 핀보다 조금 위(머리 줄이 핀 위쪽에, 첫 글이 핀 높이쯤) · 핀 옆 12.
 * 뜰 때는 핀 쪽에서 살짝 밀려 나오며 나타나요(--ox: 핀 쪽 가장자리)
 */
function boxAt(w: { x: number; y: number }, width = 320) {
  const H = host.value?.clientHeight ?? 800
  const top = Math.max(56, Math.min(sy(w.y) - 36 - 44, H - 360))
  const left = sideLeft(w, width, 12)
  const fromLeft = left > sx(w.x)
  return { left: left + 'px', top: top + 'px', '--ox': fromLeft ? '0%' : '100%', '--dx': fromLeft ? '-8px' : '8px' }
}
/** 새 코멘트 입력칸: 핀 옆, 위 끝 = 핀 위 끝 */
function draftBoxAt(w: { x: number; y: number }) {
  return { left: sideLeft(w, 320) + 'px', top: sy(w.y) - 36 + 'px' }
}

/** 글 속 @이름은 파랗게 */
function parts(body: string) {
  const names = (props.authors ?? props.people).map((p) => '@' + p.name).filter((n) => body.includes(n)).sort((a, b) => b.length - a.length)
  if (!names.length) return [{ t: body, m: false }]
  const re = new RegExp('(' + names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g')
  return body.split(re).filter(Boolean).map((t) => ({ t, m: names.includes(t) }))
}
const moreOpen = ref(false)
watch(() => props.openId, () => { moreOpen.value = false; msgMenu.value = null; editingId.value = null; rx.value = null })
/**
 * 글마다 ⋯(피그마와 같아요): 내 글은 Edit, 스레드에 글이 2개 이상이면 내 글 Delete 도. 다른 사람 글은 방장 · 부방장만 Delete.
 * 첫 글을 지우면 스레드째 지워져요(확인 창)
 */
const msgMenu = ref<string | null>(null)
/** 글 ⋯ 메뉴 자리(스레드 창 기준) — 글 목록 스크롤에 잘리지 않게 창 바깥층에 띄워요 */
const msgMenuAt = ref<{ c: CommentRow; right: number; top: number; up: boolean } | null>(null)
function openMsgMenu(c: CommentRow, e: MouseEvent) {
  if (msgMenu.value === c.id) { msgMenu.value = null; msgMenuAt.value = null; return }
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const t = thEl.value?.getBoundingClientRect()
  if (!t) return
  const up = b.bottom + 4 + 80 > window.innerHeight
  msgMenu.value = c.id
  msgMenuAt.value = { c, right: t.right - b.right, top: up ? b.top - t.top - 4 : b.bottom - t.top + 4, up }
}
watch(msgMenu, (v) => { if (!v) msgMenuAt.value = null })
const editingId = ref<string | null>(null)
const canEditMsg = (c: CommentRow) => c.author_id === props.myId
const canDeleteMsg = (c: CommentRow, count: number) => (c.author_id === props.myId ? count >= 2 : props.canModerate)
function deleteMsg(c: CommentRow) {
  msgMenu.value = null
  if (open.value && c.id === open.value.root.id) emit('remove', c)
  else emit('removeMsg', c)
}
/** ⋯ 메뉴: 바깥을 누르면 닫혀요 */
const moreEl = ref<HTMLElement | null>(null)
/**
 * 이모지 반응(피그마와 같아요): 글에 마우스를 올리면 오른쪽에 😊 — 누르면 이모지 창, 고르면 아래 줄에 [이모지 수].
 * 내가 단 반응은 파란 테두리 · 다시 누르면 빠져요. 올리면 누가 달았는지
 */
const rx = ref<{ c: CommentRow; left: number; top: number } | null>(null)
const thEl = ref<HTMLElement | null>(null)
const reactionsOf = (c: CommentRow) => Object.entries(c.reactions ?? {}).filter(([, ids]) => ids.length)
const mine = (ids: string[]) => !!props.myId && ids.includes(props.myId)
const whoReacted = (ids: string[]) => ids.map((id) => (id === props.myId ? tr('You') : nameOf(id))).join(', ')
function openReact(c: CommentRow, e: MouseEvent) {
  if (rx.value?.c.id === c.id) { rx.value = null; return }
  const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const t = thEl.value?.getBoundingClientRect()
  if (!t) return
  // 이모지 창(300 × 약 340): 버튼 아래, 오른쪽 끝을 버튼에 맞춰요 — 화면 아래가 모자라면 버튼 위로
  const H = window.innerHeight
  const below = b.bottom + 6 + 340 <= H
  rx.value = { c, left: b.right - t.left - 300, top: below ? b.bottom - t.top + 6 : b.top - t.top - 6 - 340 }
}
function pickReaction(emoji: string) { const r = rx.value; rx.value = null; if (r) emit('react', r.c, emoji) }
function onDocDown(e: PointerEvent) {
  if (rx.value && !(e.target as Element | null)?.closest?.('.rx-pick, .rx-add')) rx.value = null
  if (moreOpen.value && !moreEl.value?.contains(e.target as Node | null)) moreOpen.value = false
  if (msgMenu.value && !(e.target as Element | null)?.closest?.('.msg-more')) msgMenu.value = null
}
onMounted(() => document.addEventListener('pointerdown', onDocDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown, true))
/** 코멘트 핀: 오른쪽 위는 원, 왼쪽 아래(가리키는 끝)는 곡률 없이 뾰족하게 */
const PIN = 'M14 0C21.732 0 28 6.268 28 14C28 23 22 28 12 28H0V16C0 6 5 0 14 0Z'
const canDelete = (c: CommentRow) => c.author_id === props.myId || props.canModerate
/** 붙인 이미지 크게 보기(공용 ImageLightbox) — 썸네일은 작은 1:1(사용자 요청 2026-11-27) */
const lb = ref<{ images: string[]; index: number | null }>({ images: [], index: null })
function viewImage(c: CommentRow, i: number) { lb.value = { images: (c.attachments ?? []).map((x) => resolveSrc(x) ?? '').filter(Boolean), index: i } }
</script>

<template>
  <div ref="host" class="cl">
    <!-- 영역 코멘트: 마우스를 올리거나 연 스레드의 점선 네모 -->
    <template v-for="p in pins" :key="'a' + p.t.root.id">
      <div v-if="areaAt(p.t) && (p.t.root.id === openId || p.t.root.id === hoverId || drag?.id === p.t.root.id)" class="area" :style="rectStyle(areaAt(p.t)!)" aria-hidden="true" />
    </template>
    <div v-if="drawing" class="area" :style="rectStyle(drawing)" aria-hidden="true"><i class="corner" /></div>

    <template v-for="p in pins" :key="p.t.root.id">
      <!-- 마우스 올림(피그마와 같아요): 핀이 사라지고 그 자리에서 카드가 커져요 — 왼쪽 아래 뾰족한 끝 = 핀 끝(같은 점). 누르면 열기 · 끌면 옮기기 -->
      <div
        v-if="hoverId === p.t.root.id && p.t.root.id !== openId && !drag"
        class="peek" :style="{ left: sx(pinAt(p.t)!.x) + 'px', top: sy(pinAt(p.t)!.y) + 'px' }"
        @pointerdown="pinDown($event, p.t)" @dragstart.prevent
        @mouseenter="hoverIn(p.t.root.id)" @mouseleave="hoverOut"
      >
        <MemberAvatar :name="nameOf(p.t.root.author_id)" :src="person(p.t.root.author_id)?.avatar" :size="28" class="pa" />
        <div class="pb">
          <span class="mh"><b>{{ nameOf(p.t.root.author_id) }}</b><span class="tx-meta">{{ relativeTime(p.t.root.created_at) }}</span></span>
          <span class="pt">{{ p.t.root.body }}</span>
          <span v-if="imgCount(p.t.root) || p.t.replies.length" class="tx-meta">{{ [imgCount(p.t.root) ? imgsLabel(imgCount(p.t.root)) : '', p.t.replies.length ? repliesLabel(p.t.replies.length) : ''].filter(Boolean).join(' · ') }}</span>
        </div>
      </div>
      <button
        type="button"
        :class="['pin', { on: p.t.root.id === openId, unread: p.t.unread, done: !!p.t.root.resolved_at, dragging: drag?.id === p.t.root.id && drag.moved, movable: canMove(p.t), hid: hoverId === p.t.root.id && p.t.root.id !== openId && !drag }]"
        :style="{ left: sx(pinAt(p.t)!.x) + 'px', top: sy(pinAt(p.t)!.y) - 36 + 'px' }"
        :aria-label="tr('Comment #{no} by {name}', { no: p.t.root.no ?? '', name: nameOf(p.t.root.author_id) })"
        @pointerdown="pinDown($event, p.t)" @dragstart.prevent
        @mouseenter="hoverIn(p.t.root.id)" @mouseleave="hoverOut"
        @keydown.enter.prevent="emit('open', p.t.root.id === openId ? null : p.t.root.id)"
      >
        <svg class="pin-bg" viewBox="0 0 28 28" aria-hidden="true"><path :d="PIN" /></svg>
        <MemberAvatar :name="nameOf(p.t.root.author_id)" :src="person(p.t.root.author_id)?.avatar" :size="28" />
      </button>
    </template>

    <!-- 새 코멘트(피그마와 같아요): 파란 핀 + 오른쪽 입력칸만(제목 없이). 치기 시작하면 도구 막대가 열려요 -->
    <template v-if="draft && draftPos">
      <div v-if="draftArea" class="area" :style="rectStyle(draftArea)" aria-hidden="true" />
      <span v-if="draftDot" class="corner dot" :style="{ left: sx(draftDot.x) + 'px', top: sy(draftDot.y) + 'px' }" :aria-label="tr('Resize comment area')" :data-tip="tr('Resize comment area')" @pointerdown="dotDown" />
      <span class="pin draft" :style="{ left: sx(draftPos.x) + 'px', top: sy(draftPos.y) - 36 + 'px' }" aria-hidden="true"><svg class="pin-bg" viewBox="0 0 28 28"><path :d="PIN" /></svg></span>
      <section class="nw" role="dialog" :aria-label="tr('New comment')" :style="draftBoxAt(draftPos)">
        <CommentComposer :people="people" placeholder="Add a comment" compact autofocus :nudge="draftNudge" @send="(b, m, a) => emit('create', b, m, a)" @cancel="emit('cancelDraft')" @dirty="(v) => emit('draftDirty', v)" />
      </section>
    </template>

    <!-- 열린 스레드: 제목은 늘 'Comment' -->
    <section v-if="open && openPos" ref="thEl" :key="open.root.id" class="sq pop th" role="dialog" aria-labelledby="cmtT" :style="boxAt(openPos)" @keydown.esc.stop="emit('open', null)">
      <div class="pop-top">
        <h2 id="cmtT" class="pop-ttl">{{ tr('Comment') }}</h2>
        <span class="tools">
          <span ref="moreEl" class="more-w">
            <button type="button" class="sq pop-x" :aria-label="tr('More')" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen"><EditorIcon name="menu_kebab" :size="16" /></button>
            <div v-if="moreOpen" class="sq menu mm" role="menu">
              <button type="button" role="menuitem" class="sq menu-item" @click="moreOpen = false; emit('unread', open.root)">{{ tr('Mark as unread') }}</button>
              <button type="button" role="menuitem" class="sq menu-item" @click="moreOpen = false; emit('copyLink', open.root)">{{ tr('Copy link') }}</button>
              <button v-if="canDelete(open.root)" type="button" role="menuitem" class="sq menu-item danger" @click="moreOpen = false; emit('remove', open.root)">{{ tr('Delete thread') }}</button>
            </div>
          </span>
          <button type="button" :class="['sq', 'pop-x', 'rs', { ok: !!open.root.resolved_at }]" :aria-pressed="!!open.root.resolved_at" :aria-label="open.root.resolved_at ? tr('Reopen') : tr('Resolve')" :data-tip="open.root.resolved_at ? tr('Reopen') : tr('Resolve')" @click="emit('resolve', open.root, !open.root.resolved_at)"><EditorIcon name="resolve" :size="18" /></button>
          <button type="button" class="sq pop-x" :aria-label="tr('Close')" @click="emit('open', null)"><EditorIcon name="close" :size="16" /></button>
        </span>
      </div>
      <div v-ovscroll class="pop-body msgs">
        <p v-if="open.root.resolved_at" class="pop-desc done-note">{{ tr('Resolved by {name} · {ago}', { name: nameOf(open.root.resolved_by), ago: relativeTime(open.root.resolved_at) }) }}</p>
        <div v-for="c in [open.root, ...open.replies]" :key="c.id" class="msg">
          <span class="mh">
            <MemberAvatar :name="nameOf(c.author_id)" :src="person(c.author_id)?.avatar" :size="24" /><b>{{ nameOf(c.author_id) }}</b><span class="tx-meta">{{ relativeTime(c.created_at) }}<template v-if="c.edited_at"> · {{ tr('edited') }}</template></span>
            <span v-if="canEditMsg(c) || canDeleteMsg(c, 1 + open.replies.length)" :class="['msg-more', { on: msgMenu === c.id }]">
              <button type="button" class="sq pop-x mb-x" :aria-label="tr('More')" :aria-expanded="msgMenu === c.id" @click="openMsgMenu(c, $event)"><EditorIcon name="menu_meatball" :size="16" /></button>
            </span>
          </span>
          <!-- 고치기: 그 자리에서 입력칸(Cancel · Save) -->
          <CommentComposer v-if="editingId === c.id" class="ed" :people="people" :initial="c.body" editing @send="(b, m) => { editingId = null; if (b !== c.body) emit('edit', c, b, m) }" @cancel="editingId = null" />
          <div v-else-if="c.body" class="body-row">
            <p class="body"><template v-for="(x, i) in parts(c.body)" :key="i"><b v-if="x.m" class="at">{{ x.t }}</b><template v-else>{{ x.t }}</template></template></p>
            <button v-if="!reactionsOf(c).length" type="button" :class="['sq', 'pop-x', 'rx-add', 'rx-hover', { on: rx?.c.id === c.id }]" :aria-label="tr('Add reaction')" :data-tip="tr('Add reaction')" @click="openReact(c, $event)"><EditorIcon name="emoji" :size="16" /></button>
          </div>
          <div v-if="imgCount(c)" class="imgs">
            <button v-for="(src, i) in c.attachments" :key="src" type="button" class="sq img" :aria-label="tr('Open image')" @click="viewImage(c, i)"><img :src="resolveSrc(src)" alt=""></button>
            <!-- 글 없이 이미지만 있으면 😊 는 이미지 줄 끝에 -->
            <button v-if="!c.body && !reactionsOf(c).length" type="button" :class="['sq', 'pop-x', 'rx-add', 'rx-hover', 'rx-img', { on: rx?.c.id === c.id }]" :aria-label="tr('Add reaction')" :data-tip="tr('Add reaction')" @click="openReact(c, $event)"><EditorIcon name="emoji" :size="16" /></button>
          </div>
          <!-- 반응 줄: [이모지 수] … + 😊 -->
          <div v-if="reactionsOf(c).length" class="rx-row">
            <button
              v-for="[emo, ids] in reactionsOf(c)" :key="emo" type="button" :class="['sq', 'rx', { me: mine(ids) }]" :aria-pressed="mine(ids)"
              :aria-label="`${emo} ${ids.length}`" :data-tip="whoReacted(ids)" @click="emit('react', c, emo)"
            ><span class="rx-e">{{ emo }}</span><span class="num">{{ ids.length }}</span></button>
            <button type="button" :class="['sq', 'pop-x', 'rx-add', { on: rx?.c.id === c.id }]" :aria-label="tr('Add reaction')" :data-tip="tr('Add reaction')" @click="openReact(c, $event)"><EditorIcon name="emoji" :size="16" /></button>
          </div>
        </div>
      </div>
      <!-- 글 ⋯ 메뉴: 창 바깥층(글 목록 스크롤에 잘리지 않게) -->
      <div v-if="msgMenuAt" class="sq menu mm msg-more msg-menu" role="menu" :style="{ right: msgMenuAt.right + 'px', top: msgMenuAt.top + 'px', transform: msgMenuAt.up ? 'translateY(-100%)' : undefined }">
        <button v-if="canEditMsg(msgMenuAt.c)" type="button" role="menuitem" class="sq menu-item" @click="editingId = msgMenuAt!.c.id; msgMenu = null">{{ tr('Edit') }}</button>
        <button v-if="canDeleteMsg(msgMenuAt.c, 1 + open.replies.length)" type="button" role="menuitem" class="sq menu-item danger" @click="deleteMsg(msgMenuAt!.c)">{{ tr('Delete') }}</button>
      </div>
      <ImageLightbox v-model:index="lb.index" :images="lb.images" />
      <EmojiPicker v-if="rx" class="rx-pick" :style="{ left: rx.left + 'px', top: rx.top + 'px' }" @pick="pickReaction" @close="rx = null" />
      <div class="foot">
        <MemberAvatar :name="me?.name ?? '?'" :src="me?.avatar" :size="24" class="fa" />
        <CommentComposer :key="open.root.id" up compact :people="people" placeholder="Reply" class="grow" :nudge="replyNudge" @send="(b, m, a) => emit('reply', open!.root, b, m, a)" @cancel="emit('open', null)" @dirty="(v) => emit('replyDirty', v)" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.cl { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 3; }
.cl > :not(.area) { pointer-events: auto; }
/* 영역 코멘트: 파란 점선 2px(피그마와 같아요), 새로 그릴 땐 왼쪽 위에 둥근 손잡이 */
.area { position: absolute; pointer-events: none; outline: 2px dashed var(--sys-color-brand-primary-default); outline-offset: -1px; }
.dot { left: auto; top: auto; margin: -8px 0 0 -8px; cursor: default; pointer-events: auto; z-index: 3; touch-action: none; }
.dot:hover { transform: scale(1.12); }
.corner { position: absolute; left: -8px; top: -8px; width: 16px; height: 16px; border-radius: 50%; background: var(--sys-color-brand-primary-default); box-shadow: 0 0 0 2px var(--sys-color-common-white-emphasis); }
/* 핀: 모양은 위 PIN 경로(svg) */
.pin { position: absolute; width: 36px; height: 36px; user-select: none; -webkit-user-drag: none; padding: 0; border: 0; background: none; display: grid; place-items: center; transition: transform .12s ease; transform-origin: 0 100%; touch-action: none; }
.pin.movable { cursor: grab; }
.pin.dragging, .pin.dragging:hover { cursor: grabbing; transition: none; z-index: 2; transform: none; }
.pin :deep(img), .peek :deep(img) { -webkit-user-drag: none; user-select: none; pointer-events: none; }
.pin > :not(.pin-bg) { position: relative; }
.pin-bg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 2px 3px rgb(3 9 26 / 18%)); }
.pin-bg path { fill: var(--sys-color-common-white-emphasis); stroke: var(--iris-pin-line); stroke-width: 1.25px; vector-effect: non-scaling-stroke; }
.pin:hover { transform: scale(1.08); }
.pin.on .pin-bg path { stroke: var(--sys-color-brand-primary-default); stroke-width: 2px; }
.pin.unread::after { content: ''; position: absolute; top: 0; right: 0; width: 6px; height: 6px; border-radius: 50%; background: var(--sys-color-brand-primary-default); box-shadow: 0 0 0 2px var(--sys-color-common-white-emphasis); }
.pin.done { opacity: .6; }
.pin.draft { pointer-events: none; }
.pin.draft .pin-bg path { fill: var(--sys-color-brand-primary-default); stroke: none; }
.pin:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
/* 마우스 올림 미리보기: 핀(36)이 그 자리에서 커진 카드 — 왼쪽 아래 끝이 핀 끝과 같은 점. 안쪽 여백 8 · 오른쪽 · 아래 넉넉히, 줄 사이 6 */
.peek { position: absolute; z-index: 2; user-select: none; display: flex; gap: var(--ref-spacing-06); align-items: flex-start; min-width: 220px; max-width: 300px; min-height: 36px; box-sizing: border-box; padding: 8px var(--ref-spacing-10) var(--ref-spacing-08) 8px; background: var(--sys-color-common-white-emphasis); border-radius: 22px 22px 22px 0; box-shadow: 0 0 0 1px var(--iris-pin-line), 0 4px 12px rgb(3 9 26 / 12%); cursor: pointer; transform: translateY(-100%); transform-origin: 0 100%; animation: peek-grow .16s cubic-bezier(.2, .8, .2, 1); }
@keyframes peek-grow { from { transform: translateY(-100%) scale(.18, .4); opacity: .4; } to { transform: translateY(-100%) scale(1); opacity: 1; } }
/* 카드가 펼쳐진 동안 원래 핀은 숨겨요(자리 · 마우스는 그대로) */
.pin.hid { opacity: 0; }
.pa { margin: 0; }
.pb { min-width: 0; display: flex; flex-direction: column; gap: var(--ref-spacing-03); padding-top: 5px; font-size: 12px; line-height: 18px; }
.pt { color: var(--sys-color-neutral-800); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
/* 새 코멘트 입력칸: 떠 있는 상자 */
.nw { position: absolute; width: 320px; z-index: 4; filter: drop-shadow(0 4px 12px rgb(3 9 26 / 12%)); }
/* 스레드 창: 사이드바와 같은 얇은 선(라이트 회색 · 다크 흰 10%) — 다크에서 캔버스와 구분돼요 */
.th.pop { overflow: visible; --pop-w: 320px; --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); }
.th { position: absolute; width: 320px; max-height: min(560px, calc(100% - 72px)); z-index: 4; transform-origin: var(--ox, 0%) 40px; animation: th-in .2s cubic-bezier(.2, .8, .2, 1); }
@keyframes th-in { from { opacity: 0; transform: translateX(var(--dx, -8px)) scale(.96); } to { opacity: 1; transform: none; } }
.tools { flex: none; display: flex; align-items: center; gap: var(--ref-spacing-02); }
.pop-x.ok { color: var(--sys-color-theme-success-default, #24A638); }
.rs svg { display: block; }
.more-w { position: relative; }
.mm { top: calc(100% + 4px); left: auto; right: 0; width: 160px; z-index: 6; }
.done-note { color: var(--sys-color-theme-success-default, #1B7A2B); }
/* 본문: 이름 줄(아바타 · 이름 · 시각) 아래에 글 · 이미지(아바타만큼 들여) */
/* 글 목록: 3~4개쯤 보이는 높이(최대 340)에서 넘치면 안쪽 스크롤 — 사이드바와 같은 떠 있는 얇은 막대(v-ovscroll) */
.msgs { flex: 1 1 auto; min-height: 0; max-height: 340px; overflow-y: auto; scrollbar-width: none; }
.msgs::-webkit-scrollbar { display: none; }
.msg { display: flex; flex-direction: column; gap: var(--ref-spacing-03); }
/* 이름 줄: 아바타 · 이름 · 시각 사이 8 */
.mh { display: flex; gap: var(--ref-spacing-06); align-items: center; }
.mh b { font-weight: 600; color: var(--sys-color-neutral-800); }
/* 글마다 ⋯: 줄 오른쪽 끝, 마우스를 올리거나 메뉴가 열렸을 때만 */
.msg-more { position: relative; margin-left: auto; opacity: 0; }
.msg:hover .msg-more, .msg-more.on, .msg-more:focus-within { opacity: 1; }
/* ⋯ 와 아래 😊(28) 가 같은 세로 중심선에 오게: 폭을 28 로 맞춰요(높이는 머리 줄 24) */
.mb-x { width: 28px; height: 24px; }
.msg-menu { position: absolute; left: auto; bottom: auto; width: 140px; z-index: 8; opacity: 1; margin: 0; }
.ed { margin-left: 32px; }
.body { margin: 0; padding-left: 32px; color: var(--sys-color-neutral-800); white-space: pre-wrap; overflow-wrap: anywhere; }
.at { font-weight: 500; color: var(--sys-color-brand-primary-default); }
/* 글 줄: 글 + 오른쪽 😊(마우스를 올렸을 때만) */
.body-row { display: flex; align-items: flex-start; gap: var(--ref-spacing-04); }
.body-row .body { flex: 1; min-width: 0; }
.rx-add { flex: none; width: 28px; height: 28px; border-radius: 14px; color: var(--sys-color-neutral-600); }
.rx-hover { opacity: 0; margin-top: -5px; }
.msg:hover .rx-hover, .rx-hover.on, .rx-hover:focus-visible { opacity: 1; }
.rx-add.on { --sq-fill: var(--sys-color-neutral-100); }
/* 반응 줄: [이모지 수] 칩 — 내가 단 건 연한 파랑 바탕 + 파란 선 */
.rx-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ref-spacing-06); padding-left: 32px; margin-top: var(--ref-spacing-02); }
.rx { height: 28px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: var(--ref-spacing-05); padding: 0 var(--ref-spacing-06); border-radius: 14px; --sq-fill: var(--sys-color-neutral-100); --sq-line: transparent; --sq-line-w: 1px; font-size: 12px; font-weight: 600; color: var(--sys-color-neutral-700); }
.rx:hover { --sq-fill: var(--sys-color-neutral-200); }
.rx.me { --sq-fill: var(--sys-color-brand-primary-lightest); --sq-line: var(--sys-color-brand-primary-default); color: var(--sys-color-brand-primary-default); }
.rx.me:hover { --sq-fill: color-mix(in srgb, var(--sys-color-brand-primary-default) 16%, transparent); }
.rx-e { font-size: 16px; line-height: 1; font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; }
.rx-pick { position: absolute; z-index: 8; }
.rx-img { margin-top: 0; margin-left: auto; align-self: flex-start; }
.imgs { padding-left: 32px; display: flex; flex-wrap: wrap; gap: var(--ref-spacing-04); }
.img { display: block; width: 64px; height: 64px; flex: none; padding: 0; border-radius: var(--ref-radius-04); --sq-line: var(--ref-color-gray-900-10); --sq-line-w: 1px; overflow: hidden; cursor: zoom-in; }
.img img { display: block; width: 100%; height: 100%; object-fit: cover; }
.img:hover img { opacity: .9; }
.img:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 2px; }
/* 아래 답글 줄: 내 아바타 + 한 줄 입력칸 */
.foot { flex: none; display: flex; align-items: flex-start; gap: var(--ref-spacing-06); padding: var(--ref-spacing-04) var(--ref-spacing-10) var(--ref-spacing-10); }
/* 내 프로필: 늘 위에 고정 — 한 줄 입력칸(36)의 가운데 높이(위 6). 입력칸이 펼쳐져도 그 자리 그대로 */
.fa { flex: none; margin-top: 6px; }
.grow { flex: 1; min-width: 0; }
@media (prefers-reduced-motion: reduce) { .pin { transition: none; } .peek, .th { animation: none; } }
</style>
