"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getItemsKnex = exports.generateColumnNames = exports.QueryBuilderHelper = void 0;
var _mediaItem = require("../../entity/mediaItem");
var _dbconfig = require("../../dbconfig");
var _userRating = require("../../entity/userRating");
var _tvepisode = require("../../entity/tvepisode");
var _list = require("../../entity/list");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getItemsKnex = async args => {
  const {
    page
  } = args;
  const {
    sqlQuery,
    sqlCountQuery,
    sqlPaginationQuery
  } = await getItemsKnexSql(args);
  if (page) {
    const [resCount, res] = await _dbconfig.Database.knex.transaction(async trx => {
      const resCount = await sqlCountQuery.transacting(trx);
      const res = await sqlPaginationQuery.transacting(trx);
      return [resCount, res];
    });
    const itemsPerPage = 40;
    const total = Number(resCount[0].count);
    const from = itemsPerPage * (page - 1);
    const to = Math.min(total, itemsPerPage * page);
    const totalPages = Math.ceil(total / itemsPerPage);
    if (from > total) {
      throw new Error('Invalid page number');
    }
    const data = res.map(mapRawResult);
    return {
      from: from,
      to: to,
      data: data,
      total: total,
      page: page,
      totalPages: totalPages
    };
  } else {
    const res = await sqlQuery;
    return res.map(mapRawResult);
  }
};
exports.getItemsKnex = getItemsKnex;
const getItemsKnexSql = async args => {
  const {
    onlyOnWatchlist,
    mediaType,
    userId,
    filter,
    orderBy,
    page,
    onlySeenItems,
    sortOrder,
    onlyWithNextEpisodesToWatch,
    onlyWithNextAiring,
    mediaItemIds,
    onlyWithUserRating,
    onlyWithoutUserRating,
    onlyWithProgress
  } = args;
  const currentDateString = new Date().toISOString();
  const watchlist = await _dbconfig.Database.knex('list').select('id').where('userId', userId).where('isWatchlist', true).first();
  if (watchlist === undefined) {
    throw new Error(`user ${userId} has no watchlist`);
  }
  const watchlistId = watchlist.id;
  const query = _dbconfig.Database.knex.select(generateColumnNames('firstUnwatchedEpisode', _tvepisode.tvEpisodeColumns)).select(generateColumnNames('listItem', _list.listItemColumns)).select(generateColumnNames('upcomingEpisode', _tvepisode.tvEpisodeColumns)).select(generateColumnNames('lastAiredEpisode', _tvepisode.tvEpisodeColumns)).select(generateColumnNames('userRating', _userRating.userRatingColumns)).select(generateColumnNames('mediaItem', _mediaItem.mediaItemColumns)).select({
    lastSeenAt: 'lastSeen.date',
    'lastSeen2.mediaItemId': 'lastSeen2.mediaItemId',
    numberOfEpisodes: 'numberOfEpisodes',
    unseenEpisodesCount: 'unseenEpisodesCount',
    seenEpisodesCount: 'seenEpisodesCount',
    progress: 'progress.progress'
  }).from('mediaItem').leftJoin(qb => qb.select('mediaItemId').max('date', {
    as: 'date'
  }).from('seen').where('userId', userId).groupBy('mediaItemId').as('lastSeen'), 'lastSeen.mediaItemId', 'mediaItem.id').leftJoin(qb => qb.select('mediaItemId').max('date', {
    as: 'date'
  }).from('seen').where('userId', userId).groupBy('mediaItemId').as('lastSeen2'), 'lastSeen2.mediaItemId', 'mediaItem.id')
  // Number of episodes
  .leftJoin(qb => qb.select('tvShowId').count('*', {
    as: 'numberOfEpisodes'
  }).from('episode').whereNot('isSpecialEpisode', true).andWhereNot('releaseDate', '').andWhereNot('releaseDate', null).andWhere('releaseDate', '<=', currentDateString).groupBy('tvShowId').as('numberOfEpisodes'), 'numberOfEpisodes.tvShowId', 'mediaItem.id')
  // On watchlist
  .leftJoin('listItem', qb => {
    qb.on('listItem.mediaItemId', 'mediaItem.id').andOnNull('listItem.seasonId').andOnNull('listItem.episodeId').andOnVal('listItem.listId', watchlistId);
  })
  // Upcoming episode
  .leftJoin(qb => qb.from('episode').select('tvShowId').min('seasonAndEpisodeNumber', {
    as: 'upcomingEpisodeSeasonAndEpisodeNumber'
  }).where('isSpecialEpisode', false).where('releaseDate', '>=', currentDateString).groupBy('tvShowId').as('upcomingEpisodeHelper'), 'upcomingEpisodeHelper.tvShowId', 'mediaItem.id').leftJoin(_dbconfig.Database.knex.ref('episode').as('upcomingEpisode'), qb => qb.on('upcomingEpisode.tvShowId', 'mediaItem.id').andOn('upcomingEpisode.seasonAndEpisodeNumber', 'upcomingEpisodeSeasonAndEpisodeNumber'))
  // Last aired episode
  .leftJoin(qb => qb.from('episode').select('tvShowId').max('seasonAndEpisodeNumber', {
    as: 'lastAiredEpisodeSeasonAndEpisodeNumber'
  }).where('isSpecialEpisode', false).where('releaseDate', '<', currentDateString).groupBy('tvShowId').as('lastAiredEpisodeHelper'), 'lastAiredEpisodeHelper.tvShowId', 'mediaItem.id').leftJoin(_dbconfig.Database.knex.ref('episode').as('lastAiredEpisode'), qb => qb.on('lastAiredEpisode.tvShowId', 'mediaItem.id').andOn('lastAiredEpisode.seasonAndEpisodeNumber', 'lastAiredEpisodeSeasonAndEpisodeNumber'))
  // Seen episodes count
  .leftJoin(qb => qb.select('mediaItemId').count('*', {
    as: 'seenEpisodesCount'
  }).from(qb => qb.select('mediaItemId').from('seen').where('userId', userId).whereNotNull('episodeId').groupBy('mediaItemId', 'episodeId').leftJoin('episode', 'episode.id', 'seen.episodeId').whereNot('episode.isSpecialEpisode', true).as('seen')).groupBy('mediaItemId').as('seenEpisodes'), 'seenEpisodes.mediaItemId', 'mediaItem.id')
  // First unwatched episode and unseen episodes count
  .leftJoin(qb => qb.from('episode').select('tvShowId').min('seasonAndEpisodeNumber', {
    as: 'seasonAndEpisodeNumber'
  }).count('*', {
    as: 'unseenEpisodesCount'
  }).leftJoin(qb => qb.from('seen').where('userId', userId).as('seen'), 'seen.episodeId', 'episode.id').whereNot('episode.isSpecialEpisode', true).whereNot('episode.releaseDate', '').whereNot('episode.releaseDate', null).where('episode.releaseDate', '<=', currentDateString).whereNull('seen.userId').groupBy('tvShowId').as('firstUnwatchedEpisodeHelper'), 'firstUnwatchedEpisodeHelper.tvShowId', 'mediaItem.id').leftJoin(_dbconfig.Database.knex.ref('episode').as('firstUnwatchedEpisode'), qb => qb.on('firstUnwatchedEpisode.tvShowId', 'mediaItem.id').andOn('firstUnwatchedEpisode.seasonAndEpisodeNumber', 'firstUnwatchedEpisodeHelper.seasonAndEpisodeNumber'))
  // User rating
  .leftJoin(qb => qb.from('userRating').whereNotNull('userRating.rating').orWhereNotNull('userRating.review').as('userRating'), qb => qb.on('userRating.mediaItemId', 'mediaItem.id').andOnVal('userRating.userId', userId).andOnNull('userRating.episodeId').andOnNull('userRating.seasonId'))
  // Progress
  .leftJoin(qb => qb.from('progress').where('userId', userId).whereNull('episodeId').whereNot('progress', 1).as('progress'), 'progress.mediaItemId', 'mediaItem.id');
  if (Array.isArray(mediaItemIds)) {
    query.whereIn('mediaItem.id', mediaItemIds);
  } else {
    query.where(qb => qb.whereNotNull('listItem.mediaItemId').orWhereNotNull('lastSeen.mediaItemId'));
    if (onlyOnWatchlist) {
      query.whereNotNull('listItem.mediaItemId');
    }
    if (onlySeenItems === true) {
      query.whereNotNull('lastSeen2.mediaItemId');
    }
    if (onlySeenItems === false) {
      query.andWhereNot(qb => qb.where('mediaItem.mediaType', 'tv').andWhere('firstUnwatchedEpisode.tvShowId', null)).andWhere(qb => qb.where('mediaItem.mediaType', 'tv').orWhere('mediaItem.releaseDate', '<=', currentDateString));
    }

    // Media type
    if (mediaType) {
      query.andWhere('mediaItem.mediaType', mediaType);
    }

    // Filter
    if (filter && filter.trim().length > 0) {
      query.andWhere('mediaItem.title', 'LIKE', `%${filter}%`);
    }

    // Next airing
    if (onlyWithNextAiring) {
      if (mediaType) {
        if (mediaType === 'tv') {
          query.andWhere('upcomingEpisode.releaseDate', '>', currentDateString);
        } else {
          query.andWhere('mediaItem.releaseDate', '>', currentDateString);
        }
      } else {
        query.andWhere(qb => qb.where(qb => qb.whereNot('mediaItem.mediaType', 'tv').andWhere('mediaItem.releaseDate', '>', currentDateString)).orWhere(qb => qb.where('mediaItem.mediaType', 'tv').andWhere('upcomingEpisode.releaseDate', '>', currentDateString)));
      }
      query.whereNotNull('listItem.mediaItemId');
    }

    // nextEpisodesToWatchSubQuery
    if (onlyWithNextEpisodesToWatch === true) {
      query.where('seenEpisodesCount', '>', 0).andWhere('unseenEpisodesCount', '>', 0);
    }
    if (onlyWithUserRating === true) {
      query.whereNotNull('userRating.rating');
    }
    if (onlyWithoutUserRating === true) {
      query.whereNull('userRating.rating');
    }
    if (onlyWithProgress) {
      query.where(qb => qb.where(qb => qb.whereNot('mediaItem.mediaType', 'tv').whereNotNull('progress')).orWhere(qb => qb.where('mediaItem.mediaType', 'tv').where('seenEpisodesCount', '>', 0).andWhere('unseenEpisodesCount', '>', 0)));
    }
  }
  if (orderBy && sortOrder) {
    if (sortOrder.toLowerCase() !== 'asc' && sortOrder.toLowerCase() !== 'desc') {
      throw new Error('Sort order should by either asc or desc');
    }
    switch (orderBy) {
      case 'title':
        query.orderBy('mediaItem.title', sortOrder);
        break;
      case 'releaseDate':
        query.orderBy('mediaItem.releaseDate', sortOrder);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'status':
        query.orderBy('mediaItem.status', sortOrder);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'mediaType':
        query.orderBy('mediaItem.mediaType', sortOrder);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'unseenEpisodes':
        query.orderBy('unseenEpisodesCount', sortOrder);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'lastSeen':
        query.orderBy('lastSeenAt', sortOrder);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'nextAiring':
        query.orderByRaw(`CASE
                            WHEN "mediaItem"."mediaType" = 'tv' THEN "upcomingEpisode"."releaseDate"
                            ELSE "mediaItem"."releaseDate"
                          END ${sortOrder} NULLS LAST`);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'lastAiring':
        query.orderByRaw(`CASE
                            WHEN "mediaItem"."mediaType" = 'tv' THEN "lastAiredEpisode"."releaseDate"
                            ELSE CASE
                              WHEN "mediaItem"."releaseDate" >= '${currentDateString}' THEN NULL
                              ELSE "mediaItem"."releaseDate"
                            END
                          END ${sortOrder} NULLS LAST`);
        query.orderBy('mediaItem.title', 'asc');
        break;
      case 'progress':
        query.orderByRaw(`CASE
                            WHEN "mediaItem"."mediaType" = 'tv' THEN "unseenEpisodesCount"
                            ELSE "progress"
                          END ${sortOrder}`);
        query.orderBy('mediaItem.title', 'asc');
        break;
      default:
        throw new Error(`Unsupported orderBy value: ${orderBy}`);
    }
  }
  const sqlCountQuery = query.clone().clearOrder().clearSelect().count('*', {
    as: 'count'
  });
  let sqlPaginationQuery;
  if (page) {
    const itemsPerPage = 40;
    const skip = itemsPerPage * (page - 1);
    const take = itemsPerPage;
    sqlPaginationQuery = query.clone().limit(take).offset(skip);
  }
  return {
    sqlQuery: query,
    sqlCountQuery: sqlCountQuery,
    sqlPaginationQuery: sqlPaginationQuery
  };
};
const generateColumnNames = (prefix, properties) => {
  return properties.reduce((previous, property) => ({
    ...previous,
    [`${prefix}.${property}`]: `${prefix}.${property}`
  }), {});
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.generateColumnNames = generateColumnNames;
const mapRawResult = row => {
  var _row$mediaItemGenres, _row$mediaItemAuthor, _row$mediaItemNarrat;
  return {
    id: row['mediaItem.id'],
    tmdbId: row['mediaItem.tmdbId'],
    tvmazeId: row['mediaItem.tvmazeId'],
    igdbId: row['mediaItem.igdbId'],
    openlibraryId: row['mediaItem.openlibraryId'],
    tvdbId: row['mediaItem.tvdbId'],
    traktId: row['mediaItem.traktId'],
    imdbId: row['mediaItem.imdbId'],
    audibleId: row['mediaItem.audibleId'],
    mediaType: row['mediaItem.mediaType'],
    numberOfSeasons: row['mediaItem.numberOfSeasons'],
    status: row['mediaItem.status'],
    platform: row['mediaItem.platform'] ? JSON.parse(row['mediaItem.platform']) : null,
    title: row['mediaItem.title'],
    originalTitle: row['mediaItem.originalTitle'],
    tmdbRating: row['mediaItem.tmdbRating'],
    runtime: row['mediaItem.runtime'],
    releaseDate: row['mediaItem.releaseDate'],
    overview: row['mediaItem.overview'],
    lastTimeUpdated: row['mediaItem.lastTimeUpdated'],
    source: row['mediaItem.source'],
    network: row['mediaItem.network'],
    language: row['mediaItem.language'],
    genres: (_row$mediaItemGenres = row['mediaItem.genres']) === null || _row$mediaItemGenres === void 0 ? void 0 : _row$mediaItemGenres.split(','),
    authors: (_row$mediaItemAuthor = row['mediaItem.authors']) === null || _row$mediaItemAuthor === void 0 ? void 0 : _row$mediaItemAuthor.split(','),
    narrators: (_row$mediaItemNarrat = row['mediaItem.narrators']) === null || _row$mediaItemNarrat === void 0 ? void 0 : _row$mediaItemNarrat.split(','),
    url: row['mediaItem.url'],
    developer: row['mediaItem.developer'],
    lastSeenAt: row['lastSeenAt'],
    progress: row['progress'],
    poster: row['mediaItem.posterId'] ? `/img/${row['mediaItem.posterId']}` : null,
    posterSmall: row['mediaItem.posterId'] ? `/img/${row['mediaItem.posterId']}?size=small` : null,
    backdrop: row['mediaItem.backdropId'] ? `/img/${row['mediaItem.backdropId']}` : null,
    hasDetails: false,
    seen: row['mediaItem.mediaType'] === 'tv' ? row.numberOfEpisodes > 0 && !row.unseenEpisodesCount : Boolean(row['lastSeen2.mediaItemId']),
    onWatchlist: Boolean(row['listItem.id']),
    unseenEpisodesCount: row.unseenEpisodesCount || 0,
    seenEpisodesCount: row['seenEpisodesCount'],
    numberOfEpisodes: row.numberOfEpisodes,
    nextAiring: row['mediaItem.mediaType'] === 'tv' ? row['upcomingEpisode.releaseDate'] : row['mediaItem.releaseDate'],
    lastAiring: row['mediaItem.mediaType'] === 'tv' ? row['lastAiredEpisode.releaseDate'] : row['mediaItem.releaseDate'],
    userRating: row['userRating.id'] ? {
      id: row['userRating.id'],
      date: row['userRating.date'],
      mediaItemId: row['userRating.mediaItemId'],
      rating: row['userRating.rating'],
      review: row['userRating.review'],
      userId: row['userRating.userId'],
      episodeId: row['userRating.episodeId'],
      seasonId: row['userRating.seasonId']
    } : undefined,
    firstUnwatchedEpisode: row['firstUnwatchedEpisode.id'] ? {
      id: row['firstUnwatchedEpisode.id'],
      title: row['firstUnwatchedEpisode.title'],
      description: row['firstUnwatchedEpisode.description'],
      episodeNumber: row['firstUnwatchedEpisode.episodeNumber'],
      seasonNumber: row['firstUnwatchedEpisode.seasonNumber'],
      releaseDate: row['firstUnwatchedEpisode.releaseDate'],
      tvShowId: row['firstUnwatchedEpisode.tvShowId'],
      tmdbId: row['firstUnwatchedEpisode.tmdbId'],
      imdbId: row['firstUnwatchedEpisode.imdbId'],
      tvdbId: row['firstUnwatchedEpisode.tvdbId'],
      traktId: row['firstUnwatchedEpisode.traktId'],
      runtime: row['firstUnwatchedEpisode.runtime'],
      seasonId: row['firstUnwatchedEpisode.seasonId'],
      isSpecialEpisode: Boolean(row['firstUnwatchedEpisode.isSpecialEpisode']),
      userRating: undefined,
      seenHistory: undefined,
      lastSeenAt: undefined
    } : undefined,
    upcomingEpisode: row['upcomingEpisode.releaseDate'] ? {
      id: row['upcomingEpisode.id'],
      title: row['upcomingEpisode.title'],
      description: row['upcomingEpisode.description'],
      episodeNumber: row['upcomingEpisode.episodeNumber'],
      seasonNumber: row['upcomingEpisode.seasonNumber'],
      releaseDate: row['upcomingEpisode.releaseDate'],
      runtime: row['upcomingEpisode.runtime'],
      tvShowId: row['upcomingEpisode.tvShowId'],
      tmdbId: row['upcomingEpisode.tmdbId'],
      imdbId: row['upcomingEpisode.imdbId'],
      tvdbId: row['upcomingEpisode.tvdbId'],
      traktId: row['upcomingEpisode.traktId'],
      seasonId: row['upcomingEpisode.seasonId'],
      isSpecialEpisode: Boolean(row['upcomingEpisode.isSpecialEpisode']),
      userRating: undefined,
      seenHistory: undefined,
      lastSeenAt: undefined,
      seen: false
    } : undefined,
    lastAiredEpisode: row['lastAiredEpisode.id'] ? {
      id: row['lastAiredEpisode.id'],
      title: row['lastAiredEpisode.title'],
      description: row['lastAiredEpisode.description'],
      episodeNumber: row['lastAiredEpisode.episodeNumber'],
      seasonNumber: row['lastAiredEpisode.seasonNumber'],
      releaseDate: row['lastAiredEpisode.releaseDate'],
      runtime: row['lastAiredEpisode.runtime'],
      tvShowId: row['lastAiredEpisode.tvShowId'],
      tmdbId: row['lastAiredEpisode.tmdbId'],
      imdbId: row['lastAiredEpisode.imdbId'],
      tvdbId: row['lastAiredEpisode.tvdbId'],
      traktId: row['lastAiredEpisode.traktId'],
      seasonId: row['lastAiredEpisode.seasonId'],
      isSpecialEpisode: Boolean(row['lastAiredEpisode.isSpecialEpisode']),
      userRating: undefined,
      seenHistory: undefined,
      lastSeenAt: undefined,
      seen: false
    } : undefined
  };
};
class QueryBuilderHelper {
  static mapFirstUnwatchedEpisode(row) {
    return {
      description: row['mediaItem.firstUnwatchedEpisode.description'],
      episodeNumber: row['mediaItem.firstUnwatchedEpisode.episodeNumber'],
      id: row['mediaItem.firstUnwatchedEpisode.id'],
      imdbId: row['mediaItem.firstUnwatchedEpisode.imdbId'],
      isSpecialEpisode: Boolean(row['mediaItem.firstUnwatchedEpisode.isSpecialEpisode']),
      releaseDate: row['mediaItem.firstUnwatchedEpisode.releaseDate'],
      runtime: row['mediaItem.firstUnwatchedEpisode.runtime'],
      seasonId: row['mediaItem.firstUnwatchedEpisode.seasonId'],
      seasonNumber: row['mediaItem.firstUnwatchedEpisode.seasonNumber'],
      title: row['mediaItem.firstUnwatchedEpisode.title'],
      tmdbId: row['mediaItem.firstUnwatchedEpisode.tmdbId'],
      traktId: row['mediaItem.firstUnwatchedEpisode.traktId'],
      tvdbId: row['mediaItem.firstUnwatchedEpisode.tvdbId'],
      tvShowId: row['mediaItem.firstUnwatchedEpisode.tvShowId']
    };
  }
  static firstUnwatchedEpisode(query, userId, mediaItemId) {
    return query.select({
      'firstUnwatchedEpisode.episodeNumber': 'firstUnwatchedEpisode.episodeNumber',
      'firstUnwatchedEpisode.seasonNumber': 'firstUnwatchedEpisode.seasonNumber',
      'firstUnwatchedEpisode.title': 'firstUnwatchedEpisode.title',
      'firstUnwatchedEpisode.releaseDate': 'firstUnwatchedEpisode.releaseDate',
      'firstUnwatchedEpisode.description': 'firstUnwatchedEpisode.description',
      'firstUnwatchedEpisode.id': 'firstUnwatchedEpisode.id',
      'firstUnwatchedEpisode.imdbId': 'firstUnwatchedEpisode.imdbId',
      'firstUnwatchedEpisode.runtime': 'firstUnwatchedEpisode.runtime',
      'firstUnwatchedEpisode.seasonId': 'firstUnwatchedEpisode.seasonId',
      'firstUnwatchedEpisode.tmdbId': 'firstUnwatchedEpisode.tmdbId',
      'firstUnwatchedEpisode.tvShowId': 'firstUnwatchedEpisode.tvShowId',
      'firstUnwatchedEpisode.isSpecialEpisode': 'firstUnwatchedEpisode.isSpecialEpisode',
      'firstUnwatchedEpisode.traktId': 'firstUnwatchedEpisode.traktId',
      'firstUnwatchedEpisode.tvdbId': 'firstUnwatchedEpisode.tvdbId'
    }).leftJoin(qb => qb.from('episode').select('tvShowId').min('seasonAndEpisodeNumber', {
      as: 'seasonAndEpisodeNumber'
    }).leftJoin(qb => qb.from('seen').where('userId', userId).where('type', 'seen').as('seen'), 'seen.episodeId', 'episode.id').whereNot('episode.isSpecialEpisode', true).whereNot('episode.releaseDate', '').whereNot('episode.releaseDate', null).where('episode.releaseDate', '<=', new Date().toISOString()).whereNull('seen.userId').groupBy('tvShowId').as('firstUnwatchedEpisodeHelper'), 'firstUnwatchedEpisodeHelper.tvShowId', mediaItemId).leftJoin(_dbconfig.Database.knex.ref('episode').as('firstUnwatchedEpisode'), qb => qb.on('firstUnwatchedEpisode.tvShowId', mediaItemId).andOn('firstUnwatchedEpisode.seasonAndEpisodeNumber', 'firstUnwatchedEpisodeHelper.seasonAndEpisodeNumber'));
  }
}
exports.QueryBuilderHelper = QueryBuilderHelper;
//# sourceMappingURL=items.js.map