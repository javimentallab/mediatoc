"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.mapList = exports.getDetailsKnex = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _dateFns = require("date-fns");
var _tvepisode = require("../../entity/tvepisode");
var _userRating = require("../../entity/userRating");
var _seen = require("../../entity/seen");
var _dbconfig = require("../../dbconfig");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const getDetailsKnex = async params => {
  var _$first2, _$maxBy, _mediaItem$genres, _mediaItem$narrators, _mediaItem$authors;
  const {
    mediaItemId,
    userId
  } = params;
  const {
    mediaItem,
    seasons,
    episodes,
    seenHistory,
    userRating,
    lists,
    progress
  } = await _dbconfig.Database.knex.transaction(async trx => {
    const mediaItem = await trx('mediaItem').where({
      id: mediaItemId
    }).first();
    const seasons = await trx('season').where({
      tvShowId: mediaItemId
    }).orderBy('seasonNumber', 'asc');
    const episodes = await trx('episode').where({
      tvShowId: mediaItemId
    }).orderBy('seasonNumber', 'asc').orderBy('episodeNumber', 'asc');
    const seenHistory = await trx('seen').where({
      mediaItemId: mediaItemId,
      userId: userId
    }).orderBy('date', 'desc');
    const userRating = await trx('userRating').where({
      mediaItemId: mediaItemId,
      userId: userId
    }).orderBy('date', 'desc');
    const lists = await trx('list').select('list.*', 'seasonId', 'episodeId').innerJoin('listItem', qb => qb.onVal('mediaItemId', mediaItemId).on('list.id', 'listItem.listId')).where('userId', userId);
    const progress = await trx('progress').where({
      mediaItemId: mediaItemId,
      episodeId: null,
      userId: userId
    });
    return {
      mediaItem,
      seasons,
      episodes,
      seenHistory,
      userRating,
      lists,
      progress
    };
  });
  if (!mediaItem) {
    return;
  }
  const groupedSeasonRating = (0, _lodash.default)(userRating).filter(_userRating.UserRatingFilters.seasonUserRating).groupBy(rating => rating.seasonId).mapValues(ratings => (ratings === null || ratings === void 0 ? void 0 : ratings.length) > 0 ? ratings[0] : null).value();
  const groupedEpisodesRating = (0, _lodash.default)(userRating).filter(_userRating.UserRatingFilters.episodeUserRating).groupBy(rating => rating.episodeId).mapValues(ratings => (ratings === null || ratings === void 0 ? void 0 : ratings.length) > 0 ? ratings[0] : null).value();
  const groupedEpisodesSeenHistory = (0, _lodash.default)(seenHistory).filter(_seen.SeenFilters.episodeSeenValue).groupBy(seen => seen.episodeId).value();
  const mediaItemLists = lists.filter(row => !row.seasonId && !row.episodeId);
  episodes.forEach(episode => {
    var _$first, _episode$seenHistory;
    episode.userRating = groupedEpisodesRating[episode.id];
    episode.seenHistory = groupedEpisodesSeenHistory[episode.id];
    episode.isSpecialEpisode = Boolean(episode.isSpecialEpisode);
    episode.lastSeenAt = (_$first = _lodash.default.first(episode.seenHistory)) === null || _$first === void 0 ? void 0 : _$first.date;
    episode.seen = ((_episode$seenHistory = episode.seenHistory) === null || _episode$seenHistory === void 0 ? void 0 : _episode$seenHistory.length) > 0;
    delete episode.seasonAndEpisodeNumber;
  });
  const groupedEpisodes = _lodash.default.groupBy(episodes, episode => episode.seasonId);
  const seasonsWithPosters = seasons.map(season => {
    var _season$episodes, _season$episodes2;
    return {
      ...season,
      isSpecialSeason: Boolean(season.isSpecialSeason),
      poster: season.posterId ? `/img/${season.posterId}` : null,
      posterSmall: season.posterId ? `/img/${season.posterId}?size=small` : null,
      episodes: groupedEpisodes[season.id] || [],
      userRating: groupedSeasonRating[season.id],
      seen: ((_season$episodes = season.episodes) === null || _season$episodes === void 0 ? void 0 : _season$episodes.filter(_tvepisode.TvEpisodeFilters.withReleaseDateEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).length) > 0 && ((_season$episodes2 = season.episodes) === null || _season$episodes2 === void 0 ? void 0 : _season$episodes2.filter(_tvepisode.TvEpisodeFilters.withReleaseDateEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).filter(_tvepisode.TvEpisodeFilters.unwatchedEpisodes).length) === 0
    };
  });
  const firstUnwatchedEpisode = (0, _lodash.default)(episodes).filter(_tvepisode.TvEpisodeFilters.unwatchedEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).minBy(episode => episode.seasonNumber * 1000 + episode.episodeNumber);
  const upcomingEpisode = (0, _lodash.default)(episodes).filter(_tvepisode.TvEpisodeFilters.withReleaseDateEpisodes).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.unreleasedEpisodes).minBy(episode => (0, _dateFns.parseISO)(episode.releaseDate).getTime());
  const lastAiredEpisode = (0, _lodash.default)(episodes).filter(_tvepisode.TvEpisodeFilters.withReleaseDateEpisodes).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).maxBy(episode => (0, _dateFns.parseISO)(episode.releaseDate).getTime());
  const unseenEpisodesCount = (0, _lodash.default)(episodes).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.withReleaseDateEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).filter(_tvepisode.TvEpisodeFilters.unwatchedEpisodes).value().length;
  const numberOfEpisodes = (0, _lodash.default)(episodes).filter(_tvepisode.TvEpisodeFilters.nonSpecialEpisodes).filter(_tvepisode.TvEpisodeFilters.withReleaseDateEpisodes).filter(_tvepisode.TvEpisodeFilters.releasedEpisodes).value().length;
  const nextAiring = mediaItem.mediaType === 'tv' ? upcomingEpisode === null || upcomingEpisode === void 0 ? void 0 : upcomingEpisode.releaseDate : mediaItem.releaseDate;
  const lastAiring = mediaItem.mediaType === 'tv' ? lastAiredEpisode === null || lastAiredEpisode === void 0 ? void 0 : lastAiredEpisode.releaseDate : mediaItem.releaseDate;
  /*mediaocd:tv-seen-requires-ended-details*/ const seen = mediaItem.mediaType === 'tv' ? (numberOfEpisodes > 0 && unseenEpisodesCount === 0 && ["Returning Series","In Production","Planned"].indexOf(mediaItem.status) < 0) : seenHistory && (seenHistory === null || seenHistory === void 0 ? void 0 : seenHistory.length) > 0;
  const lastSeen = ((_$first2 = _lodash.default.first(seenHistory)) === null || _$first2 === void 0 ? void 0 : _$first2.date) || null;
  const progressGroupedByDate = (0, _lodash.default)(progress).groupBy('date');
  const progressValue = (_$maxBy = _lodash.default.maxBy(progressGroupedByDate.get(progressGroupedByDate.keys().max()), 'progress')) === null || _$maxBy === void 0 ? void 0 : _$maxBy.progress;
  const totalRuntime = episodes === null || episodes === void 0 ? void 0 : episodes.reduce((sum, episode) => sum + (episode.runtime || mediaItem.runtime), 0);
  return {
    ...mediaItem,
    platform: mediaItem.platform ? JSON.parse(mediaItem.platform) : null,
    hasDetails: true,
    genres: (_mediaItem$genres = mediaItem.genres) === null || _mediaItem$genres === void 0 ? void 0 : _mediaItem$genres.split(','),
    narrators: (_mediaItem$narrators = mediaItem.narrators) === null || _mediaItem$narrators === void 0 ? void 0 : _mediaItem$narrators.split(','),
    authors: (_mediaItem$authors = mediaItem.authors) === null || _mediaItem$authors === void 0 ? void 0 : _mediaItem$authors.split(','),
    progress: progressValue !== 1 ? progressValue ?? null : null,
    seenHistory: seenHistory,
    seen: seen,
    seasons: seasonsWithPosters,
    upcomingEpisode: upcomingEpisode,
    lastAiredEpisode: lastAiredEpisode,
    firstUnwatchedEpisode: firstUnwatchedEpisode,
    userRating: userRating.find(_userRating.UserRatingFilters.mediaItemUserRating) || null,
    onWatchlist: Boolean(mediaItemLists.find(list => Boolean(list.isWatchlist))),
    unseenEpisodesCount: unseenEpisodesCount,
    nextAiring: nextAiring,
    lastAiring: lastAiring,
    numberOfEpisodes: numberOfEpisodes,
    lastSeenAt: lastSeen,
    poster: mediaItem.posterId ? `/img/${mediaItem.posterId}` : null,
    posterSmall: mediaItem.posterId ? `/img/${mediaItem.posterId}?size=small` : null,
    backdrop: mediaItem.backdropId ? `/img/${mediaItem.backdropId}` : null,
    lists: mediaItemLists.map(mapList),
    totalRuntime: totalRuntime || undefined
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.getDetailsKnex = getDetailsKnex;
const mapList = row => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt,
  isWatchlist: Boolean(row.isWatchlist),
  allowComments: Boolean(row.allowComments),
  displayNumbers: Boolean(row.displayNumbers),
  privacy: row.privacy,
  updatedAt: row.updatedAt,
  userId: row.userId,
  description: row.description,
  sortBy: row.sortBy,
  sortOrder: row.sortOrder
});
exports.mapList = mapList;
//# sourceMappingURL=details.js.map