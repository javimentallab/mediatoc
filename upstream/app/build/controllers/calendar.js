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
  const {
    userId,
    start,
    end
  } = args;
  const res = await _dbconfig.Database.knex('list').select({
    'episode.episodeNumber': 'episode.episodeNumber',
    'episode.id': 'episode.id',
    'episode.isSpecialEpisode': 'episode.isSpecialEpisode',
    'episode.releaseDate': 'episode.releaseDate',
    'episode.runtime': 'episode.runtime',
    'episode.seasonNumber': 'episode.seasonNumber',
    'episode.seen': 'episodeSeen.episodeId',
    'episode.title': 'episode.title',
    'listItem.episodeId': 'listItem.episodeId',
    'listItem.mediaItemId': 'listItem.mediaItemId',
    'listItem.seasonId': 'listItem.seasonId',
    'mediaItem.mediaType': 'mediaItem.mediaType',
    'mediaItem.releaseDate': 'mediaItem.releaseDate',
    'mediaItem.runtime': 'mediaItem.runtime',
    'mediaItem.seen': 'mediaItemSeen.mediaItemId',
    'mediaItem.title': 'mediaItem.title',
    'mediaItemEpisode.episodeNumber': 'mediaItemEpisode.episodeNumber',
    'mediaItemEpisode.id': 'mediaItemEpisode.id',
    'mediaItemEpisode.isSpecialEpisode': 'mediaItemEpisode.isSpecialEpisode',
    'mediaItemEpisode.releaseDate': 'mediaItemEpisode.releaseDate',
    'mediaItemEpisode.seasonNumber': 'mediaItemEpisode.seasonNumber',
    'mediaItemEpisode.title': 'mediaItemEpisode.title',
    'season.releaseDate': 'season.releaseDate',
    'seasonEpisode.episodeNumber': 'seasonEpisode.episodeNumber',
    'seasonEpisode.id': 'seasonEpisode.id',
    'seasonEpisode.isSpecialEpisode': 'seasonEpisode.isSpecialEpisode',
    'seasonEpisode.releaseDate': 'seasonEpisode.releaseDate',
    'seasonEpisode.seasonNumber': 'seasonEpisode.seasonNumber',
    'seasonEpisode.title': 'seasonEpisode.title'
  }).leftJoin('listItem', 'listItem.listId', 'list.id').leftJoin('mediaItem', 'mediaItem.id', 'listItem.mediaItemId').leftJoin('season', 'season.id', 'listItem.seasonId').leftJoin('episode', 'episode.id', 'listItem.episodeId').leftJoin(_dbconfig.Database.knex.ref('episode').as('mediaItemEpisode'), qb => qb.on('mediaItemEpisode.tvShowId', 'listItem.mediaItemId').onNull('listItem.episodeId').onNull('listItem.seasonId')).leftJoin(_dbconfig.Database.knex.ref('episode').as('seasonEpisode'), qb => qb.on('seasonEpisode.seasonId', 'listItem.seasonId').onNull('listItem.episodeId'))
  // Episode: seen
  .leftJoin(qb => qb.select('episodeId').from('seen').where('userId', userId).groupBy('episodeId').as('episodeSeen'), qb => qb.orOn('episodeSeen.episodeId', 'listItem.episodeId').orOn('episodeSeen.episodeId', 'seasonEpisode.id').orOn('episodeSeen.episodeId', 'mediaItemEpisode.id'))
  // MediaItem: seen
  .leftJoin(qb => qb.select('mediaItemId').from('seen').where('userId', userId).groupBy('mediaItemId').as('mediaItemSeen'), qb => qb.on('mediaItemSeen.mediaItemId', 'listItem.mediaItemId').andOnNull('listItem.seasonId').andOnNull('listItem.episodeId')).where('userId', userId).where('isWatchlist', true).where(qb => qb.orWhere(qb => qb.whereNot('mediaItem.mediaType', 'tv').andWhereBetween('mediaItem.releaseDate', [start, end])).orWhereBetween('episode.releaseDate', [start, end]).orWhereBetween('seasonEpisode.releaseDate', [start, end]).orWhereBetween('mediaItemEpisode.releaseDate', [start, end]));
  const mappedItems = res.map(row => ({
    mediaItem: {
      id: row['listItem.mediaItemId'],
      title: row['mediaItem.title'],
      releaseDate: row['mediaItem.releaseDate'],
      mediaType: row['mediaItem.mediaType'],
      seen: row['mediaItem.seen'] != undefined
    },
    ...(row['episode.releaseDate'] ? {
      episode: {
        id: row['listItem.episodeId'],
        title: row['episode.title'],
        episodeNumber: row['episode.episodeNumber'],
        seasonNumber: row['episode.seasonNumber'],
        releaseDate: row['episode.releaseDate'],
        seen: row['episode.seen'] != undefined,
        isSpecialEpisode: Boolean(row['episode.isSpecialEpisode'])
      }
    } : {}),
    ...(row['mediaItemEpisode.releaseDate'] ? {
      episode: {
        id: row['mediaItemEpisode.id'],
        title: row['mediaItemEpisode.title'],
        episodeNumber: row['mediaItemEpisode.episodeNumber'],
        seasonNumber: row['mediaItemEpisode.seasonNumber'],
        releaseDate: row['mediaItemEpisode.releaseDate'],
        seen: row['episode.seen'] != undefined,
        isSpecialEpisode: Boolean(row['mediaItemEpisode.isSpecialEpisode'])
      }
    } : {}),
    ...(row['seasonEpisode.releaseDate'] ? {
      episode: {
        id: row['seasonEpisode.id'],
        title: row['seasonEpisode.title'],
        episodeNumber: row['seasonEpisode.episodeNumber'],
        seasonNumber: row['seasonEpisode.seasonNumber'],
        releaseDate: row['seasonEpisode.releaseDate'],
        seen: row['episode.seen'] != undefined,
        isSpecialEpisode: Boolean(row['seasonEpisode.isSpecialEpisode'])
      }
    } : {})
  }));
  const [episodes, mediaItems] = _lodash.default.partition(mappedItems, value => value.episode);
  const uniqueEpisodes = _lodash.default.uniqBy(episodes, episode => {
    var _episode$episode;
    return (_episode$episode = episode.episode) === null || _episode$episode === void 0 ? void 0 : _episode$episode.id;
  });
  return (0, _lodash.default)([...uniqueEpisodes, ...mediaItems]).map(value => value.episode ? {
    releaseDate: value.episode.releaseDate,
    ...value
  } : {
    releaseDate: value.mediaItem.releaseDate,
    ...value
  }).orderBy(item => item.episode ? item.episode.seasonNumber * 1000 + item.episode.episodeNumber : item.releaseDate).orderBy('releaseDate').value();
};
exports.getCalendarItems = getCalendarItems;
//# sourceMappingURL=calendar.js.map