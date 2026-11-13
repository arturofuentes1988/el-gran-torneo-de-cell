import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const raiz = (archivo: string): string => fileURLToPath(new URL(archivo, import.meta.url));

// Rutas relativas para poder publicar el build en cualquier carpeta (itch.io, GitHub Pages).
// Tres páginas: index.html es la web (JUGAR y RANKING); juego.html, el juego (va dentro de la web);
// y privacidad.html, la política de privacidad (la pide Google para entrar con Google).
export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // Mapas del código aparte (no los pide el navegador): sirven para leer los errores que mandan los celulares.
    sourcemap: 'hidden',
    rollupOptions: { input: { index: raiz('index.html'), juego: raiz('juego.html'), privacidad: raiz('privacidad.html') } },
  },
});
