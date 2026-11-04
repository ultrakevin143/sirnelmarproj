import { defineBoot } from '#q-app';
import axios from 'axios';
import { CapacitorHttp, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { watch } from 'vue';
import { useTheme } from '@/composables/useTheme';
import { createNativeApiAdapter } from '@/utils/nativeApi';

export default defineBoot(async () => {
  axios.defaults.adapter = createNativeApiAdapter((options) => CapacitorHttp.request(options));
  await Promise.all([
    Keyboard.addListener('keyboardWillShow', () =>
      document.body.classList.add('liftup-keyboard-open'),
    ),
    Keyboard.addListener('keyboardWillHide', () =>
      document.body.classList.remove('liftup-keyboard-open'),
    ),
  ]);
  const { currentTheme } = useTheme();
  watch(
    currentTheme,
    (theme) => {
      void SystemBars.setStyle({
        style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
      });
    },
    { immediate: true },
  );
});
