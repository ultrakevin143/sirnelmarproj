import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@capacitor/filesystem': fileURLToPath(
        new URL('./src-capacitor/node_modules/@capacitor/filesystem', import.meta.url),
      ),
      '@capacitor/share': fileURLToPath(
        new URL('./src-capacitor/node_modules/@capacitor/share', import.meta.url),
      ),
      '@capacitor/core': fileURLToPath(
        new URL('./src-capacitor/node_modules/@capacitor/core', import.meta.url),
      ),
    },
  },
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'] },
});
