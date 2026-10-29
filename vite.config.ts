import { defineConfig } from 'vite';

// Rutas relativas para poder publicar el build en cualquier carpeta (itch.io, GitHub Pages).
export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
