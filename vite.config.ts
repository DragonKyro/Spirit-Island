import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/Spirit-Island/',
  define: {
    // recorded in online rooms so players on mismatched builds get a warning
    __APP_BUILD__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'),
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
