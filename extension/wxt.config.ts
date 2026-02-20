import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Clerk-Bot',
    description: 'AI-Powered Universal Form Auto-Filler',
    permissions: ['activeTab', 'storage', 'tabs'],
    host_permissions: ['http://localhost:8394/*'],
    icons: {
      '16': 'icon-16.png',
      '32': 'icon-32.png',
      '48': 'icon-48.png',
      '128': 'icon-128.png',
    },
  },
});
