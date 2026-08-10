import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // YaneuraOu WASM (@mizarjp/yaneuraou.k-p, used by src/engine/) uses
  // pthreads backed by SharedArrayBuffer, which browsers only expose on
  // cross-origin-isolated pages. These two headers are what make
  // `self.crossOriginIsolated` true. There is no single-threaded build of
  // this engine, so the headers are mandatory, not an optimization.
  //
  // IMPORTANT: this dev-server config only affects `vite`/`vite preview`.
  // Whatever serves the production build (e.g. static hosting, CDN, reverse
  // proxy) MUST also send these two response headers on the top-level HTML
  // document, or the engine will fail to initialize in production. See
  // README.md "エンジンについて" for details.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
