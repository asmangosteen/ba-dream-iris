<script setup lang="ts">
import { Icon } from '@ba-dream/design-system'
import type { ScreenRow } from '~/composables/useEditor'

/** 오른쪽 패널 · 디자인 탭: 화면(프레임) 이름 · 상태 · 위치 · 크기. 값을 바꾸면 캔버스에 바로 반영하고 저장합니다 */
const props = defineProps<{ screen: ScreenRow }>()
const emit = defineEmits<{ update: [patch: Partial<Pick<ScreenRow, 'x' | 'y' | 'width' | 'height' | 'name' | 'status'>>]; remove: [] }>()

const STATUS: { k: ScreenRow['status']; label: string }[] = [
  { k: 'draft', label: '작업 중' },
  { k: 'review', label: '검토 요청' },
  { k: 'approved', label: '확정' },
]
const PRESETS = [
  { label: '모바일', w: 375, h: 812 },
  { label: '모바일 S', w: 360, h: 800 },
  { label: '태블릿', w: 768, h: 1024 },
  { label: '데스크톱', w: 1440, h: 900 },
]

function num(key: 'x' | 'y' | 'width' | 'height', e: Event) {
  const input = e.target as HTMLInputElement
  const v = Number(input.value.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(v) || ((key === 'width' || key === 'height') && v < 1)) { input.value = String(Math.round(props.screen[key])); return }
  if (Math.round(v) !== Math.round(props.screen[key])) emit('update', { [key]: Math.round(v) })
}
function rename(e: Event) {
  const v = (e.target as HTMLInputElement).value.trim()
  if (v && v !== props.screen.name) emit('update', { name: v })
  else (e.target as HTMLInputElement).value = props.screen.name
}
/** 화살표 키로 1씩(Shift 는 10씩) 바꾸기 */
function step(key: 'x' | 'y' | 'width' | 'height', e: KeyboardEvent) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
  e.preventDefault()
  const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
  const v = Math.max(key === 'width' || key === 'height' ? 1 : -1e9, Math.round(props.screen[key]) + d)
  emit('update', { [key]: v })
}
const statusOpen = ref(false)
const presetOpen = ref(false)
const confirmDelete = ref(false)
watch(() => props.screen.id, () => { confirmDelete.value = false; statusOpen.value = false; presetOpen.value = false })
</script>

<template>
  <div class="design">
    <section class="s">
      <div class="sec-h h24"><span>화면</span></div>
      <label class="sq fld"><span>이름</span><input :key="screen.id + screen.name" :value="screen.name" aria-label="화면 이름" @change="rename" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
      <span class="sub">상태</span>
      <div class="rel">
        <button :class="['sq', 'dd', { open: statusOpen }]" :aria-expanded="statusOpen" @click="statusOpen = !statusOpen">
          <span>{{ STATUS.find((s) => s.k === screen.status)?.label }}</span><Icon name="chevron_down" :size="12" class="muted" />
        </button>
        <div v-if="statusOpen" class="sq menu" role="listbox">
          <button v-for="s in STATUS" :key="s.k" role="option" :aria-selected="screen.status === s.k" :class="['sq', 'menu-item', { on: screen.status === s.k }]" @click="emit('update', { status: s.k }); statusOpen = false">{{ s.label }}</button>
        </div>
      </div>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>위치</span></div>
      <div class="grid2">
        <label class="sq fld"><span>X</span><input :key="'x' + screen.x" :value="Math.round(screen.x)" inputmode="numeric" aria-label="X" @change="num('x', $event)" @keydown="step('x', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
        <label class="sq fld"><span>Y</span><input :key="'y' + screen.y" :value="Math.round(screen.y)" inputmode="numeric" aria-label="Y" @change="num('y', $event)" @keydown="step('y', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
      </div>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>크기</span></div>
      <div class="rel">
        <button :class="['sq', 'dd', { open: presetOpen }]" :aria-expanded="presetOpen" @click="presetOpen = !presetOpen">
          <span>{{ PRESETS.find((p) => p.w === screen.width && p.h === screen.height)?.label ?? '직접 입력' }}</span><Icon name="chevron_down" :size="12" class="muted" />
        </button>
        <div v-if="presetOpen" class="sq menu" role="listbox">
          <button v-for="p in PRESETS" :key="p.label" role="option" :aria-selected="p.w === screen.width && p.h === screen.height" :class="['sq', 'menu-item', { on: p.w === screen.width && p.h === screen.height }]" @click="emit('update', { width: p.w, height: p.h }); presetOpen = false">
            <span class="f1">{{ p.label }}</span><span class="tx-meta num">{{ p.w }} × {{ p.h }}</span>
          </button>
        </div>
      </div>
      <div class="grid2">
        <label class="sq fld"><span>W</span><input :key="'w' + screen.width" :value="Math.round(screen.width)" inputmode="numeric" aria-label="너비" @change="num('width', $event)" @keydown="step('width', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
        <label class="sq fld"><span>H</span><input :key="'h' + screen.height" :value="Math.round(screen.height)" inputmode="numeric" aria-label="높이" @change="num('height', $event)" @keydown="step('height', $event)" @keydown.enter="($event.target as HTMLInputElement).blur()"></label>
      </div>
    </section>

    <section class="s">
      <div class="sec-h h24"><span>레이어</span></div>
      <p class="tx-meta m0">화면 안 사각형 · 텍스트 · 이미지 편집은 다음 단계에서 열려요.</p>
    </section>

    <section class="s">
      <button v-if="!confirmDelete" class="act line full" @click="confirmDelete = true"><Icon name="trashbin" :size="12" />화면 지우기</button>
      <div v-else class="confirm">
        <span class="tx-meta">연결된 요구사항 상태도 함께 지워져요. 되돌릴 수 없어요.</span>
        <span class="row-end"><button class="act gray" @click="confirmDelete = false">취소</button><button class="act line danger" @click="emit('remove')">지우기</button></span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.design { padding-bottom: var(--ref-spacing-12); display: flex; flex-direction: column; }
.s { padding: var(--ref-spacing-07) var(--ref-spacing-10) var(--ref-spacing-08); display: flex; flex-direction: column; gap: var(--ref-spacing-04); box-shadow: 0 -1px 0 var(--iris-line); }
.s:first-child { box-shadow: none; }
.h24 { height: 24px; padding: 0; }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-04); }
.rel { position: relative; min-width: 0; }
.muted { color: var(--sys-color-neutral-500); }
.f1 { flex: 1; }
.m0 { margin: 0; }
.full { width: 100%; }
.confirm { display: flex; flex-direction: column; gap: var(--ref-spacing-04); }
.row-end { display: flex; justify-content: flex-end; gap: var(--ref-spacing-04); }
.danger { color: var(--sys-color-theme-error-default); }
</style>
