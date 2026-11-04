import { defineCapacitorConfig } from '@quasar/app-vite/capacitor';

export default defineCapacitorConfig({
  appId: 'com.liftup.gymtracker',
  appName: 'LiftUp',
  loggingBehavior: 'none',
  // Production assets are bundled in the APK. API calls use native HTTPS transport.
  server: { androidScheme: 'https', cleartext: false },
  android: { allowMixedContent: false },
});
