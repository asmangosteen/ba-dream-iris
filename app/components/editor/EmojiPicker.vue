<script setup lang="ts">
import EditorIcon from '~/components/editor/EditorIcon.vue'

/**
 * 이모지 고르기(코멘트 입력 도구 막대 — 피그마와 같아요): 위 갈래 아이콘 · 검색 · 자주 쓴 것 · 갈래별 격자.
 * 그림은 운영체제 기본 이모지 글꼴 그대로(맥이면 Apple 이모지). 검색은 영어 · 한국어 낱말로
 */
const emit = defineEmits<{ pick: [emoji: string]; close: [] }>()

type E = [string, string]
const CATS: { key: string; icon: string; label: string; list: E[] }[] = [
  { key: 'smileys', icon: 'smile', label: 'Smileys & People', list: [
    ['😀', 'grin smile happy 웃음'], ['😃', 'smile happy 웃음'], ['😄', 'smile laugh 웃음'], ['😁', 'grin 웃음'], ['😆', 'laugh 웃음'], ['😅', 'sweat 땀'], ['🤣', 'rofl laugh 웃음'], ['😂', 'joy tears laugh 웃음 눈물'], ['🙂', 'slight smile 미소'], ['🙃', 'upside 거꾸로'], ['😉', 'wink 윙크'], ['😊', 'blush 미소'], ['😇', 'angel 천사'], ['🥰', 'love hearts 사랑'], ['😍', 'heart eyes love 사랑'], ['🤩', 'star struck 별'], ['😘', 'kiss 뽀뽀'], ['😋', 'yum 맛'], ['😜', 'wink tongue 메롱'], ['🤪', 'zany 장난'], ['🤗', 'hug 포옹'], ['🤭', 'oops 웁스'], ['🤫', 'shush 쉿'], ['🤔', 'think 생각'], ['🫡', 'salute 경례'], ['🤐', 'zip 입다물기'], ['😐', 'neutral 무표정'], ['😑', 'expressionless 무표정'], ['😶', 'no mouth'], ['😏', 'smirk 씩'], ['😒', 'unamused 시큰둥'], ['🙄', 'eye roll 눈굴림'], ['😬', 'grimace 으'], ['😌', 'relieved 안도'], ['😔', 'pensive 시무룩'], ['😪', 'sleepy 졸림'], ['😴', 'sleep 잠'], ['😷', 'mask 마스크'], ['🤯', 'mind blown 충격'], ['🥳', 'party 파티'], ['😎', 'cool 멋짐'], ['🤓', 'nerd 공부'], ['😕', 'confused 혼란'], ['😟', 'worried 걱정'], ['😮', 'wow 놀람'], ['😲', 'astonished 놀람'], ['🥺', 'pleading 부탁'], ['😢', 'cry 눈물'], ['😭', 'sob 엉엉'], ['😱', 'scream 비명'], ['😤', 'triumph 흥'], ['😡', 'angry 화'], ['🤬', 'swear 욕'], ['💀', 'skull 해골'], ['👀', 'eyes 눈 봐'], ['🙇', 'bow 인사 죄송'], ['🙆', 'ok 좋아'], ['🙅', 'no 안돼'], ['🤷', 'shrug 몰라'], ['🙋', 'raise hand 손'],
  ] },
  { key: 'hands', icon: 'heart', label: 'Hands & Hearts', list: [
    ['👍', 'thumbs up like 좋아요'], ['👎', 'thumbs down 싫어요'], ['👌', 'ok 오케이'], ['✌️', 'victory peace 브이'], ['🤞', 'fingers crossed 행운'], ['🤟', 'love you'], ['🤘', 'rock'], ['👏', 'clap 박수'], ['🙌', 'raise hands 만세'], ['🙏', 'pray thanks 감사 부탁'], ['🤝', 'handshake 악수'], ['💪', 'muscle strong 힘'], ['👋', 'wave hi bye 안녕'], ['☝️', 'point up 위'], ['👉', 'point right 오른쪽'], ['👈', 'point left 왼쪽'], ['👇', 'point down 아래'], ['✋', 'hand stop 손'], ['✍️', 'write 쓰기'], ['❤️', 'heart love red 하트'], ['🧡', 'orange heart 하트'], ['💛', 'yellow heart 하트'], ['💚', 'green heart 하트'], ['💙', 'blue heart 하트'], ['💜', 'purple heart 하트'], ['🖤', 'black heart 하트'], ['🤍', 'white heart 하트'], ['💔', 'broken heart 하트'], ['💯', 'hundred perfect 백점'], ['💢', 'anger 화'], ['💥', 'boom 쾅'], ['💫', 'dizzy 별'], ['💬', 'speech 말풍선'], ['💭', 'thought 생각'],
  ] },
  { key: 'nature', icon: 'leaf', label: 'Animals & Nature', list: [
    ['🐶', 'dog 강아지'], ['🐱', 'cat 고양이'], ['🐭', 'mouse 쥐'], ['🐰', 'rabbit 토끼'], ['🦊', 'fox 여우'], ['🐻', 'bear 곰'], ['🐼', 'panda 판다'], ['🐨', 'koala'], ['🐯', 'tiger 호랑이'], ['🦁', 'lion 사자'], ['🐷', 'pig 돼지'], ['🐸', 'frog 개구리'], ['🐵', 'monkey 원숭이'], ['🐔', 'chicken 닭'], ['🐧', 'penguin 펭귄'], ['🐥', 'chick 병아리'], ['🦄', 'unicorn 유니콘'], ['🐝', 'bee 벌'], ['🦋', 'butterfly 나비'], ['🐢', 'turtle 거북'], ['🐙', 'octopus 문어'], ['🐳', 'whale 고래'], ['🌵', 'cactus 선인장'], ['🌲', 'tree 나무'], ['🌱', 'seedling 새싹'], ['🍀', 'clover 행운'], ['🌸', 'blossom 벚꽃'], ['🌹', 'rose 장미'], ['🌻', 'sunflower 해바라기'], ['🌈', 'rainbow 무지개'], ['☀️', 'sun 해'], ['🌙', 'moon 달'], ['⭐', 'star 별'], ['🔥', 'fire hot 불'], ['💧', 'drop 물'], ['❄️', 'snow 눈'], ['⚡', 'zap lightning 번개'],
  ] },
  { key: 'food', icon: 'food', label: 'Food & Drink', list: [
    ['🍎', 'apple 사과'], ['🍊', 'orange 귤'], ['🍋', 'lemon 레몬'], ['🍌', 'banana 바나나'], ['🍉', 'watermelon 수박'], ['🍇', 'grapes 포도'], ['🍓', 'strawberry 딸기'], ['🍑', 'peach 복숭아'], ['🥑', 'avocado'], ['🌽', 'corn 옥수수'], ['🥕', 'carrot 당근'], ['🍞', 'bread 빵'], ['🧀', 'cheese 치즈'], ['🍳', 'egg 계란'], ['🍔', 'burger 햄버거'], ['🍟', 'fries 감자튀김'], ['🍕', 'pizza 피자'], ['🌭', 'hotdog'], ['🌮', 'taco'], ['🍜', 'noodles ramen 라면'], ['🍣', 'sushi 초밥'], ['🍙', 'rice ball 주먹밥'], ['🍚', 'rice 밥'], ['🍗', 'chicken 치킨'], ['🍰', 'cake 케이크'], ['🎂', 'birthday cake 생일'], ['🍩', 'donut 도넛'], ['🍪', 'cookie 쿠키'], ['🍫', 'chocolate 초콜릿'], ['🍦', 'ice cream 아이스크림'], ['☕', 'coffee 커피'], ['🍵', 'tea 차'], ['🧋', 'bubble tea 버블티'], ['🍺', 'beer 맥주'], ['🍻', 'cheers 건배'], ['🥂', 'champagne 건배'], ['🍷', 'wine 와인'],
  ] },
  { key: 'activity', icon: 'ball', label: 'Activities', list: [
    ['⚽', 'soccer 축구'], ['🏀', 'basketball 농구'], ['⚾', 'baseball 야구'], ['🎾', 'tennis 테니스'], ['🏐', 'volleyball 배구'], ['🏓', 'ping pong 탁구'], ['🏸', 'badminton 배드민턴'], ['⛳', 'golf 골프'], ['🎯', 'target goal 목표'], ['🏆', 'trophy win 우승'], ['🥇', 'gold medal 금메달'], ['🎉', 'party tada 축하'], ['🎊', 'confetti 축하'], ['🎈', 'balloon 풍선'], ['🎁', 'gift 선물'], ['🎮', 'game 게임'], ['🎲', 'dice 주사위'], ['🧩', 'puzzle 퍼즐'], ['🎨', 'art palette 그림'], ['🎬', 'movie 영화'], ['🎤', 'mic 노래'], ['🎧', 'headphones 음악'], ['🎵', 'music 음악'], ['🎸', 'guitar 기타'], ['🏃', 'run 달리기'], ['🚴', 'bike 자전거'],
  ] },
  { key: 'travel', icon: 'car', label: 'Travel & Places', list: [
    ['🚗', 'car 자동차'], ['🚕', 'taxi 택시'], ['🚌', 'bus 버스'], ['🚓', 'police 경찰'], ['🚑', 'ambulance 구급차'], ['🏍️', 'motorcycle 오토바이'], ['🛵', 'scooter 스쿠터'], ['🛴', 'kick scooter 킥보드'], ['🚲', 'bicycle 자전거'], ['🔋', 'battery 배터리'], ['⛽', 'fuel 주유'], ['🚦', 'traffic light 신호등'], ['🚧', 'construction 공사'], ['🚀', 'rocket launch 출시'], ['✈️', 'airplane 비행기'], ['🚆', 'train 기차'], ['🚢', 'ship 배'], ['🏠', 'house 집'], ['🏢', 'office 회사'], ['🏪', 'store 가게'], ['🏥', 'hospital 병원'], ['🗺️', 'map 지도'], ['📍', 'pin location 위치'], ['🌏', 'earth globe 지구'], ['⛰️', 'mountain 산'], ['🏖️', 'beach 바다'],
  ] },
  { key: 'objects', icon: 'bulb', label: 'Objects', list: [
    ['💡', 'idea bulb 아이디어'], ['📱', 'phone 휴대폰'], ['💻', 'laptop 노트북'], ['🖥️', 'desktop 모니터'], ['⌨️', 'keyboard 키보드'], ['🖱️', 'mouse 마우스'], ['📷', 'camera 카메라'], ['🔍', 'search 검색'], ['🔒', 'lock 잠금'], ['🔑', 'key 열쇠'], ['🔧', 'wrench 수리'], ['🔨', 'hammer 망치'], ['⚙️', 'gear settings 설정'], ['🧪', 'test 실험'], ['📦', 'package box 상자'], ['📌', 'pin 고정'], ['📎', 'clip 클립'], ['📝', 'memo note 메모'], ['📄', 'document 문서'], ['📊', 'chart 차트'], ['📈', 'up graph 상승'], ['📉', 'down graph 하락'], ['📅', 'calendar 달력'], ['⏰', 'alarm 알람'], ['⏳', 'hourglass 대기'], ['💰', 'money 돈'], ['💳', 'card 카드'], ['🧾', 'receipt 영수증'], ['✉️', 'mail 메일'], ['📣', 'announce 공지'], ['🔔', 'bell 알림'], ['🛒', 'cart 장바구니'],
  ] },
  { key: 'symbols', icon: 'flag', label: 'Symbols', list: [
    ['✅', 'check done 완료'], ['☑️', 'checkbox 체크'], ['✔️', 'check 체크'], ['❌', 'x cross no 아니오'], ['❗', 'exclamation 느낌표'], ['❓', 'question 물음표'], ['⚠️', 'warning 주의'], ['🚫', 'no prohibited 금지'], ['⛔', 'stop 금지'], ['➕', 'plus 더하기'], ['➖', 'minus 빼기'], ['➡️', 'right arrow 오른쪽'], ['⬅️', 'left arrow 왼쪽'], ['⬆️', 'up arrow 위'], ['⬇️', 'down arrow 아래'], ['🔄', 'repeat 반복'], ['🆕', 'new 새'], ['🆗', 'ok'], ['🔴', 'red circle 빨강'], ['🟠', 'orange circle 주황'], ['🟡', 'yellow circle 노랑'], ['🟢', 'green circle 초록'], ['🔵', 'blue circle 파랑'], ['⚪', 'white circle 하양'], ['⚫', 'black circle 검정'], ['🔺', 'up triangle'], ['🔻', 'down triangle'], ['💲', 'dollar 달러'], ['#️⃣', 'hash 샵'], ['🇰🇷', 'korea 한국 태극기'], ['🏁', 'finish 끝'], ['🚩', 'flag 깃발'],
  ] },
]
const ALL = CATS.flatMap((c) => c.list)

/** 자주 쓴 것: 이 기기에 남겨요(없거나 못 읽으면 기본 몇 개) */
const RKEY = 'iris-emoji-recent'
const DEFAULT_RECENT = ['👍', '👀', '😍', '😂', '🔥', '😀', '✅', '🙏', '🤔']
const recent = ref<string[]>(DEFAULT_RECENT)
onMounted(() => { try { const v = JSON.parse(localStorage.getItem(RKEY) || 'null'); if (Array.isArray(v) && v.length) recent.value = v.slice(0, 18) } catch { /* 기본값 */ } })
function pick(e: string) {
  recent.value = [e, ...recent.value.filter((x) => x !== e)].slice(0, 18)
  try { localStorage.setItem(RKEY, JSON.stringify(recent.value)) } catch { /* 저장 못 해도 넣기는 돼요 */ }
  emit('pick', e)
}

const q = ref('')
const qFocus = ref(false)
const found = computed(() => { const s = q.value.trim().toLowerCase(); return s ? ALL.filter(([, k]) => k.toLowerCase().includes(s)).map(([e]) => e) : null })
const scroller = ref<HTMLElement | null>(null)
const active = ref('recent')
function go(key: string) {
  q.value = ''
  active.value = key
  nextTick(() => { const el = scroller.value?.querySelector<HTMLElement>(`[data-cat="${key}"]`); if (el && scroller.value) scroller.value.scrollTop = el.offsetTop - scroller.value.offsetTop })
}
function onScroll() {
  const sc = scroller.value
  if (!sc || found.value) return
  const heads = [...sc.querySelectorAll<HTMLElement>('[data-cat]')]
  const top = sc.scrollTop + sc.offsetTop + 8
  active.value = heads.filter((h) => h.offsetTop <= top).pop()?.dataset.cat ?? 'recent'
}
const searchEl = ref<HTMLInputElement | null>(null)
onMounted(() => nextTick(() => searchEl.value?.focus()))
</script>

<template>
  <div class="sq ep" role="dialog" :aria-label="tr('Emoji')" @keydown.esc.stop.prevent="emit('close')" @mousedown.prevent.self>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" :aria-selected="active === 'recent'" :class="['sq', 'tb', { on: active === 'recent' }]" :aria-label="tr('Frequently used')" :data-tip="tr('Frequently used')" @click="go('recent')"><EditorIcon name="clock" :size="16" /></button>
      <button v-for="c in CATS" :key="c.key" type="button" role="tab" :aria-selected="active === c.key" :class="['sq', 'tb', { on: active === c.key }]" :aria-label="tr(c.label)" :data-tip="tr(c.label)" @click="go(c.key)"><EditorIcon :name="c.icon" :size="16" /></button>
    </div>
    <!-- 검색칸: 왼쪽 Assets 검색칸과 같은 편집기 입력칸(.field 28 · 12px) -->
    <label :class="['sq', 'field', 'srch', { focus: qFocus }]">
      <EditorIcon name="search" :size="16" class="qi" />
      <input ref="searchEl" v-model="q" type="search" spellcheck="false" autocomplete="off" :placeholder="tr('Search')" :aria-label="tr('Search emoji')" @focus="qFocus = true" @blur="qFocus = false">
      <button v-if="q" type="button" class="sq qx" :aria-label="tr('Clear search')" @click="q = ''"><EditorIcon name="close" :size="12" /></button>
    </label>
    <div ref="scroller" class="grid-w" @scroll="onScroll">
      <template v-if="found">
        <div v-if="found.length" class="grid"><button v-for="e in found" :key="e" type="button" class="sq em" :aria-label="e" @click="pick(e)">{{ e }}</button></div>
        <p v-else class="tx-meta none">{{ tr('No emoji found') }}</p>
      </template>
      <template v-else>
        <h3 class="ch" data-cat="recent">{{ tr('Frequently used') }}</h3>
        <div class="grid"><button v-for="e in recent" :key="'r' + e" type="button" class="sq em" :aria-label="e" @click="pick(e)">{{ e }}</button></div>
        <template v-for="c in CATS" :key="c.key">
          <h3 class="ch" :data-cat="c.key">{{ tr(c.label) }}</h3>
          <div class="grid"><button v-for="[e] in c.list" :key="e" type="button" class="sq em" :aria-label="e" @click="pick(e)">{{ e }}</button></div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ep { width: 300px; display: flex; flex-direction: column; border-radius: var(--ref-radius-08); --sq-fill: var(--sys-color-common-white-emphasis); --sq-line: var(--iris-float-line); --sq-line-w: var(--iris-float-line-w); filter: var(--iris-float-shadow); overflow: hidden; }
.tabs { flex: none; display: flex; justify-content: space-between; padding: var(--ref-spacing-04) var(--ref-spacing-06) 0; border-bottom: 1px solid var(--iris-line); }
.tb { width: 28px; height: 32px; display: grid; place-items: center; color: var(--sys-color-neutral-500); border-radius: var(--ref-radius-03); box-shadow: inset 0 -2px 0 transparent; }
.tb:hover { color: var(--sys-color-neutral-800); }
.tb.on { color: var(--sys-color-brand-primary-default); box-shadow: inset 0 -2px 0 var(--sys-color-brand-primary-default); border-radius: 0; }
.srch { flex: none; margin: var(--ref-spacing-06) var(--ref-spacing-06) var(--ref-spacing-02); cursor: text; }
.srch input { -webkit-appearance: none; appearance: none; padding: 0; }
.srch input::-webkit-search-cancel-button { display: none; }
.qi { flex: none; color: var(--sys-color-neutral-500); }
.qx { flex: none; width: 20px; height: 20px; display: grid; place-items: center; border-radius: var(--ref-radius-02); color: var(--sys-color-neutral-500); margin-right: calc(-1 * var(--ref-spacing-02)); }
.qx:hover { --sq-overlay: var(--interaction-light-gray-hover); color: var(--sys-color-neutral-800); }
.grid-w { height: 260px; overflow-y: auto; padding: 0 var(--ref-spacing-06) var(--ref-spacing-06); position: relative; }
.ch { margin: var(--ref-spacing-06) 0 var(--ref-spacing-02); font-size: 12px; font-weight: 600; color: var(--sys-color-neutral-800); }
.grid { display: grid; grid-template-columns: repeat(8, 1fr); }
.em { aspect-ratio: 1; display: grid; place-items: center; font-size: 20px; line-height: 1; border-radius: var(--ref-radius-04); font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; }
.em:hover { --sq-fill: var(--sys-color-neutral-100); }
.none { padding: var(--ref-spacing-10) 0; text-align: center; }
</style>
