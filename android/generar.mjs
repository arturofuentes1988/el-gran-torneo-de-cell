// Arma el APK de Android. La app es una "Trusted Web Activity": abre el juego de la web
// (https://elgrantorneodecell.com/juego.html) a pantalla completa y acostado, con el motor de Chrome
// del celular. Por eso pesa poco, se actualiza sola cada vez que se actualiza la web y la entrada
// con Google funciona igual que en el navegador (dentro de un WebView común, Google la rechaza).
//
// Uso (una vez: cd android && npm install):  node android/generar.mjs
// Necesita, fuera del repositorio (carpeta ~/.torneo-android, o la de TORNEO_ANDROID):
//   jdk17/            Java 17
//   sdk/              el SDK de Android (platforms;android-36 y build-tools;35.0.0, con las licencias aceptadas)
//   firma/torneo.keystore y firma/clave.txt   la firma de la app. NO SE SUBE NI SE PIERDE: sin ella
//                     no se puede publicar una actualización que se instale sobre la app anterior.
// Deja el APK firmado en public/descargas/ (lo publica la web) y el proyecto de Android en
// android/proyecto/ (no se sube).
//
// La web tiene que publicar public/.well-known/assetlinks.json con la huella de la firma: con eso
// Chrome muestra el juego sin la barra de direcciones.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConsoleLog, TwaGenerator, TwaManifest } from '@bubblewrap/core';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const herramientas = process.env.TORNEO_ANDROID ?? join(homedir(), '.torneo-android');
const keystore = join(herramientas, 'firma', 'torneo.keystore');
const archivoClave = join(herramientas, 'firma', 'clave.txt');
const proyecto = join(aqui, 'proyecto');
const salida = join(raiz, 'public', 'descargas', 'el-gran-torneo-de-cell.apk');

/** Versión de la app: subir `codigo` en 1 cada vez que se publique un APK nuevo. */
const VERSION = { codigo: 1, nombre: '1.0.0' };
const COLOR = '#07040C';

for (const f of [keystore, archivoClave, join(herramientas, 'jdk17'), join(herramientas, 'sdk')]) {
  if (!existsSync(f)) {
    console.error(`Falta ${f} (ver el comentario de arriba de android/generar.mjs).`);
    process.exit(1);
  }
}

// Los íconos se le entregan al generador por una dirección: se sirven desde public/iconos un momento.
const servidor = createServer(async (req, res) => {
  try {
    const nombre = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/[^a-z0-9.-]/gi, '');
    const datos = await readFile(join(raiz, 'public', 'iconos', nombre));
    res.writeHead(200, { 'content-type': 'image/png' }).end(datos);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const iconos = `http://127.0.0.1:${servidor.address().port}`;

const log = new ConsoleLog('apk');
try {
  const manifiesto = new TwaManifest({
    packageId: 'com.elgrantorneodecell.app',
    host: 'elgrantorneodecell.com',
    name: 'El Gran Torneo de Cell',
    launcherName: 'Torneo de Cell',
    display: 'fullscreen',
    orientation: 'landscape',
    themeColor: COLOR,
    themeColorDark: COLOR,
    navigationColor: COLOR,
    navigationColorDark: COLOR,
    backgroundColor: COLOR,
    enableNotifications: false,
    startUrl: '/juego.html',
    iconUrl: `${iconos}/icono-512.png`,
    maskableIconUrl: `${iconos}/icono-mascara-512.png`,
    splashScreenFadeOutDuration: 300,
    signingKey: { path: keystore, alias: 'torneo' },
    appVersionCode: VERSION.codigo,
    appVersion: VERSION.nombre,
    shortcuts: [],
    generatorApp: 'el-gran-torneo-de-cell',
    // Sin Chrome (ni otro navegador que sirva): se abre en una pestaña del navegador que haya.
    fallbackType: 'customtabs',
    enableSiteSettingsShortcut: false,
    // Android 7 o más nuevo (lo mínimo que acepta la biblioteca que abre el juego con Chrome).
    minSdkVersion: 24,
    fingerprints: [],
  });
  const problema = manifiesto.validate();
  if (problema) throw new Error(`Manifiesto inválido: ${problema}`);

  await rm(proyecto, { recursive: true, force: true });
  await mkdir(proyecto, { recursive: true });
  await new TwaGenerator().createTwaProject(proyecto, manifiesto, log);

  // Compila con el Gradle del proyecto, y después alinea y firma con las herramientas del SDK.
  const sdk = join(herramientas, 'sdk');
  const env = { ...process.env, JAVA_HOME: join(herramientas, 'jdk17'), ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  const correr = (programa, args, cwd = proyecto) => {
    const linea = [programa, ...args].map((a) => `"${a}"`).join(' ');
    const r = spawnSync(linea, { cwd, env, shell: true, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`Falló: ${programa} ${args[0] ?? ''}`);
  };
  // Sin el proceso de fondo de Gradle: si queda vivo, la próxima vez no deja borrar el proyecto.
  correr(join(proyecto, 'gradlew.bat'), ['assembleRelease', '--no-daemon']);

  const version = readdirSync(join(sdk, 'build-tools')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
  const utiles = join(sdk, 'build-tools', version);
  const sinFirma = join(proyecto, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
  const alineado = join(proyecto, 'app-alineado.apk');
  const firmado = join(proyecto, 'app-firmado.apk');
  await rm(alineado, { force: true });
  await rm(firmado, { force: true });
  correr(join(utiles, 'zipalign.exe'), ['-f', '-p', '4', sinFirma, alineado]);
  // La clave se lee del archivo (no pasa por la línea de comandos); la de la llave es la misma del almacén.
  correr(join(utiles, 'apksigner.bat'), [
    'sign', '--ks', keystore, '--ks-key-alias', 'torneo', '--ks-pass', `file:${archivoClave}`, '--out', firmado, alineado,
  ]);
  correr(join(utiles, 'apksigner.bat'), ['verify', '--print-certs', firmado]);
  await mkdir(dirname(salida), { recursive: true });
  await copyFile(firmado, salida);
  console.log(`Listo: ${salida} (${Math.round((await stat(salida)).size / 1024)} KB), versión ${VERSION.nombre} (${VERSION.codigo})`);
} finally {
  servidor.close();
}
// El generador deja conexiones abiertas: se termina a mano para que el comando no quede colgado.
process.exit(0);
