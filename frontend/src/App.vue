<template>
  <router-view />
  <aside
    v-if="apiConnectionMessage || apiConnectionError"
    class="connection-notice"
    role="status"
    aria-live="polite"
  >
    <p>{{ apiConnectionMessage || apiConnectionError }}</p>
    <button v-if="!apiConnectionMessage" type="button" @click="reconnect">Retry connection</button>
  </aside>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useTheme } from '@/composables/useTheme';
import { useAuth } from '@/composables/useAuth';
import { apiConnectionMessage, apiConnectionError } from '@/utils/apiAvailability';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';

const { initTheme } = useTheme();
const { reconnect } = useAuth();
initTheme();
onMounted(() => {
  initTheme();
});
</script>

<style scoped>
.connection-notice {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top, 0px));
  right: 12px;
  z-index: 7000;
  max-width: min(360px, calc(100vw - 24px));
  padding: 16px;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
}
.connection-notice p {
  margin: 0;
}
.connection-notice button {
  margin-top: 10px;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--bg-surface-elevated);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.connection-notice button:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 3px;
}
</style>
