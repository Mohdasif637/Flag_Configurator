import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  // Use relative base path so the app works on GitHub Pages and any sub-path
  base: './',
  plugins: [
    viteStaticCopy({
      targets: [
        { src: '3d', dest: '' },
        { src: 'assets', dest: '' },
        { src: 'icons', dest: '' }
      ]
    })
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'bundle',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          vendor: ['moveable', '@simonwep/pickr', 'i18next']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
