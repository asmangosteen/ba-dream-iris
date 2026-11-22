<script setup lang="ts">
import { EmptyState } from '@ba-dream/design-system'
</script>

<template>
  <div class="shell">
    <AppTopBar />
    <main class="sq float body">
      <h1 class="tx-title">요구사항</h1>
      <EmptyState on="section" title="아직 준비 중이에요" :show-icon="false" />
    </main>
  </div>
</template>

<style scoped>
.shell { height: 100vh; position: relative; overflow: hidden; box-sizing: border-box; padding: 56px var(--iris-gap) var(--iris-gap); display: flex; background: var(--iris-canvas); font-size: 12px; line-height: 18px; }
.body { flex: 1; min-width: 0; overflow: auto; padding: var(--ref-spacing-12) var(--ref-spacing-14); }
</style>
