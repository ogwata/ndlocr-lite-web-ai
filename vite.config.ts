import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // ONNX Runtime Web: Viteのesbuildプリバンドルを除外（WASMバイナリが壊れるのを防ぐ）
  optimizeDeps: {
    exclude: ['onnxruntime-web', 'onnxruntime-web/wasm'],
  },

  // WASMとONNXファイルをアセットとして認識
  assetsInclude: ['**/*.wasm', '**/*.onnx'],

  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'pdf': ['pdfjs-dist'],
          'heic': ['heic2any'],
          'diff': ['diff-match-patch'],
          'tiff': ['utif'],
        },
      },
    },
  },

  // Web WorkerをES moduleフォーマットで出力
  worker: {
    format: 'es',
  },

  server: {
    // SharedArrayBuffer用のCOOP/COEPヘッダー（onnxruntime-webのマルチスレッド推論に必要）
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
