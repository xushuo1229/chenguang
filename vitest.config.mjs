import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __CHENGUANG_DEV_API_BASE__: JSON.stringify('http://localhost:3000/api')
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
