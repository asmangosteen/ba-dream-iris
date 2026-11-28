<script setup lang="ts">
/**
 * 예전 주소(/requirements — 홈 '정책 · 요청사항 보드'). 2026-11-28 보드는 프로젝트 첫 화면의 요청사항 탭으로 옮겼어요:
 * ?p=<프로젝트> 가 있으면 그 프로젝트의 요청사항 탭, 없으면 홈 문서 메뉴로 보내요(예전 링크 · 북마크가 깨지지 않게)
 */
const route = useRoute()
const p = typeof route.query.p === 'string' ? route.query.p : ''
await navigateTo(p ? `/project/${encodeURIComponent(p)}?view=requests` : '/documents', { replace: true })
</script>

<template>
  <div />
</template>

<style scoped>
/* 예전 이 화면엔 스타일이 있었어요 — 개발 서버가 그 스타일 조각을 계속 찾을 때 오류가 나지 않게 빈 자리를 남겨 둬요 */
div { display: none; }
</style>
