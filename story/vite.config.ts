import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' : 빌드 결과를 어느 경로에 올려도 data/ 를 상대경로로 읽는다
export default defineConfig({ plugins: [react()], base: './' })
