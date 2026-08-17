// patch_44_airing_tv_stays_in_progress.js
//
// "Futurama se estaba emitiendo y no se autoañadió a En proceso al empezar la
//  temporada nueva; el primer capítulo sí, pero le di a marcar como completado
//  y desapareció."
//
// Diagnóstico (datos reales, 17-ago-2026):
//   Futurama (id 810, status 'Returning Series'), S11 estrenó el 3-ago con
//   E01+E02; el usuario los marcó vistos el 4-ago. A partir de ahí:
//
//     unseenEpisodesCount = episodios NO especiales, con releaseDate <= hoy,
//                           sin fila en `seen`
//
//   se quedó en 0, y la única rama de `onlyWithProgress` que cubría a las
//   series pedía `seenEpisodesCount > 0 AND unseenEpisodesCount > 0`. O sea:
//   estar al día equivalía a no estar en proceso. La serie reapareció el
//   10-ago con el E03, volvió a caerse el 11-ago al marcarlo, y hoy vuelve a
//   estar porque el E04 se emitió esta madrugada.
//
//   No era un fallo del botón: "marcar como completado" a nivel de episodio no
//   toca `activelyInProgress` (sí lo hace el de nivel de serie, que además
//   saca de la watchlist — y Futurama sigue en la watchlist desde mayo, así que
//   ese no llegó a pulsarse).
//
// Cambio: una serie EN EMISIÓN de la que ya has visto algo y que tienes en la
// watchlist se queda en "En proceso" aunque estés al día. Se cae sola cuando:
//   - la temporada termina (deja de haber `upcomingEpisode` programado), o
//   - la abandonas (`excludeAbandoned` ya se aplica fuera, a nivel de query), o
//   - le das a "Quitar de en proceso" (la rama entra DENTRO del bloque que
//     respeta `activelyInProgress.excluded`, así que el override manual manda).
//
// "La temporada sigue viva" NO es "hay un próximo episodio con fecha": TMDB ya
// tiene programados los estrenos de la siguiente temporada con meses de
// antelación, así que ese criterio metía en la lista a Rings of Power (S3 el
// 11-nov), Dark Matter (S2 el 27-ago), MobLand y American Horror Story — todas
// con la temporada emitida entera y vista. El criterio que sí distingue las dos
// situaciones es comparar temporadas:
//
//   upcomingEpisode.seasonNumber == lastAiredEpisode.seasonNumber
//
// Futurama tiene el próximo (S11E05) en la misma temporada que el último
// emitido (S11E04) → sigue en emisión. Las otras cuatro saltan de S1 a S2 o de
// S12 a S13 → temporada terminada, fuera. Ambos joins ya existían en la query.
//
// Los requisitos restantes (en watchlist + algún episodio visto) son los que
// evitan que la sección se llene de series que viste una vez hace años.
//
// Sobre el conteo: las secciones de "En proceso" pasan `excludeAbandoned:true`,
// y esa rama de items.js deriva el count del `query.clone()` en vez de usar el
// fast-path, así que el número sigue cuadrando con la lista sin tocar nada más.

;(() => {
const fs = require('fs');

const path = '/app/build/knex/queries/items.js';
let c = fs.readFileSync(path, 'utf8');

const MARKER = 'mt-fork:airing-tv-stays-in-progress';
if (c.includes(MARKER)) {
  console.log('airing tv in-progress: already patched');
  return;
}

// Ancla: última rama del OR de `onlyWithProgress`, dentro del bloque `inner`
// (el que va gateado por "no está marcada como excluida de en proceso").
const anchor =
  ".orWhere(qb => qb./* WATCHLIST_NONTV_DROPPED_V1 */whereNotNull('listItem.mediaItemId')" +
  ".where('mediaItem.mediaType', 'tv').whereNotNull('firstUnwatchedEpisode.tvShowId'))";

if (!c.includes(anchor)) {
  throw new Error('airing tv in-progress: anchor not found (onlyWithProgress layout changed?)');
}
if (c.split(anchor).length - 1 !== 1) {
  throw new Error('airing tv in-progress: anchor is not unique');
}

const branch =
  ".orWhere(qb => qb/*" + MARKER + "*/" +
  ".where('mediaItem.mediaType', 'tv')" +
  ".whereIn('mediaItem.status', ['Returning Series', 'In Production', 'Planned'])" +
  ".whereNotNull('listItem.mediaItemId')" +
  ".where('seenEpisodesCount', '>', 0)" +
  ".whereNotNull('upcomingEpisode.releaseDate')" +
  ".whereRaw('\"upcomingEpisode\".\"seasonNumber\" = \"lastAiredEpisode\".\"seasonNumber\"'))";

c = c.replace(anchor, anchor + branch);
fs.writeFileSync(path, c);
console.log('airing tv in-progress: added branch to onlyWithProgress');

})();
