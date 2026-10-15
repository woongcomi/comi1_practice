import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 개발 중에는 /api 요청을 FastAPI 개발 서버로 넘긴다
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
