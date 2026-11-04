<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number;
    color?: string;
  }>(),
  {
    size: 26,
    color: '#a3e635',
  },
);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="liftup-logo-svg"
    aria-hidden="true"
  >
    <!-- Barbell Plates -->
    <rect x="2" y="6" width="2" height="7" rx="1" :fill="color" />
    <rect x="28" y="6" width="2" height="7" rx="1" :fill="color" />
    <rect x="4.5" y="7" width="1.5" height="5" rx="0.75" :fill="color" />
    <rect x="26" y="7" width="1.5" height="5" rx="0.75" :fill="color" />

    <!-- Barbell Bar -->
    <path d="M3 9.5H29" :stroke="color" stroke-width="2" stroke-linecap="round" />

    <!-- Lifter Head -->
    <circle cx="16" cy="11.5" r="2.5" :fill="color" />

    <!-- Lifter Arms (Locked overhead pushing barbell) -->
    <path
      d="M16 15L10 9.5M16 15L22 9.5"
      :stroke="color"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <!-- Lifter Torso -->
    <path d="M16 15V22" :stroke="color" stroke-width="2.2" stroke-linecap="round" />

    <!-- Lifter Legs (Athletic power stance) -->
    <path
      d="M16 22L11.5 28.5M16 22L20.5 28.5"
      :stroke="color"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.liftup-logo-svg {
  display: block;
  flex-shrink: 0;
  transition: transform 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}
</style>
