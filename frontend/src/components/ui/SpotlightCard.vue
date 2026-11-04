<script setup lang="ts">
import { ref } from 'vue';

withDefaults(
  defineProps<{
    spotlightColor?: string;
    borderRadius?: string;
    className?: string;
  }>(),
  {
    spotlightColor: 'rgba(163, 230, 53, 0.12)',
    borderRadius: '16px',
    className: '',
  },
);

const cardRef = ref<HTMLElement | null>(null);
const mouseX = ref(-999);
const mouseY = ref(-999);
const isHovered = ref(false);

function handleMouseMove(e: MouseEvent) {
  if (!cardRef.value) return;
  const rect = cardRef.value.getBoundingClientRect();
  mouseX.value = e.clientX - rect.left;
  mouseY.value = e.clientY - rect.top;
  isHovered.value = true;
}

function handleMouseLeave() {
  isHovered.value = false;
  mouseX.value = -999;
  mouseY.value = -999;
}
</script>

<template>
  <div
    ref="cardRef"
    class="spotlight-card-wrapper"
    :class="[className, { 'is-hovered': isHovered }]"
    :style="{
      '--spotlight-color': spotlightColor,
      '--border-radius': borderRadius,
      '--mouse-x': `${mouseX}px`,
      '--mouse-y': `${mouseY}px`,
    }"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <!-- Spotlight glow layer -->
    <div class="spotlight-glow" aria-hidden="true" />
    <!-- Border illumination layer -->
    <div class="spotlight-border" aria-hidden="true" />
    <!-- Inner Card Content -->
    <div class="spotlight-inner">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.spotlight-card-wrapper {
  position: relative;
  border-radius: var(--border-radius);
  background: var(--bg-surface, #131722);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  color: var(--text-primary);
  box-shadow: var(--card-shadow);
  overflow: hidden;
  transition:
    border-color 0.3s cubic-bezier(0.32, 0.72, 0, 1),
    box-shadow 0.3s cubic-bezier(0.32, 0.72, 0, 1),
    transform 0.2s cubic-bezier(0.32, 0.72, 0, 1);
  isolation: isolate;
}

.spotlight-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0;
  transition: opacity 0.4s ease;
  background: radial-gradient(
    450px circle at var(--mouse-x) var(--mouse-y),
    var(--spotlight-color),
    transparent 70%
  );
  z-index: 1;
}

.spotlight-border {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  opacity: 0;
  transition: opacity 0.4s ease;
  border: 1px solid transparent;
  background: radial-gradient(
      280px circle at var(--mouse-x) var(--mouse-y),
      rgba(163, 230, 53, 0.4),
      transparent 80%
    )
    border-box;
  -webkit-mask:
    linear-gradient(#fff 0 0) padding-box,
    linear-gradient(#fff 0 0);
  mask:
    linear-gradient(#fff 0 0) padding-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: destination-out;
  mask-composite: exclude;
  z-index: 2;
}

.spotlight-card-wrapper.is-hovered .spotlight-glow,
.spotlight-card-wrapper.is-hovered .spotlight-border {
  opacity: 1;
}

.spotlight-inner {
  position: relative;
  z-index: 3;
  width: 100%;
  height: 100%;
}
</style>
