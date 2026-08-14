import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// No dev/preview proxy. v1 fetched the collection API in the browser and needed a server-side hop
// around CORS; v2 harvests at build time (BUILD-SPEC-v2.md §5) and never calls it at runtime.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // shadcn generates imports as "@/components/…". The alias has to exist in both places — here
    // for the bundler and in jsconfig.json for the editor — or one of them silently disagrees.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
