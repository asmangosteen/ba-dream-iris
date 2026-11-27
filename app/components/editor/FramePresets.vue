<script lang="ts">
/** 마지막으로 펼친 묶음(편집기를 오가도 기억 — 피그마처럼 다시 열면 그대로) */
const lastOpen = ref<string | null>(null)
</script>

<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 프레임 도구(F)를 고르면 오른쪽 패널이 크기 템플릿으로 바뀌어요(피그마와 같아요).
 * 묶음 머리를 누르면 그 묶음만 펼쳐지고(다른 묶음은 접혀요), 줄을 누르면 그 크기 · 이름으로 프레임을 바로 만들어요
 */
const emit = defineEmits<{ pick: [p: { name: string; w: number; h: number }] }>()
const GROUPS: { id: string; items: [string, number, number][] }[] = [
  { id: 'Phone', items: [
    ['iPhone Duo, Closed', 466, 678], ['iPhone Duo, Open', 951, 669], ['iPhone 18 Pro', 402, 874], ['iPhone 18 Pro Max', 440, 956], ['iPhone 17', 402, 874],
    ['iPhone 16 & 17 Pro', 402, 874], ['iPhone 16', 393, 852], ['iPhone 16 & 17 Pro Max', 440, 956], ['iPhone 16 Plus', 430, 932], ['iPhone Air', 420, 912],
    ['iPhone 14 & 15 Pro Max', 430, 932], ['iPhone 14 & 15 Pro', 393, 852], ['iPhone 13 & 14', 390, 844], ['iPhone 14 Plus', 428, 926], ['Android Compact', 412, 917], ['Android Medium', 700, 840],
  ] },
  { id: 'Tablet', items: [['iPad mini 8.3', 744, 1133], ['Surface Pro 8', 1440, 960], ['iPad Pro 11"', 834, 1194], ['iPad Pro 12.9"', 1024, 1366], ['Android Expanded', 1280, 800]] },
  { id: 'Desktop', items: [['MacBook Air', 1280, 832], ['MacBook Pro 14"', 1512, 982], ['MacBook Pro 16"', 1728, 1117], ['Desktop', 1440, 1024], ['Wireframes', 1440, 1024], ['TV', 1280, 720]] },
  { id: 'Presentation', items: [['Slide 16:9', 1920, 1080], ['Slide 4:3', 1024, 768]] },
  { id: 'Paper', items: [['A4', 595, 842], ['A5', 420, 595], ['A6', 297, 420], ['Letter', 612, 792], ['Tabloid', 792, 1224]] },
  { id: 'Social media', items: [
    ['X (Twitter) post', 1200, 675], ['X (Twitter) header', 1500, 500], ['Facebook post', 1200, 630], ['Facebook cover', 820, 312], ['Instagram post', 1080, 1350],
    ['Instagram story', 1080, 1920], ['Dribbble shot', 400, 300], ['Dribbble shot HD', 800, 600], ['LinkedIn cover', 1584, 396],
  ] },
  { id: 'Archive', items: [
    ['iPhone 13 mini', 375, 812], ['iPhone SE', 320, 568], ['iPhone 13 Pro Max', 428, 926], ['iPhone 13 / 13 Pro', 390, 844], ['iPhone 11 Pro Max', 414, 896], ['iPhone 11 Pro / X', 375, 812],
    ['iPhone 8 Plus', 414, 736], ['iPhone 8', 375, 667], ['Android Small', 360, 640], ['Android Large', 360, 800], ['Google Pixel 2', 411, 731], ['Google Pixel 2 XL', 411, 823],
    ['iPad mini 5', 768, 1024], ['Surface Pro 4', 1368, 912], ['MacBook', 1152, 700], ['MacBook Pro', 1440, 900], ['Surface Book', 1500, 1000], ['Apple Watch 42mm', 156, 195],
    ['Apple Watch 38mm', 136, 170], ['iMac', 1280, 720], ['Macintosh 128k', 512, 342],
  ] },
]
const toggle = (id: string) => { lastOpen.value = lastOpen.value === id ? null : id }
</script>

<template>
  <section class="fp" :aria-label="tr('Frame presets')">
    <div class="fp-h">{{ tr('Frame') }}</div>
    <div v-for="g in GROUPS" :key="g.id" class="fp-g">
      <button type="button" class="sq hov fp-gh" :aria-expanded="lastOpen === g.id" @click="toggle(g.id)">
        <EditorIcon name="chevron_down" :size="12" :class="['cv', { rot: lastOpen !== g.id }]" />
        <span>{{ tr(g.id) }}</span>
      </button>
      <div v-if="lastOpen === g.id" class="fp-list" role="list">
        <button v-for="it in g.items" :key="it[0]" type="button" role="listitem" class="sq hov fp-it" @click="emit('pick', { name: it[0], w: it[1], h: it[2] })">
          <span class="nm">{{ it[0] }}</span>
          <span class="sz">{{ it[1] }}×{{ it[2] }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 피그마 프레임 템플릿 패널 — 오른쪽 패널 공통 규격: 머리는 Design 탭 선택 머리와 같게(위 12, 높이 28, 14/22 600, 왼쪽 --iris-insp-x),
   묶음은 섹션처럼 위 1px 선, 묶음 줄(▸ 이름) 32, 펼친 줄 [이름 … 크기] 28 */
.fp { display: flex; flex-direction: column; padding: var(--ref-spacing-08) 0 var(--ref-spacing-12); }
.fp-h { height: 28px; display: flex; align-items: center; margin-bottom: var(--ref-spacing-08); padding: 0 var(--ref-spacing-10) 0 var(--iris-insp-x); font-size: 14px; line-height: 22px; font-weight: 600; color: var(--sys-color-neutral-800); }
.fp-g { box-shadow: 0 -1px 0 var(--iris-line); }
.fp-gh { width: 100%; height: 32px; display: flex; align-items: center; gap: var(--ref-spacing-04); padding: 0 var(--ref-spacing-10) 0 var(--iris-insp-x); font-size: 12px; color: var(--sys-color-neutral-800); text-align: left; border-radius: 0; }
.cv { flex: none; color: var(--sys-color-neutral-500); }
.cv.rot { transform: rotate(-90deg); }
.fp-list { display: flex; flex-direction: column; padding-bottom: var(--ref-spacing-04); }
.fp-it { height: 28px; display: flex; align-items: center; justify-content: space-between; gap: var(--ref-spacing-06); padding: 0 var(--ref-spacing-10) 0 calc(var(--iris-insp-x) + 16px); font-size: 12px; text-align: left; border-radius: 0; }
.nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sys-color-neutral-800); }
.sz { flex: none; color: var(--sys-color-neutral-600); font-variant-numeric: proportional-nums; }
</style>
