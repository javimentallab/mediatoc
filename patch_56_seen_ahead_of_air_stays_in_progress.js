// patch_56_seen_ahead_of_air_stays_in_progress.js
//
// "En American Horror Story, si doy el primer capítulo de la temporada 13
//  como completado, se va de En proceso, cuando debería seguir."
//
// Diagnóstico (datos reales, 26-sep-2026):
//   AHS (id 39940, 'Returning Series'). S12 vista entera. TMDB tiene el
//   estreno de S13 el 1-oct (E01-E03) y E04-E13 sin fecha; el usuario vio el
//   13x1 el 26-sep, ANTES de su fecha oficial. Resultado:
//
//     unseenEpisodesCount = no especiales, releaseDate <= hoy, sin `seen` = 0
//
//   y ninguna rama de `onlyWithProgress` lo cubre:
//     - la natural pide unseenEpisodesCount > 0;
//     - la de patch_44 (airing-tv-stays-in-progress) pide que el próximo
//       episodio sea de la misma temporada que el último EMITIDO, y aquí el
//       último emitido es S12 y el próximo S13.
//   O sea: ver un episodio antes de su estreno oficial saca la serie de la
//   lista justo cuando la has empezado.
//
// Cambio: una serie EN EMISIÓN sigue en "En proceso" si, en la temporada más
// alta de la que has visto algún episodio, quedan episodios no especiales sin
// ver que todavía no se han emitido (releaseDate > hoy) o no tienen fecha.
// Los emitidos sin ver ya los cubre la rama natural.
//
//   - Gate de status (Returning/InProduction/Planned): sin él, series
//     canceladas cuyo TMDB deja capítulos sin fecha para siempre se quedarían
//     colgadas en la lista.
//   - Solo la temporada más alta con algo visto: temporadas viejas con basura
//     sin fecha no cuentan.
//   - No pide watchlist (a diferencia de patch_44): haber visto un capítulo
//     de la temporada en curso ya es la señal.
//   - Va DENTRO del bloque que respeta `activelyInProgress.excluded`, así que
//     "Quitar de en proceso" sigue mandando; `excludeAbandoned` se aplica fuera.
//   - El count de las secciones de En proceso sale del `query.clone()` (ver
//     patch_44), así que cuadra sin tocar el fast-path.

;(() => {
const fs = require('fs');

const path = '/app/build/knex/queries/items.js';
let c = fs.readFileSync(path, 'utf8');

const MARKER = 'mt-fork:seen-ahead-of-air-stays-in-progress';
if (c.includes(MARKER)) {
  console.log('seen ahead of air in-progress: already patched');
  return;
}

// Ancla: la rama de patch_44, que es la última del OR de series dentro del
// bloque gateado por `activelyInProgress.excluded`.
const anchor =
  ".whereRaw('\"upcomingEpisode\".\"seasonNumber\" = \"lastAiredEpisode\".\"seasonNumber\"'))";

if (!c.includes(anchor)) {
  throw new Error('seen ahead of air in-progress: anchor not found (patch_44 missing?)');
}
if (c.split(anchor).length - 1 !== 1) {
  throw new Error('seen ahead of air in-progress: anchor is not unique');
}

const branch =
  ".orWhere(qb => qb/*" + MARKER + "*/" +
  ".where('mediaItem.mediaType', 'tv')" +
  ".whereIn('mediaItem.status', ['Returning Series', 'In Production', 'Planned'])" +
  ".whereExists(function() { this.from('episode as aheadEp')" +
    ".whereRaw('\"aheadEp\".\"tvShowId\" = \"mediaItem\".\"id\"')" +
    ".where('aheadEp.isSpecialEpisode', false)" +
    ".where(d => d.whereNull('aheadEp.releaseDate').orWhere('aheadEp.releaseDate', '').orWhere('aheadEp.releaseDate', '>', currentDateString))" +
    ".whereNotExists(function() { this.from('seen').whereRaw('\"seen\".\"episodeId\" = \"aheadEp\".\"id\"').where('seen.userId', userId); })" +
    ".whereRaw('\"aheadEp\".\"seasonNumber\" = (SELECT MAX(\"se\".\"seasonNumber\") FROM \"seen\" \"sn\" JOIN \"episode\" \"se\" ON \"se\".\"id\" = \"sn\".\"episodeId\" WHERE \"sn\".\"mediaItemId\" = \"mediaItem\".\"id\" AND \"sn\".\"userId\" = ? AND \"se\".\"isSpecialEpisode\" = 0)', [userId]); }))";

c = c.replace(anchor, anchor + branch);
fs.writeFileSync(path, c);
console.log('seen ahead of air in-progress: added branch to onlyWithProgress');

})();
