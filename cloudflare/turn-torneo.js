// Servidor de respaldo (TURN) de El Gran Torneo de Cell, como Worker de Cloudflare.
//
// Cuando dos jugadores no se pueden conectar directo (datos móviles, algunas compañías de
// internet), la pelea pasa por el TURN de Cloudflare (gratis hasta 1.000 GB al mes). Sus claves
// duran un tiempo y se piden aquí: este Worker se las da solo a jugadores con sesión iniciada en
// el juego (lo revisa con Supabase), para que nadie más gaste la cuota.
//
// Se instala pegando este archivo en Cloudflare: Workers → el Worker "turn-torneo" → Edit code.
// Necesita dos secretos (Worker → Settings → Variables and Secrets, tipo "Secret"), que salen de
// la llave TURN creada en Cloudflare (Realtime → TURN):
//   TURN_KEY_ID          el "Turn Token ID"
//   TURN_KEY_API_TOKEN   el "API Token"
// Nunca escribir esos valores aquí: el repositorio es público.

const SUPABASE_URL = 'https://hmyesbgnihxgaygmkuck.supabase.co';
// Llave publicable (pública a propósito, la misma que va dentro del juego).
const SUPABASE_KEY = 'sb_publishable_SDkVYO6TBQnkWoPv2tq18w_L1LiNx4v';
/** Páginas que pueden pedir claves. */
const ORIGENES = [
  'https://elgrantorneodecell.com',
  'https://www.elgrantorneodecell.com',
  'https://arturofuentes1988.github.io',
  'http://localhost:5173',
];
/** Segundos que duran las claves (una tarde entera de revanchas). */
const DURACION = 86400;

export default {
  async fetch(req, env) {
    const origen = req.headers.get('Origin') ?? '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const json = (cuerpo, status = 200) =>
      new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'usa POST' }, 405);
    if (!ORIGENES.includes(origen)) return json({ error: 'origen no permitido' }, 403);
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
      return json({ error: 'faltan los secretos TURN_KEY_ID y TURN_KEY_API_TOKEN' }, 500);
    }

    // Solo jugadores con sesión: Supabase dice si el token es válido.
    const sesion = req.headers.get('Authorization') ?? '';
    if (!sesion.startsWith('Bearer ')) return json({ error: 'sin sesión' }, 401);
    const usuario = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: sesion } });
    if (!usuario.ok) return json({ error: 'sesión no válida' }, 401);

    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: DURACION }),
    });
    if (!r.ok) return json({ error: `cloudflare respondió ${r.status}` }, 502);
    const { iceServers } = await r.json();
    // Sin el puerto 53: los navegadores lo bloquean y solo hace esperar.
    const servidores = (iceServers ?? [])
      .map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) }))
      .filter((s) => s.urls.length);
    return json({ iceServers: servidores, duracion: DURACION });
  },
};
