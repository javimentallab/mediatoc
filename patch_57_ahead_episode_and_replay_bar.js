// patch_57_ahead_episode_and_replay_bar.js
//
// Dos huecos de la tarjeta en "En proceso" (26-sep-2026):
//
// 1) "American Horror Story no indica el capítulo por el que va ni la barra."
//    Tras patch_56 la serie sale en En proceso, pero la tarjeta de TV pinta el
//    badge SxxEyy, la barra y el botón de progreso SOLO si hay
//    `firstUnwatchedEpisode`, y items.js lo calcula entre episodios YA
//    EMITIDOS (releaseDate <= hoy). Visto el 13x1 antes del estreno (1-oct),
//    no hay ninguno → tarjeta pelada.
//    Cambio (backend, items.js): si una serie en emisión no trae
//    `firstUnwatchedEpisode`, se rellena con el siguiente episodio no especial
//    sin ver POSTERIOR al último visto y de su MISMA temporada, aunque no se
//    haya emitido o no tenga fecha. Mismo criterio que la rama de patch_56.
//    Se hace sobre el payload (una query por página, solo para las series
//    afectadas) en vez de tocar el join `firstUnwatchedEpisodeHelper`, que
//    alimenta también unseenEpisodesCount y los filtros de "siguiente a ver".
//
// 2) "Tampoco hay barra en Stalker 2, que debería tenerla aunque ya lo haya
//    jugado una vez. Y así con todas las fichas."
//    La tarjeta no-TV pinta la barra (y el botón de progreso, que va en el
//    mismo bloque) solo si `!t.seen` o hay progreso parcial en (0,1). Una
//    relectura/rejugada fijada a mano en En proceso (activelyInProgress,
//    excluded=0) ya está `seen` y sin progreso → sin barra ni botón para
//    empezar a apuntarlo.
//    Cambio (frontend): también se pinta si `t.activelyInProgress`. items.js
//    ya devuelve ese flag; list.js no, así que en las páginas de listas no
//    cambia nada (allí no se fija nada en En proceso).

;(() => {
const fs = require('fs');

// ---------- 1) backend: items.js ----------
{
  const path = '/app/build/knex/queries/items.js';
  let c = fs.readFileSync(path, 'utf8');
  const MARKER = 'mt-fork:ahead-of-air-first-unwatched';
  if (c.includes(MARKER)) {
    console.log('ahead episode: already patched');
  } else {
    const anchor = '  const payload = await _getItemsKnexUncached(args);\n';
    if (c.split(anchor).length - 1 !== 1) throw new Error('ahead episode: anchor not found/unique');

    const helper = `
/* ${MARKER} */
const _fillAheadOfAirEpisode = async (payload, userId) => {
  const list = Array.isArray(payload) ? payload : (payload && payload.data);
  if (!Array.isArray(list) || !userId) return payload;
  const AIRING = ['Returning Series', 'In Production', 'Planned'];
  const targets = list.filter(i => i && i.mediaType === 'tv' && !i.firstUnwatchedEpisode && AIRING.includes(i.status));
  if (!targets.length) return payload;
  const ids = targets.map(i => i.id);
  const now = new Date().toISOString();
  const knex = _dbconfig.Database.knex;
  const rows = await knex.raw(\`
    WITH lastSeenEp AS (
      SELECT e.tvShowId, MAX(e.seasonAndEpisodeNumber) AS sae
      FROM seen s JOIN episode e ON e.id = s.episodeId
      WHERE s.userId = ? AND e.isSpecialEpisode = 0 AND e.tvShowId IN (\${ids.map(() => '?').join(',')})
      GROUP BY e.tvShowId
    ), cand AS (
      SELECT n.*, ROW_NUMBER() OVER (PARTITION BY n.tvShowId ORDER BY n.seasonAndEpisodeNumber) AS rn
      FROM lastSeenEp l
      JOIN episode le ON le.tvShowId = l.tvShowId AND le.seasonAndEpisodeNumber = l.sae
      JOIN episode n ON n.tvShowId = l.tvShowId AND n.seasonNumber = le.seasonNumber
      WHERE n.seasonAndEpisodeNumber > l.sae AND n.isSpecialEpisode = 0
        AND (n.releaseDate IS NULL OR n.releaseDate = '' OR n.releaseDate > ?)
        AND NOT EXISTS (SELECT 1 FROM seen s2 WHERE s2.episodeId = n.id AND s2.userId = ?)
    )
    SELECT * FROM cand WHERE rn = 1\`, [userId, ...ids, now, userId]);
  const byShow = new Map(rows.map(r => [r.tvShowId, r]));
  for (const i of targets) {
    const r = byShow.get(i.id);
    if (!r) continue;
    i.firstUnwatchedEpisode = {
      id: r.id, title: r.title, description: r.description,
      episodeNumber: r.episodeNumber, seasonNumber: r.seasonNumber,
      releaseDate: r.releaseDate || null, tvShowId: r.tvShowId,
      tmdbId: r.tmdbId, imdbId: r.imdbId, tvdbId: r.tvdbId, traktId: r.traktId,
      runtime: r.runtime, seasonId: r.seasonId,
      isSpecialEpisode: Boolean(r.isSpecialEpisode),
      progress: r.progress == null ? null : Number(r.progress)
    };
    if (!i.activelyInProgressExcluded) i.inProgress = true;
  }
  return payload;
};
`;
    const newLine = '  const payload = await _fillAheadOfAirEpisode(await _getItemsKnexUncached(args), args && args.userId);\n';
    c = c.replace(anchor, newLine);
    // Helper antes de getItemsKnex (definido como const más arriba que su uso).
    const defAnchor = 'const _getItemsKnexUncached = async args => {';
    if (c.split(defAnchor).length - 1 !== 1) throw new Error('ahead episode: def anchor not found/unique');
    c = c.replace(defAnchor, helper + defAnchor);
    fs.writeFileSync(path, c);
    console.log('ahead episode: firstUnwatchedEpisode falls back to unaired next episode');
  }
}

// ---------- 2) frontend: bundle ----------
{
  const dir = '/app/public';
  const file = fs.readdirSync(dir).find(f => /^main_.*\.js$/.test(f) && !/LICENSE|\.map$/.test(f));
  if (!file) throw new Error('replay bar: bundle not found');
  const path = dir + '/' + file;
  let s = fs.readFileSync(path, 'utf8');
  const MARKER = 'REPLAY_BAR_AIP_V1';
  if (s.includes(MARKER)) {
    console.log('replay bar: already patched');
  } else {
    const anchor = '(Ro(t)?Boolean(t.firstUnwatchedEpisode):(!t.seen||(/* PROGRESS_BAR_MAX_V2 */';
    if (s.split(anchor).length - 1 !== 1) throw new Error('replay bar: anchor not found/unique');
    s = s.replace(anchor, '(Ro(t)?Boolean(t.firstUnwatchedEpisode):(!t.seen||/* ' + MARKER + ' */t.activelyInProgress||(/* PROGRESS_BAR_MAX_V2 */');
    fs.writeFileSync(path, s);
    console.log('replay bar: card bar shown for pinned in-progress items');
  }
}

})();
