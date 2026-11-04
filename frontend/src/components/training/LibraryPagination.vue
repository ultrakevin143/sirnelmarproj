<script setup lang="ts">
const page = defineModel<number>({ required: true });
defineProps<{ pageCount: number; rangeStart: number; rangeEnd: number; total: number }>();
</script>

<template>
  <nav class="library-pagination" aria-label="Exercise library pages">
    <p aria-live="polite">
      Showing {{ rangeStart }}–{{ rangeEnd }} of {{ total }} · Page {{ page }} of {{ pageCount }}
    </p>
    <q-pagination
      v-if="pageCount > 1"
      v-model="page"
      :max="pageCount"
      :max-pages="3"
      :boundary-numbers="false"
      :ellipses="false"
      direction-links
      flat
      color="primary"
    />
  </nav>
</template>

<style scoped>
.library-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 20px 0;
}
.library-pagination p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.library-pagination :deep(.q-btn) {
  min-width: 44px;
  min-height: 44px;
}
.library-pagination :deep(.q-btn:not([aria-current='page'])) {
  color: var(--text-primary) !important;
}
@media (max-width: 700px) {
  .library-pagination {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
