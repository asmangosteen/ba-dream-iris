<script setup lang="ts">
import AppConfirm from '~/components/app/AppConfirm.vue'
import ScreenThumb from '~/components/editor/ScreenThumb.vue'
import MemberAvatar from '~/components/app/MemberAvatar.vue'
import type { ScreenRow } from '~/composables/useEditor'
import { relativeTime } from '~/composables/useProjects'

/**
 * 저장 충돌 창(PRD/16 J-2) — 공용 확인 창(AppConfirm) 양식. 같은 화면을 다른 사람이 먼저 저장했을 때
 * '그 사람 것' · '내 것' 미리보기를 나란히 두고 하나를 골라요(고르지 않고 닫을 수 없어요 — 둘 중 하나는 사라지니까)
 */
const props = defineProps<{ screen: ScreenRow; mine: unknown; theirs: unknown; byName: string; byAvatar?: string | null; at: string; myName: string; myAvatar?: string | null; busy?: boolean }>()
const emit = defineEmits<{ keepMine: []; useTheirs: [] }>()
const keep = ref<'theirs' | 'mine'>('theirs')
const thumb = (layers: unknown) => ({ ...props.screen, layers })
</script>

<template>
  <AppConfirm
    :title="tr('Someone saved this frame first')"
    :desc="tr('{name} saved {frame} while you were editing it. Choose which version to keep', { name: byName, frame: screen.name })"
    :closable="false"
    :actions="[{ label: keep === 'mine' ? tr('Keep mine') : tr('Use theirs'), kind: 'primary', loading: busy, onClick: () => (keep === 'mine' ? emit('keepMine') : emit('useTheirs')) }]"
  >
    <div class="opts" role="radiogroup" :aria-label="tr('Version to keep')">
      <button type="button" role="radio" :aria-checked="keep === 'theirs'" :class="['sq', 'opt', { on: keep === 'theirs' }]" @click="keep = 'theirs'">
        <span class="sq sq-clip pv"><ScreenThumb :screen="thumb(theirs)" fit="width" /></span>
        <span class="who"><MemberAvatar :name="byName" :src="byAvatar" :size="18" /><b>{{ tr('Their version') }}</b></span>
        <span class="tx-meta">{{ tr('{name} · saved {ago}', { name: byName, ago: relativeTime(at) }) }}</span>
      </button>
      <button type="button" role="radio" :aria-checked="keep === 'mine'" :class="['sq', 'opt', { on: keep === 'mine' }]" @click="keep = 'mine'">
        <span class="sq sq-clip pv"><ScreenThumb :screen="thumb(mine)" fit="width" /></span>
        <span class="who"><MemberAvatar :name="myName" :src="myAvatar" :size="18" /><b>{{ tr('Your version') }}</b></span>
        <span class="tx-meta">{{ tr('You · not saved') }}</span>
      </button>
    </div>
    <p class="tx-meta">{{ keep === 'mine' ? tr('Their changes to this frame are replaced with yours') : tr('Your changes to this frame are dropped. Other frames keep your changes') }}</p>
  </AppConfirm>
</template>

<style scoped>
.opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ref-spacing-04); }
.opt { display: flex; flex-direction: column; gap: var(--ref-spacing-04); padding: var(--ref-spacing-05); border-radius: var(--ref-radius-05); text-align: left; --sq-line: var(--sys-color-neutral-300); --sq-line-w: 1px; }
.opt:hover { --sq-fill: var(--sys-color-neutral-50); }
.opt.on { --sq-fill: var(--sys-color-brand-primary-lightest); --sq-line: var(--sys-color-brand-primary-default); --sq-line-w: 1.5px; }
.opt:focus-visible { outline: 2px solid var(--sys-color-brand-primary-default); outline-offset: 1px; }
.pv { height: 96px; border-radius: var(--ref-radius-03); --sq-fill: var(--sys-color-neutral-100); display: grid; place-items: center; overflow: hidden; }
.who { display: flex; align-items: center; gap: var(--ref-spacing-03); }
.who b { font-weight: 600; color: var(--sys-color-neutral-800); }
p.tx-meta { margin: 0; }
</style>
