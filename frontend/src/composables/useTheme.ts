import { ref } from 'vue';
import { Dark } from 'quasar';

export type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'liftup-theme';
const currentTheme = ref<ThemeMode>('dark');

function applyTheme(theme: ThemeMode) {
  currentTheme.value = theme;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.body.classList.remove('body--light');
      document.body.classList.add('body--dark');
      Dark.set(true);
    } else {
      document.body.classList.remove('body--dark');
      document.body.classList.add('body--light');
      Dark.set(false);
    }
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}

export function useTheme() {
  function initTheme() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
      if (saved === 'light' || saved === 'dark') {
        applyTheme(saved);
        return;
      }
    }
    // Default to dark athletic mode
    applyTheme('dark');
  }

  function toggleTheme() {
    applyTheme(currentTheme.value === 'dark' ? 'light' : 'dark');
  }

  function setTheme(theme: ThemeMode) {
    applyTheme(theme);
  }

  return {
    currentTheme,
    initTheme,
    toggleTheme,
    setTheme,
  };
}
