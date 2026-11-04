<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number;
    duration?: number;
    colorFrom?: string;
    colorTo?: string;
  }>(),
  {
    size: 200,
    duration: 6,
    colorFrom: '#a3e635',
    colorTo: '#22c55e',
  },
);
</script>

<template>
  <div
    class="border-beam-container"
    :style="{
      '--beam-duration': `${duration}s`,
      '--beam-from': colorFrom,
      '--beam-to': colorTo,
    }"
    aria-hidden="true"
  >
    <div class="beam-glow" />
  </div>
</template>

<style scoped>
.border-beam-container {
  position: absolute;
  inset: -1px;
  pointer-events: none;
  border-radius: inherit;
  overflow: hidden;
  z-index: 1;
}

.beam-glow {
  position: absolute;
  inset: -50%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    transparent 280deg,
    var(--beam-to) 320deg,
    var(--beam-from) 360deg
  );
  animation: rotate-beam var(--beam-duration) linear infinite;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  padding: 1.5px;
}

@keyframes rotate-beam {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
