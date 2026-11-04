import { createApp, type Component } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import * as quasar from 'quasar';
import axios from 'axios';
import 'quasar/dist/quasar.css';
import '@quasar/extras/material-icons/material-icons.css';
import '../src/css/app.scss';
import App from '../src/App.vue';
import MainLayout from '../src/layouts/MainLayout.vue';
import IndexPage from '../src/pages/IndexPage.vue';
import HistoryPage from '../src/pages/SecondPage.vue';
import SettingsPage from '../src/pages/SettingsPage.vue';
import PushupCameraPage from '../src/pages/PushupCameraPage.vue';
import {
  defaultPreferences,
  setTrainingPreferences,
} from '../src/composables/useTrainingPreferences';
import { useAuth } from '../src/composables/useAuth';
import { layoutHistory, layoutPlan, layoutSession } from './fixtures/workoutLayout';

// This adapter handles synthetic data in memory and never sends an API request.
let session = layoutSession();
let settings = structuredClone(defaultPreferences);
const previewHistory = Array.from({ length: 4 }, (_, index) => {
  const entry = layoutHistory()[0]!;
  const date = new Date();
  date.setDate(date.getDate() - index * 3);
  date.setHours(9, 0, 0, 0);
  entry.id = 8000 + index;
  entry.startedAt = new Date(date.getTime() - 3600000).toISOString();
  entry.completedAt = date.toISOString();
  return entry;
});
setTrainingPreferences(settings);
axios.defaults.adapter = async (config) => {
  const url = config.url ?? '';
  let data: unknown;
  if (url === '/api/v1/plans/default') data = { plan: layoutPlan() };
  else if (url === '/api/v1/workouts/active') data = { session: null };
  else if (url === '/api/health') data = { status: 'ok', service: 'gym-tracker-api' };
  else if (url === '/api/v1/training/settings') {
    if (config.method === 'put') {
      settings = JSON.parse(config.data as string);
    }
    data = { settings };
  } else if (url === '/api/v1/favorites') data = { favorites: [] };
  else if (url === '/api/v1/analytics/summary') {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    data = {
      from: from.toISOString(),
      to: to.toISOString(),
      sessions: 1,
      completedSets: 1,
      volumeKg: 450,
      muscleGroups: [],
    };
  } else if (url === '/api/v1/records') data = { rules: {}, records: [] };
  else if (url === '/api/v1/progress/exercises') data = { exercises: [] };
  else if (url === '/api/v1/exercises') data = { exercises: [] };
  else if (url === '/api/v1/workouts/weekly-rollover') data = { session };
  else if (url === '/api/v1/workouts' && config.method === 'get')
    data = { workouts: previewHistory };
  else if (url === '/api/v1/workouts') {
    session = layoutSession();
    data = { session };
  } else if (url.endsWith('/finish'))
    data = { session: { ...session, completedAt: new Date().toISOString() } };
  else if (url.endsWith('/sets') && config.method === 'post') {
    const payload = JSON.parse(config.data as string);
    const exercise = session.exercises.find((item) => item.id === payload.workoutExerciseId)!;
    exercise.sets.push({
      id: Date.now(),
      setNumber: exercise.sets.length + 1,
      completed: true,
      ...payload,
    });
    data = { session };
  } else if (/\/sets\/\d+$/.test(url)) {
    const id = Number(url.split('/').pop());
    for (const exercise of session.exercises) {
      if (config.method === 'delete') exercise.sets = exercise.sets.filter((set) => set.id !== id);
      else {
        const set = exercise.sets.find((item) => item.id === id);
        if (set) Object.assign(set, JSON.parse(config.data as string));
      }
    }
    data = { session };
  } else if (/\/exercises\/\d+$/.test(url) && config.method === 'delete') {
    session.exercises = session.exercises.filter(
      (item) => item.id !== Number(url.split('/').pop()),
    );
    data = { session };
  } else if (url.endsWith('/notes') || url.endsWith('/effort')) {
    Object.assign(session, JSON.parse(config.data as string));
    data = { session };
  } else throw new Error(`Layout fixture has no handler for ${config.method} ${url}`);
  return { config, data: structuredClone(data), status: 200, statusText: 'OK', headers: {} };
};
useAuth().currentUser.value = {
  id: 'layout-fixture',
  name: 'Sample Lifter',
  email: 'fixture@example.invalid',
  experienceLevel: 'intermediate',
  joinedAt: '',
};
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/app' },
    {
      path: '/app',
      component: MainLayout,
      children: [
        { path: '', component: IndexPage },
        {
          path: 'history',
          component: HistoryPage,
        },
        { path: 'settings', component: SettingsPage },
        {
          path: 'camera',
          component:
            new URLSearchParams(location.search).get('camera') === '1'
              ? PushupCameraPage
              : {
                  template:
                    '<main class="q-pa-xl"><h2>Camera route reached</h2><p>Camera stays off in this fixture.</p></main>',
                },
        },
      ],
    },
  ],
});
const app = createApp(App);
app.use(quasar.Quasar, {
  components: Object.fromEntries(
    Object.entries(quasar).filter(([name]) => /^Q[A-Z]/.test(name)),
  ) as Record<string, Component>,
  directives: { ClosePopup: quasar.ClosePopup },
});
app.use(router);
void router.isReady().then(() => app.mount('#q-app'));

const style = document.createElement('style');
style.textContent =
  '.qa-label { position:fixed; bottom:80px; right:12px; z-index:1000; padding:4px 8px; margin:0; background:var(--bg-surface); color:var(--text-secondary); border:1px solid var(--border-subtle); font-size:11px; pointer-events:none; }';
document.head.appendChild(style);
