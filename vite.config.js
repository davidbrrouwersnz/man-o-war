import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The collection API only allows the vendor's own docs origin via CORS, so every
// browser fetch must go through this server-side hop. See BUILD-SPEC.md §2.
const proxy = {
  '/api': { target: 'https://collection.canterburymuseum.com', changeOrigin: true },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
