<script setup lang="ts">
/**
 * 예전 주소(/requirements — 홈 '정책 · 요청사항 보드'). 2026-11-28 보드는 프로젝트 첫 화면의 요청사항 탭으로 옮겼어요:
 * ?p=<프로젝트> 가 있으면 그 프로젝트의 요청사항 탭, 없으면 홈 문서 메뉴로 보내요(예전 링크 · 북마크가 깨지지 않게)
 */
const route = useRoute()
const p = typeof route.query.p === 'string' ? route.query.p : ''
await navigateTo(p ? `/p/${encodeURIComponent(p)}/overview?view=requests` : '/documents', { replace: true })
</script>

<template>
  <div />
</template>
