import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'adrex',
      formats: ['iife'],
      fileName: () => 'adrex.js',
    },
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        extend: true, // This allows extending the global variable if it exists
        globals: {} 
      }
    }
  }
});
