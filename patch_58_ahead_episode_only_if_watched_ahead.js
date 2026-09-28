// patch_58_ahead_episode_only_if_watched_ahead.js
//
// Arreglo de patch_57 (28-sep-2026): "En En proceso salen en la tarjeta los
// capitulos siguientes aunque no se hayan estrenado."
// patch_57 rellenaba `firstUnwatchedEpisode` con el siguiente capitulo sin
// emitir en CUALQUIER serie en emision que tuvieras al dia (Dark Matter 2x6,
// MobLand 2x3...). La intencion era solo el caso AHS: haber visto un capitulo
// ANTES de su estreno. Ahora el relleno exige que el ultimo capitulo visto
// tampoco se haya emitido aun; una serie al dia de lo emitido vuelve a salir
// como antes.

;(() => {
const fs = require('fs');
const path = '/app/build/knex/queries/items.js';
let c = fs.readFileSync(path, 'utf8');
const MARKER = 'mt-fork:ahead-only-if-watched-ahead';
if (c.includes(MARKER)) { console.log('ahead episode gate: already patched'); return; }

const a1 = "      WHERE n.seasonAndEpisodeNumber > l.sae AND n.isSpecialEpisode = 0\n";
const a2 = "    SELECT * FROM cand WHERE rn = 1`, [userId, ...ids, now, userId]);";
if (c.split(a1).length - 1 !== 1 || c.split(a2).length - 1 !== 1) throw new Error('ahead episode gate: anchors not found/unique (patch_57 missing?)');
c = c.replace(a1, a1 + "        /* " + MARKER + " */ AND le.releaseDate IS NOT NULL AND le.releaseDate <> '' AND le.releaseDate > ?\n");
c = c.replace(a2, "    SELECT * FROM cand WHERE rn = 1`, [userId, ...ids, now, now, userId]);");
fs.writeFileSync(path, c);
console.log('ahead episode gate: only when the last seen episode is itself unaired');
})();
