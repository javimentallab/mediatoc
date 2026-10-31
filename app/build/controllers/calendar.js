"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getCalendarItems = exports.CalendarController = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _dateFns = require("date-fns");
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _dbconfig = require("../dbconfig");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * @openapi_tags Calendar
 */
class CalendarController {
  /**
   * @openapi_operationId get
   */
  get = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      start,
      end
    } = req.query;
    res.send(await getCalendarItems({
      userId,
      start: (0, _dateFns.parseISO)(start).toISOString(),
      end: (0, _dateFns.parseISO)(end).toISOString()
    }));
  });
}
exports.CalendarController = CalendarController;
const getCalendarItems = async args => {
  const { userId, start, end } = args;
  // Items in the user's library: any item with listItem entry, seen, rating, or progress
  const uid = Number(userId);
  // "Actively tracked" = in some list (watchlist/custom) or currently in progress.
  // Excludes items only present in 'seen' (already-watched, possibly abandoned) or
  // 'userRating' (rated then forgotten).
  /* CALENDAR_LIB_V4 */
  const libSubquery = `SELECT mediaItemId FROM (
                         SELECT mediaItemId FROM listItem li JOIN list l ON l.id = li.listId WHERE l.userId = ${uid}
                         UNION SELECT mediaItemId FROM progress WHERE userId = ${uid} AND progress > 0 AND progress < 1
                         UNION SELECT DISTINCT episode.tvShowId AS mediaItemId FROM episode JOIN seen ON seen.episodeId = episode.id WHERE seen.userId = ${uid}
                       ) WHERE mediaItemId NOT IN (SELECT mediaItemId FROM abandoned WHERE userId = ${uid})`;

  // Episodes (regular, not specials) with release date in range, only for shows in user's library
  const episodes = await _dbconfig.Database.knex('episode')
    .select({
      'episode.id': 'episode.id',
      'episode.title': 'episode.title',
      'episode.episodeNumber': 'episode.episodeNumber',
      'episode.seasonNumber': 'episode.seasonNumber',
      'episode.releaseDate': 'episode.releaseDate',
      'episode.isSpecialEpisode': 'episode.isSpecialEpisode',
      'mediaItem.id': 'mediaItem.id',
      'mediaItem.title': 'mediaItem.title',
      'mediaItem.mediaType': 'mediaItem.mediaType',
      'mediaItem.releaseDate': 'mediaItem.releaseDate',
      'episodeSeen.episodeId': 'episodeSeen.episodeId',
      'mediaItemSeen.mediaItemId': 'mediaItemSeen.mediaItemId'
    })
    .leftJoin('mediaItem', 'mediaItem.id', 'episode.tvShowId')
    .leftJoin(qb => qb.select('episodeId').from('seen').where('userId', userId).groupBy('episodeId').as('episodeSeen'), 'episodeSeen.episodeId', 'episode.id')
    .leftJoin(qb => qb.select('mediaItemId').from('seen').where('userId', userId).whereNull('episodeId').groupBy('mediaItemId').as('mediaItemSeen'), 'mediaItemSeen.mediaItemId', 'mediaItem.id')
    .where('episode.isSpecialEpisode', false)
    .whereBetween('episode.releaseDate', [start, end])
    .whereRaw(`episode.tvShowId IN (${libSubquery})`);

  // Non-TV mediaItems with release date in range, only items in user's library
  const items = await _dbconfig.Database.knex('mediaItem')
    .select({
      'mediaItem.id': 'mediaItem.id',
      'mediaItem.title': 'mediaItem.title',
      'mediaItem.mediaType': 'mediaItem.mediaType',
      'mediaItem.releaseDate': 'mediaItem.releaseDate',
      'mediaItemSeen.mediaItemId': 'mediaItemSeen.mediaItemId'
    })
    .leftJoin(qb => qb.select('mediaItemId').from('seen').where('userId', userId).whereNull('episodeId').groupBy('mediaItemId').as('mediaItemSeen'), 'mediaItemSeen.mediaItemId', 'mediaItem.id')
    .whereNot('mediaItem.mediaType', 'tv')
    .whereBetween('mediaItem.releaseDate', [start, end])
    .whereRaw(`mediaItem.id IN (${libSubquery})`);

  const result = [];
  for (const row of episodes) {
    if (!row['mediaItem.id']) continue;
    result.push({
      mediaItem: {
        id: row['mediaItem.id'],
        title: row['mediaItem.title'],
        releaseDate: row['mediaItem.releaseDate'],
        mediaType: row['mediaItem.mediaType'],
        seen: row['mediaItemSeen.mediaItemId'] != undefined
      },
      episode: {
        id: row['episode.id'],
        title: row['episode.title'],
        episodeNumber: row['episode.episodeNumber'],
        seasonNumber: row['episode.seasonNumber'],
        releaseDate: row['episode.releaseDate'],
        seen: row['episodeSeen.episodeId'] != undefined,
        isSpecialEpisode: Boolean(row['episode.isSpecialEpisode'])
      },
      releaseDate: row['episode.releaseDate']
    });
  }
  for (const row of items) {
    result.push({
      mediaItem: {
        id: row['mediaItem.id'],
        title: row['mediaItem.title'],
        releaseDate: row['mediaItem.releaseDate'],
        mediaType: row['mediaItem.mediaType'],
        seen: row['mediaItemSeen.mediaItemId'] != undefined
      },
      releaseDate: row['mediaItem.releaseDate']
    });
  }
  return _lodash.default.uniqBy(result, e => e.episode ? 'e' + e.episode.id : 'm' + e.mediaItem.id);
};

exports.getCalendarItems = getCalendarItems;
//# sourceMappingURL=calendar.js.map
/* CALENDAR_ALL_V2_APPLIED */
