import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Setting root to src/ so HTML entry paths are resolved relative to it,
  // which causes Vite to output popup/index.html → dist/popup/index.html
  root: resolve(__dirname, 'src'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      // Prevent Vite from using hashed filenames (Chrome loads by exact path from manifest)
      preserveEntrySignatures: 'strict',
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'shared/[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});
