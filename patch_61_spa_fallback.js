// patch_61_spa_fallback.js
//
// "Error. Cannot GET /in-progress" (30-sep-2026).
// El servidor solo devolvia la app en "/" (express.static -> index.html). Las
// rutas del frontend (/in-progress, /tv, /inicio...) solo funcionaban navegando
// dentro de la app; al recargar o abrir la URL directa, Express daba 404.
// Con En proceso como pagina de inicio (patch_60) la URL se queda en
// /in-progress, asi que el F5 fallaba siempre.
// Ahora: GET que pide HTML, sin extension y fuera de /api, /oauth e /img ->
// index.html. Va antes del middleware de auth, igual que "/" (index es publico;
// la app pide login si hace falta).

;(() => {
const fs = require('fs');
const path = '/app/build/server.js';
let s = fs.readFileSync(path, 'utf8');
const MARKER = 'SPA_FALLBACK_V1';
if (s.includes(MARKER)) { console.log('spa fallback: already patched'); return; }

const anchor = '    this.#app.use(_express.default.static(this.#config.assetsPath));\n';
if (s.split(anchor).length - 1 !== 1) throw new Error('spa fallback: anchor not found/unique');

s = s.replace(anchor, anchor
  + "    this.#app.get('*', (req, res, next) => { // " + MARKER + "\n"
  + "      const p = req.path;\n"
  + "      if (p.includes('.') || ['/api', '/oauth', '/img'].some(x => p === x || p.startsWith(x + '/'))) { next(); return; }\n"
  + "      if (!(req.header('Accept') || '').includes('text/html')) { next(); return; }\n"
  + "      res.set('Cache-Control', 'no-cache');\n"
  + "      res.sendFile(require('path').join(this.#config.publicPath, 'index.html'));\n"
  + "    });\n");

fs.writeFileSync(path, s);
console.log('spa fallback: frontend routes serve index.html');
})();
