// patch_49_aip_drops_when_season_over.js
//
// "Silo: he completado el ultimo capitulo de la temporada que estaba en
//  emision, por lo tanto se acabo la temporada, y no me la quita de En proceso
//  ni me la deja solo en seguimiento."
//
// Diagnostico (datos reales, 4-sep-2026):
//   Silo (id 1500, 'Returning Series') no entra en /en-proceso por NINGUNA de
//   las ramas calculadas de `onlyWithProgress`:
//     - unseenEpisodesCount = 0  (S3E10 "Troy", emitido el 3-sep, visto ese dia)
//     - firstUnwatchedEpisode = NULL
//     - la rama de patch_44 exige un `upcomingEpisode` en la MISMA temporada
//       que el ultimo emitido, y la S4 todavia no tiene episodios con fecha.
//   Entra por la ultima rama del OR, la que va FUERA del bloque `inner`:
//       .orWhere(exists activelyInProgress WHERE excluded = false)
//   El 5-jul-2026 se pulso "Marcar como en proceso" (fila id 90 de
//   `activelyInProgress`, excluded=0). Ese pin es un force-include
//   incondicional que no caduca nunca, y nada lo limpia: el unico limpiador
//   existente es patch_21(B), que solo se dispara al pulsar "Marcar como
//   completado" desde la barra lateral.
//
// Cambio: al marcar visto (PUT /api/seen y PUT /api/seen/by-external-id), si
// una serie se queda SIN episodios emitidos pendientes y ademas la temporada
// ha terminado, se borra el pin. El criterio de "la temporada sigue viva" es
// el mismo que el de patch_44 —quedan episodios con fecha futura en la
// temporada del ultimo emitido— para que las dos piezas no se contradigan:
//
//   Futurama (S11, 4 capitulos por emitir, el proximo el 7-sep) conserva el
//   pin y sigue en En proceso. Silo lo pierde.
//
//   Comprobado sobre la BD del 4-sep: de las 7 series con pin (excluded=0),
//   la unica que cumple las dos condiciones es Silo. Las otras seis (Tehran,
//   The Bear, The Leftovers, One Hundred Years of Solitude, Black Spot,
//   Futurama) o tienen episodios emitidos sin ver o tienen temporada viva.
//
// Se BORRA la fila en vez de ponerle excluded=1 a proposito: excluded=1
// significa "sacame de aqui y no vuelvas" y mataria la reaparicion automatica
// cuando estrene la S4. Sin fila, la serie vuelve sola a En proceso en cuanto
// se emita algo sin ver, por la rama WATCHLIST_NONTV_DROPPED_V1 (en watchlist
// + episodio emitido pendiente), que es como se comportaba antes del pin.
//
// La serie NO sale de la lista de seguimiento: el helper de patch_36 deja
// dentro a las 'Returning Series' / 'In Production' / 'Planned', que es
// exactamente el estado final que se pide (fuera de En proceso, en
// seguimiento a la espera de la S4).
//
// El filtro de episodios replica el de `firstUnwatchedEpisodeHelper` en
// items.js (no especial, releaseDate no nula y distinta de '', <= hoy, sin
// fila en `seen`): si contara de otra forma, el pin podria borrarse con la
// serie todavia visible en la lista, o al reves.

;(() => {
const fs = require('fs');
const child = require('child_process');

const filePath = '/app/build/controllers/seen.js';
const MARKER = 'mt-fork:aip-drops-when-season-over';
let c = fs.readFileSync(filePath, 'utf8');

if (c.includes(MARKER)) {
  console.log('aip drops when season over: already patched');
  return;
}

// --- 1. El helper, justo detras de _removeFromWatchlistIfComplete ---------
const helperAnchor = '\nfunction _jfCfg() {';
if ((c.split(helperAnchor).length - 1) !== 1) {
  throw new Error('aip-season-over: helper anchor (_jfCfg) not unique');
}

const helper = `
/*${MARKER}*/
async function _clearAipIfSeasonOver(userId, mediaItem) {
  try {
    if (!mediaItem || mediaItem.mediaType !== 'tv') return;
    const knex = _dbconfig.Database.knex;

    // Solo se limpia un pin manual (excluded=0). Un excluded=1 es una
    // exclusion explicita del usuario y no se toca.
    const aip = await knex('activelyInProgress').where({ userId, mediaItemId: mediaItem.id }).first();
    if (!aip || aip.excluded) return;

    const today = new Date().toISOString().slice(0, 10);

    // (a) que no quede ningun episodio ya emitido sin ver
    const remaining = await knex('episode')
      .where('episode.tvShowId', mediaItem.id)
      .where('episode.isSpecialEpisode', false)
      .whereNotNull('episode.releaseDate')
      .whereNot('episode.releaseDate', '')
      .where('episode.releaseDate', '<=', today)
      .whereNotExists(function() { this.from('seen').whereRaw('seen.episodeId = episode.id').where('seen.userId', userId); })
      .count('* as c').first();
    if ((Number(remaining && remaining.c) || 0) > 0) return;

    // (b) que la temporada del ultimo emitido no tenga ya episodios por venir
    const lastAired = await knex('episode')
      .where('tvShowId', mediaItem.id)
      .where('isSpecialEpisode', false)
      .whereNotNull('releaseDate')
      .whereNot('releaseDate', '')
      .where('releaseDate', '<', today)
      .orderBy('seasonAndEpisodeNumber', 'desc')
      .first();
    if (!lastAired) return;

    const pendingThisSeason = await knex('episode')
      .where('tvShowId', mediaItem.id)
      .where('isSpecialEpisode', false)
      .where('seasonNumber', lastAired.seasonNumber)
      .whereNotNull('releaseDate')
      .whereNot('releaseDate', '')
      .where('releaseDate', '>=', today)
      .count('* as c').first();
    if ((Number(pendingThisSeason && pendingThisSeason.c) || 0) > 0) return;

    await knex('activelyInProgress')
      .where({ userId, mediaItemId: mediaItem.id })
      .where('excluded', false)
      .delete();
  } catch (_) { /* fire-and-forget, igual que _removeFromWatchlistIfComplete */ }
}
`;

c = c.replace(helperAnchor, '\n' + helper + helperAnchor);

// --- 2. Llamada en SeenController.add ------------------------------------
const addAnchor =
  "    /*mt-fork:tv-watchlist-on-seen*/\n" +
  "    if (mediaItem.mediaType === 'tv') {\n" +
  "      await _removeFromWatchlistIfComplete(userId, mediaItem);\n" +
  "    }";
if ((c.split(addAnchor).length - 1) !== 1) {
  throw new Error('aip-season-over: add() anchor not unique (patch_36 layout changed?)');
}
c = c.replace(
  addAnchor,
  "    /*mt-fork:tv-watchlist-on-seen*/\n" +
  "    if (mediaItem.mediaType === 'tv') {\n" +
  "      await _removeFromWatchlistIfComplete(userId, mediaItem);\n" +
  "      await _clearAipIfSeasonOver(userId, mediaItem);\n" +
  "    }"
);

// --- 3. Llamada en SeenController.addByExternalId (sync de Jellyfin) ------
const extAnchor =
  "    _removeFromWatchlistIfComplete(userId, mediaItem);\n" +
  "    res.status(200);";
if ((c.split(extAnchor).length - 1) !== 1) {
  throw new Error('aip-season-over: addByExternalId anchor not unique');
}
c = c.replace(
  extAnchor,
  "    _removeFromWatchlistIfComplete(userId, mediaItem);\n" +
  "    _clearAipIfSeasonOver(userId, mediaItem);\n" +
  "    res.status(200);"
);

fs.writeFileSync(filePath, c);

// Comprobacion de sintaxis: un fallo aqui deja el contenedor sin arrancar.
try {
  child.execSync('node --check ' + filePath, { stdio: 'pipe' });
  console.log('aip drops when season over: applied + syntax OK');
} catch (e) {
  console.error('aip drops when season over: SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
  process.exit(1);
}

})();
