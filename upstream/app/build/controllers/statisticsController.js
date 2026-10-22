"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.userStatisticsSummary = exports.StatisticsController = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _dbconfig = require("../dbconfig");
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
  return (0, _lodash.default)(res).keyBy('mediaType').mapValues(item => ({
    ..._lodash.default.omit(item, ['runtime', 'mediaType']),
    numberOfPages: Math.round(item.numberOfPages),
    duration: Math.round(item.mediaType === 'video_game' || item.mediaType === 'book' ? item.duration : item.runtime)
  })).value();
};
exports.userStatisticsSummary = userStatisticsSummary;
//# sourceMappingURL=statisticsController.js.map