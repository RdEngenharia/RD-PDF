
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // Define o caminho base para o deploy no GitHub Pages.
  // Substitua 'RD-PDF' pelo nome exato do seu repositório se for diferente.
  base: '/RD-PDF/',
  plugins: [react()],
})
