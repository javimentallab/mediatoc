// patch_54_watchlist_recheck_on_metadata.js
//
// "Hay series en seguimiento que ya han acabado y siguen ahi."
//
// Diagnostico (datos reales, 20-sep-2026): en la Lista de seguimiento habia 5
// series con status Ended/Canceled y CERO episodios emitidos sin ver:
//
//   Persona (1004, Ended)               ultimo visto 05-nov-2024
//   The Darkness (28617, Ended)         ultimo visto 19-mar-2025
//   Love, Death & Robots (1582, Canceled) ultimo visto 16-may-2025
//   Spartacus: House of Ashur (805, Canceled) ultimo visto 07-feb-2026
//   Shatter Belt (40651, Ended)         ultimo visto 08-jul-2026
//
// La regla que deberia sacarlas ya existe y es correcta: el helper
// `_removeFromWatchlistIfComplete` (WL_COMPLETE_V3, controllers/seen.js),
// "todos los emitidos vistos Y status no Returning/In Production/Planned".
// El fallo es CUANDO se ejecuta: solo lo llaman PUT /api/seen (patch_36) y
// PUT /api/seen/by-external-id (patch_07). Nada mas. Eso deja dos agujeros:
//
//   (a) Herencia. Las cinco se terminaron de ver antes de que patch_36
//       (16-jul-2026) enganchara esa llamada para TV — Shatter Belt por 8
//       dias. Como no se ha vuelto a marcar ningun episodio suyo, la regla
//       nunca ha pasado por ellas.
//
//   (b) El agujero sigue abierto y es el que importa. El gate mira el
//       `status` EN EL MOMENTO de marcar el episodio. Lo normal es terminar
//       la ultima temporada mientras TMDB todavia la tiene como "Returning
//       Series" y que la cancelen meses despues. Cuando el refresco de
//       metadatos cambia el status a Ended/Canceled, nadie vuelve a mirar la
//       watchlist: la serie se queda dentro para siempre.
//
// Cambio: `updateMediaItem` (updateMetadata.js), que es justamente quien
// escribe el nuevo `status`, re-evalua la regla despues de guardarlo, para
// cada usuario que tenga la serie en su lista de seguimiento. Convierte la
// politica en eventualmente consistente en vez de evaluarla una sola vez.
//
// NO se duplica la regla: se exporta el helper existente y se reutiliza. Hay
// dos definiciones de "serie completada" en el codigo (esta y la del flag
// `seen` de patch_27) y anadir una tercera es como se desincronizan. El
// helper ademas relee el status de la BD por su cuenta, asi que el guard de
// aqui es solo un atajo — quien decide sigue siendo el.
//
// El require de controllers/seen.js es PEREZOSO a proposito: en el top-level
// crearia un ciclo (updateMetadata -> controllers/seen -> metadata/
// findByExternalId -> updateMetadata) y el modulo llegaria a medio construir.
//
// Alcance: solo BORRA de la lista de seguimiento, y solo series ya emitidas
// por completo y cerradas. Un "Returning Series" no se toca nunca, asi que no
// puede tirar nada que siga en emision.

;(() => {
const fs = require('fs');
const child = require('child_process');

const MARKER = 'mt-fork:wl-recheck-on-metadata';

// --- 1. Exportar el helper desde controllers/seen.js ---------------------
const seenPath = '/app/build/controllers/seen.js';
let s = fs.readFileSync(seenPath, 'utf8');

if (s.includes(MARKER)) {
  console.log('watchlist recheck on metadata: already patched');
  return;
}

const seenAnchor = '  } catch (_) { /* fire-and-forget */ }\n}\n';
if ((s.split(seenAnchor).length - 1) !== 1) {
  throw new Error('wl-recheck: _removeFromWatchlistIfComplete anchor not unique');
}
s = s.replace(
  seenAnchor,
  seenAnchor +
  '\n/*' + MARKER + '*/\n' +
  'exports._removeFromWatchlistIfComplete = _removeFromWatchlistIfComplete;\n'
);
fs.writeFileSync(seenPath, s);

// --- 2. Re-evaluar al refrescar metadatos --------------------------------
const metaPath = '/app/build/updateMetadata.js';
let c = fs.readFileSync(metaPath, 'utf8');

const metaAnchor =
  '      if (!oldMediaItem.needsDetails) {\n' +
  '        await sendNotifications(oldMediaItem, updatedMediaItem);\n' +
  '      }\n' +
  '    }\n';
if ((c.split(metaAnchor).length - 1) !== 1) {
  throw new Error('wl-recheck: updateMediaItem anchor not unique');
}

const recheck =
  '      /*' + MARKER + '*/\n' +
  '      if (updatedMediaItem.mediaType === \'tv\') {\n' +
  '        try {\n' +
  '          const _wlReturning = [\'Returning Series\', \'In Production\', \'Planned\'];\n' +
  '          if (_wlReturning.indexOf(updatedMediaItem.status) < 0) {\n' +
  '            const _wlKnex = _dbconfig.Database.knex;\n' +
  '            const _wlRows = await _wlKnex(\'listItem\')\n' +
  '              .join(\'list\', \'list.id\', \'listItem.listId\')\n' +
  '              .where(\'list.isWatchlist\', true)\n' +
  '              .where(\'listItem.mediaItemId\', updatedMediaItem.id)\n' +
  '              .whereNull(\'listItem.seasonId\')\n' +
  '              .whereNull(\'listItem.episodeId\')\n' +
  '              .select(\'list.userId as userId\');\n' +
  '            if (_wlRows.length > 0) {\n' +
  '              const _wlHelper = require(\'./controllers/seen\')._removeFromWatchlistIfComplete;\n' +
  '              if (typeof _wlHelper === \'function\') {\n' +
  '                for (const _wlRow of _wlRows) {\n' +
  '                  await _wlHelper(_wlRow.userId, { id: updatedMediaItem.id, mediaType: \'tv\' });\n' +
  '                }\n' +
  '              }\n' +
  '            }\n' +
  '          }\n' +
  '        } catch (_) { /* fire-and-forget: nunca romper el refresco */ }\n' +
  '      }\n';

c = c.replace(
  metaAnchor,
  '      if (!oldMediaItem.needsDetails) {\n' +
  '        await sendNotifications(oldMediaItem, updatedMediaItem);\n' +
  '      }\n' +
  recheck +
  '    }\n'
);
fs.writeFileSync(metaPath, c);

// Comprobacion de sintaxis: un fallo aqui deja el contenedor sin arrancar.
try {
  child.execSync('node --check ' + seenPath, { stdio: 'pipe' });
  child.execSync('node --check ' + metaPath, { stdio: 'pipe' });
  console.log('watchlist recheck on metadata: applied + syntax OK');
} catch (e) {
  console.error('watchlist recheck on metadata: SYNTAX ERROR -> ' + String(e.message || '').slice(0, 400));
  process.exit(1);
}

})();
