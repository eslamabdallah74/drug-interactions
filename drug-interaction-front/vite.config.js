import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  base: '/drug-interactions/',
  build: {
    outDir: resolve(__dirname, '../docs')
  },
  server: {
    host: true,
    port: 5173
  }
})
