import { ref, computed } from 'vue';
import axios from 'axios';
import { setTrainingPreferences, type TrainingPreferences } from './useTrainingPreferences';
import { verifyLiftUpApi, LiftUpConnectionError } from '@/utils/apiAvailability';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  experienceLevel: ExperienceLevel;
  joinedAt: string;
  settings?: TrainingPreferences;
}

const currentUser = ref<UserProfile | null>(null);
const authDialogOpen = ref(false);
const authDialogMode = ref<'login' | 'register'>('register');
const showBeginnerGuide = ref(true);
const connectionError = ref('');
let checkedSession = false;
let sessionRequest: Promise<void> | null = null;

axios.defaults.headers.common['X-LiftUp-Request'] = '1';
axios.interceptors.request.use(async (config) => {
  if (
    /^\/api\/auth\/(login|register|change-password|account)$/.test(config.url ?? '') &&
    !['get', 'head', 'options'].includes(config.method ?? 'get')
  ) {
    await verifyLiftUpApi();
    connectionError.value = '';
  }
  return config;
});
axios.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      !error.config?.url?.startsWith('/api/auth')
    ) {
      currentUser.value = null;
      authDialogMode.value = 'login';
      authDialogOpen.value = true;
    }
    throw error instanceof Error ? error : new Error('Request failed.');
  },
);

function discardOldProfile() {
  try {
    localStorage.removeItem('liftup-current-user');
  } catch {
    /* Storage is optional. */
  }
}

async function ensureSession() {
  if (checkedSession) return;
  sessionRequest ??= (async () => {
    discardOldProfile();
    try {
      await verifyLiftUpApi();
      connectionError.value = '';
      currentUser.value = (await axios.get<{ user: UserProfile }>('/api/auth/me')).data.user;
      setTrainingPreferences(currentUser.value.settings);
      checkedSession = true;
    } catch (error) {
      if (error instanceof LiftUpConnectionError) connectionError.value = error.message;
      currentUser.value = null;
      if (axios.isAxiosError(error) && error.response?.status === 401) checkedSession = true;
    } finally {
      sessionRequest = null;
    }
  })();
  await sessionRequest;
}

export function useAuth() {
  const isLoggedIn = computed(() => !!currentUser.value);
  const isBeginner = computed(() => currentUser.value?.experienceLevel === 'beginner');
  function openRegister() {
    authDialogMode.value = 'register';
    authDialogOpen.value = true;
  }
  function openLogin() {
    authDialogMode.value = 'login';
    authDialogOpen.value = true;
  }
  function closeAuthDialog() {
    authDialogOpen.value = false;
  }

  async function register(data: {
    name: string;
    email: string;
    password: string;
    experienceLevel: ExperienceLevel;
  }) {
    currentUser.value = (
      await axios.post<{ user: UserProfile }>('/api/auth/register', data)
    ).data.user;
    checkedSession = true;
    authDialogOpen.value = false;
    setTrainingPreferences(currentUser.value?.settings);
    return currentUser.value;
  }

  async function login(email: string, password: string) {
    currentUser.value = (
      await axios.post<{ user: UserProfile }>('/api/auth/login', { email, password })
    ).data.user;
    checkedSession = true;
    authDialogOpen.value = false;
    setTrainingPreferences(currentUser.value?.settings);
    return currentUser.value;
  }

  async function logout() {
    await axios.post('/api/auth/logout');
    currentUser.value = null;
    setTrainingPreferences();
    checkedSession = true;
    try {
      sessionStorage.removeItem('gym-tracker-rest-timer');
    } catch {
      /* Storage is optional. */
    }
  }

  async function reconnect() {
    checkedSession = false;
    connectionError.value = '';
    await ensureSession();
  }

  return {
    currentUser,
    isLoggedIn,
    isBeginner,
    authDialogOpen,
    authDialogMode,
    showBeginnerGuide,
    connectionError,
    openRegister,
    openLogin,
    closeAuthDialog,
    register,
    login,
    logout,
    ensureSession,
    reconnect,
  };
}
