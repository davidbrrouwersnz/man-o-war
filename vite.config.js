import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No dev/preview proxy. v1 fetched the collection API in the browser and needed a server-side hop
// around CORS; v2 harvests at build time (BUILD-SPEC-v2.md §5) and never calls it at runtime.
export default defineConfig({
  plugins: [react()],
})
