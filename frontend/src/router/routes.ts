import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('@/pages/LandingPage.vue') },
  {
    path: '/app',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('@/pages/IndexPage.vue') },
      { path: 'history', component: () => import('@/pages/SecondPage.vue') },
      { path: 'camera', component: () => import('@/pages/PushupCameraPage.vue') },
      { path: 'settings', component: () => import('@/pages/SettingsPage.vue') },
    ],
  },
  { path: '/second', redirect: '/app/history' },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
];

export default routes;
