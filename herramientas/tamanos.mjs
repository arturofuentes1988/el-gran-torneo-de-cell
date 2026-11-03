// Escribe public/tamanos.json: el tamaño en bytes de cada archivo de public/ que el juego baja
// (imágenes, atlas, videos, audio). Las barras de carga lo usan para saber el total desde el
// principio. Corre solo antes de `npm run dev` y `npm run build`.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../public/', import.meta.url));
const EXT = /\.(webp|png|jpg|json|mp4|mp3|ogg|wav)$/i;
const tamanos = {};
function recorrer(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    const st = statSync(ruta);
    if (st.isDirectory()) recorrer(ruta);
    else if (EXT.test(nombre) && nombre !== 'tamanos.json') tamanos[relative(RAIZ, ruta).split(sep).join('/')] = st.size;
  }
}
recorrer(RAIZ);
writeFileSync(join(RAIZ, 'tamanos.json'), JSON.stringify(tamanos));
console.log(`tamanos.json: ${Object.keys(tamanos).length} archivos`);
