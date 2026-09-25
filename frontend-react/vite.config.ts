import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@xyflow') || id.includes('zustand'))
            return 'xyflow'
          if (
            id.includes('@tremor') ||
            id.includes('/recharts') ||
            id.includes('/recharts-scale') ||
            id.includes('/victory-vendor') ||
            id.includes('/d3-') ||
            id.includes('@headlessui') ||
            id.includes('@react-aria') ||
            id.includes('@react-stately') ||
            id.includes('@react-types')
          )
            return 'tremor'
          if (
            id.includes('@radix-ui') ||
            id.includes('@floating-ui/react') ||
            id.includes('/cmdk') ||
            id.includes('/react-remove-scroll') ||
            id.includes('/react-style-singleton') ||
            id.includes('/use-callback-ref') ||
            id.includes('/use-sidecar')
          )
            return 'radix'
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/@remix-run/') ||
            id.includes('/scheduler/') ||
            id.includes('/cookie/') ||
            id.includes('/set-cookie-parser/')
          )
            return 'react-vendor'
          if (
            id.includes('@tanstack') ||
            id.includes('/framer-motion') ||
            id.includes('/motion-dom') ||
            id.includes('/motion-utils')
          )
            return 'app-vendor'
          return 'vendor'
        },
      },
    },
  },
})
