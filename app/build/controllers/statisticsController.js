"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.userStatisticsSummary = exports.StatisticsController = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _dbconfig = require("../dbconfig");
var _logger = require("../logger");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * @openapi_tags Statistics
 */
class StatisticsController {
  /**
   * @openapi_operationId summary
   */
  add = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const statistics = await userStatisticsSummary(userId);
    res.send(statistics);
  });
}
exports.StatisticsController = StatisticsController;
const userStatisticsSummary = async userId => {
  // mediaocd: auto-refresh-games — fire once per container lifetime
  if (!global._mtAutoRefreshGamesDone) {
    global._mtAutoRefreshGamesDone = true;
    setImmediate(async () => {
      try {
        const knex = _dbconfig.Database.knex;
        const games = await knex('mediaItem').where({ mediaType: 'video_game' }).whereNotNull('igdbId').whereNull('runtime').select('id', 'igdbId', 'title');
        if (!games.length) return;
        const { metadataProviders } = require('../metadata/metadataProviders');
        const igdb = metadataProviders.get('video_game', 'IGDB');
        if (!igdb) return;
        _logger.logger.info('mediaocd: auto-refreshing IGDB time-to-beat for ' + games.length + ' game(s) without runtime');
        let updated = 0, missing = 0, failed = 0;
        // Process in batches of 5 in parallel — drops total time from ~250ms*N to ~250ms*(N/5).
        // Going wider risks IGDB rate-limiting the user's app credentials.
        const BATCH = 5;
        for (let i = 0; i < games.length; i += BATCH) {
          const slice = games.slice(i, i + BATCH);
          await Promise.all(slice.map(async g => {
            let ttb = null;
            try { ttb = await igdb.gameTimeToBeat(g.igdbId); }
            catch (_) { failed++; return; }
            if (!ttb) { missing++; return; }
            try { await knex('mediaItem').where('id', g.id).update({ runtime: ttb }); updated++; }
            catch (_) { failed++; }
          }));
        }
        _logger.logger.info('mediaocd: auto-refresh done — updated=' + updated + ', missing=' + missing + ', failed=' + failed);
      } catch (e) {
        _logger.logger.error('mediaocd: auto-refresh failed: ' + (e && e.message));
      }
    });
  }
  const res = await _dbconfig.Database.knex('seen').sum({
    runtime: _dbconfig.Database.knex.raw(`CASE
                           WHEN "episode"."runtime" IS NOT NULL THEN "episode"."runtime"
                           ELSE "mediaItem"."runtime"
                         END * 1
                           `),
    numberOfPages: _dbconfig.Database.knex.raw(`CASE
                                 WHEN "mediaItem"."numberOfPages" IS NOT NULL THEN "mediaItem"."numberOfPages"
                                 ELSE 0
                               END * 1`),
    duration: _dbconfig.Database.knex.raw(`CASE
                            WHEN "seen"."duration" IS NOT NULL THEN "seen"."duration"
                            ELSE 0
                          END `)
  }).select('mediaItem.mediaType').count({
    episodes: _dbconfig.Database.knex.raw('DISTINCT "episode"."id"'),
    items: _dbconfig.Database.knex.raw('DISTINCT "mediaItem"."id"'),
    plays: '*'
  }).where('userId', userId).leftJoin('mediaItem', 'mediaItem.id', 'seen.mediaItemId').leftJoin('episode', 'episode.id', 'seen.episodeId').groupBy('mediaItem.mediaType');
  // mediaocd: distinct-game-runtime — for video_game expose two stats:
  //   played*  → distinct games with kind='played' + sum of max IGDB time-to-beat
  //   watched* → distinct games with kind='watched' + sum of max IGDB time-to-beat
  // The homepage renders two lines: '(N juegos) Xh Xm jugando' / '...viendo'.
  const _gameStatsByKind = async (kind) => {
    const rows = await _dbconfig.Database.knex
      .select('mediaItem.id', 'mediaItem.runtime')
      .from('seen')
      .leftJoin('mediaItem', 'mediaItem.id', 'seen.mediaItemId')
      .where('seen.userId', userId)
      .where('seen.kind', kind)
      .where('mediaItem.mediaType', 'video_game')
      .distinct();
    return {
      items: rows.length,
      minutes: rows.reduce((acc, r) => acc + (Number(r.runtime) || 0), 0),
    };
  };
  const _gamePlayed = await _gameStatsByKind('played');
  const _gameWatched = await _gameStatsByKind('watched');
  /* mediaocd: youtube-stats-in-summary */
  let _ytStats = { count: 0, totalSeconds: 0, totalMinutes: 0 };
  try {
    const _fsYT = require('fs');
    const _dataYT = JSON.parse(_fsYT.readFileSync('/storage/youtube-' + userId + '.json', 'utf8'));
    const _arrYT = Array.isArray(_dataYT.watched) ? _dataYT.watched : [];
    const _totalYT = _arrYT.reduce(function (s, w) { return s + (Number(w.durationSeconds) || 0); }, 0);
    _ytStats = { count: _arrYT.length, totalSeconds: _totalYT, totalMinutes: Math.round(_totalYT / 60) };
  } catch (_) {}
  const _summaryByType = (0, _lodash.default)(res).keyBy('mediaType').mapValues(item => ({
    ..._lodash.default.omit(item, ['runtime', 'mediaType']),
    numberOfPages: Math.round(item.numberOfPages),
    duration: Math.round(
      item.mediaType === 'video_game' ? _gamePlayed.minutes :
      item.mediaType === 'book' ? (item.numberOfPages || 0) * 2 /* mediaocd: book-reading-minutes */ :
      item.runtime
    ),
    playedItems:    item.mediaType === 'video_game' ? _gamePlayed.items   : undefined,
    playedDuration: item.mediaType === 'video_game' ? Math.round(_gamePlayed.minutes)  : undefined,
    watchedItems:   item.mediaType === 'video_game' ? _gameWatched.items  : undefined,
    watchedDuration:item.mediaType === 'video_game' ? Math.round(_gameWatched.minutes) : undefined,
  })).value();
  _summaryByType.youtube = _ytStats;
  return _summaryByType;
};
exports.userStatisticsSummary = userStatisticsSummary;
//# sourceMappingURL=statisticsController.js.map