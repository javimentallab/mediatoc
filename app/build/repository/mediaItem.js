"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.mediaItemRepository = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _repository = require("./repository");
var _items = require("../knex/queries/items");
var _dbconfig = require("../dbconfig");
var _details = require("../knex/queries/details");
var _tvepisode = require("../entity/tvepisode");
var _season = require("./season");
var _episode = require("./episode");
var _mediaItem = require("../entity/mediaItem");
var _dateFns = require("date-fns");
var _logger = require("../logger");
var _utils = require("../utils");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class MediaItemRepository extends (0, _repository.repository)({
  tableName: 'mediaItem',
  columnNames: _mediaItem.mediaItemColumns,
  primaryColumnName: 'id',
  booleanColumnNames: ['needsDetails', 'downloaded']
}) {
  items(args) {
    return (0, _items.getItemsKnex)(args);
  }
  async details(params) {
    return (0, _details.getDetailsKnex)(params);
  }
  deserialize(value) {
    var _value$genres, _value$narrators, _value$authors;
    return super.deserialize({
      ...value,
      genres: ((_value$genres = value.genres) === null || _value$genres === void 0 ? void 0 : _value$genres.split(',')) || null,
      narrators: ((_value$narrators = value.narrators) === null || _value$narrators === void 0 ? void 0 : _value$narrators.split(',')) || null,
      authors: ((_value$authors = value.authors) === null || _value$authors === void 0 ? void 0 : _value$authors.split(',')) || null,
      platform: value.platform ? JSON.parse(value.platform) : null
    });
  }
  serialize(value) {
    var _value$genres2, _value$authors2, _value$narrators2;
    return super.serialize({
      ...value,
      genres: (_value$genres2 = value.genres) === null || _value$genres2 === void 0 ? void 0 : _value$genres2.join(','),
      authors: (_value$authors2 = value.authors) === null || _value$authors2 === void 0 ? void 0 : _value$authors2.join(','),
      narrators: (_value$narrators2 = value.narrators) === null || _value$narrators2 === void 0 ? void 0 : _value$narrators2.join(','),
      platform: value.platform ? JSON.stringify(value.platform) : null
    });
  }
  async delete(where) {
    const mediaItemId = where.id;
    return await _dbconfig.Database.knex.transaction(async trx => {
      await trx('notificationsHistory').delete().where('mediaItemId', mediaItemId);
      await trx('episode').delete().where('tvShowId', mediaItemId);
      await trx('season').delete().where('tvShowId', mediaItemId);
      return await trx(this.tableName).delete().where('id', mediaItemId);
    });
  }
  async update(mediaItem) {
    if (!mediaItem.id) {
      throw new Error('mediaItem.id filed is required');
    }
    if (!mediaItem.externalPosterUrl) {
      mediaItem.posterId = null;
    }
    if (!mediaItem.externalBackdropUrl) {
      mediaItem.backdropId = null;
    }
    return await _dbconfig.Database.knex.transaction(async trx => {
      if (mediaItem.externalPosterUrl && !mediaItem.posterId) {
        mediaItem.posterId = (0, _utils.getImageId)();
      }
      if (mediaItem.externalBackdropUrl && !mediaItem.backdropId) {
        mediaItem.backdropId = (0, _utils.getImageId)();
      }
      const result = {
        ..._lodash.default.cloneDeep(mediaItem),
        lastTimeUpdated: mediaItem.lastTimeUpdated ? mediaItem.lastTimeUpdated : new Date().getTime()
      };
      await trx(this.tableName).update(this.serialize(this.stripValue(mediaItem))).where({
        id: mediaItem.id
      });
      if (result.seasons) {
        await Promise.all(result.seasons.map(async season => {
          var _season$episodes;
          let updated = false;
          season.numberOfEpisodes = season.numberOfEpisodes || ((_season$episodes = season.episodes) === null || _season$episodes === void 0 ? void 0 : _season$episodes.length) || 0;
          season.tvShowId = mediaItem.id;
          if (!season.externalPosterUrl) {
            season.posterId = null;
          }
          if (season.externalPosterUrl && !season.posterId) {
            season.posterId = (0, _utils.getImageId)();
          }
          const newSeason = (0, _repository.omitUndefinedValues)(_season.tvSeasonRepository.stripValue(_season.tvSeasonRepository.serialize(season)));
          if (season.id) {
            const res = await trx('season').update(newSeason).where({
              id: season.id
            });
            updated = res === 1;
          }
          if (!updated) {
            season.id = (await trx('season').insert(newSeason).returning('id')).at(0).id;
          }
          if (season.episodes) {
            for (const episode of season.episodes) {
              let updated = false;
              episode.seasonAndEpisodeNumber = episode.seasonNumber * 1000 + episode.episodeNumber;
              episode.seasonId = season.id;
              episode.tvShowId = mediaItem.id;
              const newEpisode = (0, _repository.omitUndefinedValues)(_episode.tvEpisodeRepository.stripValue(_episode.tvEpisodeRepository.serialize(episode)));
              if (episode.id) {
                const res = await trx('episode').update(newEpisode).where({
                  id: episode.id
                });
                updated = res === 1;
              }
              if (!updated) {
                episode.id = (await trx('episode').insert(newEpisode).returning('id')).at(0).id;
              }
            }
          }
        }));
      }
      return result;
    });
  }
  async create(mediaItem) {
    if (mediaItem.releaseDate && !(0, _dateFns.isValid)((0, _dateFns.parseISO)(mediaItem.releaseDate))) {
      _logger.logger.error(`Invalid date format for ${mediaItem.id}`);
      mediaItem.releaseDate = undefined;
    }
    if (mediaItem.externalPosterUrl) {
      mediaItem.posterId = (0, _utils.getImageId)();
    }
    if (mediaItem.externalBackdropUrl) {
      mediaItem.backdropId = (0, _utils.getImageId)();
    }
    return await _dbconfig.Database.knex.transaction(async trx => {
      var _result$seasons, _result$seasons2, _result$seasons3;
      const result = {
        ..._lodash.default.cloneDeep(mediaItem),
        lastTimeUpdated: mediaItem.lastTimeUpdated ? mediaItem.lastTimeUpdated : new Date().getTime()
      };
      const res = await trx(this.tableName).insert(this.serialize((0, _repository.omitUndefinedValues)(this.stripValue(mediaItem)))).returning(this.primaryColumnName);
      result.id = res.at(0)[this.primaryColumnName];
      result.seasons = (_result$seasons = result.seasons) === null || _result$seasons === void 0 ? void 0 : _result$seasons.map(season => {
        var _season$episodes2;
        return {
          ...season,
          numberOfEpisodes: season.numberOfEpisodes || ((_season$episodes2 = season.episodes) === null || _season$episodes2 === void 0 ? void 0 : _season$episodes2.length) || 0,
          tvShowId: result.id,
          posterId: season.externalPosterUrl ? (0, _utils.getImageId)() : null
        };
      });
      (_result$seasons2 = result.seasons) === null || _result$seasons2 === void 0 || _result$seasons2.forEach(season => {
        if (season.releaseDate && !(0, _dateFns.isValid)((0, _dateFns.parseISO)(season.releaseDate))) {
          _logger.logger.error(`Invalid date format for season ${season.id}`);
          season.releaseDate = undefined;
        }
      });
      if (((_result$seasons3 = result.seasons) === null || _result$seasons3 === void 0 ? void 0 : _result$seasons3.length) > 0) {
        const seasonsId = await _dbconfig.Database.knex.batchInsert('season', result.seasons.map(season => _lodash.default.omit(season, 'episodes')), 30).transacting(trx).returning('id');
        result.seasons = _lodash.default.merge(result.seasons, seasonsId);
        for (const season of result.seasons) {
          var _season$episodes3;
          if (((_season$episodes3 = season.episodes) === null || _season$episodes3 === void 0 ? void 0 : _season$episodes3.length) > 0) {
            var _season$episodes4, _season$episodes5;
            season.episodes = (_season$episodes4 = season.episodes) === null || _season$episodes4 === void 0 ? void 0 : _season$episodes4.map(episode => ({
              ...episode,
              tvShowId: result.id,
              seasonId: season.id,
              seasonAndEpisodeNumber: episode.seasonNumber * 1000 + episode.episodeNumber
            }));
            (_season$episodes5 = season.episodes) === null || _season$episodes5 === void 0 || _season$episodes5.forEach(episode => {
              if (episode.releaseDate && !(0, _dateFns.isValid)((0, _dateFns.parseISO)(episode.releaseDate))) {
                _logger.logger.error(`Invalid date format for episode ${episode.id}`);
                episode.releaseDate = undefined;
              }
            });
            const episodesId = await _dbconfig.Database.knex.batchInsert('episode', season.episodes, 30).transacting(trx).returning('id');
            season.episodes = _lodash.default.merge(season.episodes, episodesId);
          }
        }
      }
      return result;
    });
  }
  async createMany(mediaItem) {
    return await Promise.all(mediaItem.map(mediaItem => this.create(mediaItem)));
  }
  async seasonsWithEpisodes(mediaItem) {
    const seasons = await _season.tvSeasonRepository.find({
      tvShowId: Number(mediaItem.id)
    });
    const episodes = await _episode.tvEpisodeRepository.find({
      tvShowId: Number(mediaItem.id)
    });
    const groupedEpisodes = _lodash.default.groupBy(episodes, episode => episode.seasonId);
    seasons.forEach(season => season.episodes = groupedEpisodes[season.id]);
    return seasons;
  }
  async findByExternalIds(params) {
    const totalNumberOfIds = externalIdColumnNames.reduce((sum, id) => {
      var _params$id;
      return sum + ((_params$id = params[id]) === null || _params$id === void 0 ? void 0 : _params$id.length);
    }, 0);
    if (totalNumberOfIds < 100) {
      return (await _dbconfig.Database.knex(this.tableName).where({
        mediaType: params.mediaType
      }).andWhere(qb => {
        externalIdColumnNames.forEach(id => {
          var _params$id2;
          if (((_params$id2 = params[id]) === null || _params$id2 === void 0 ? void 0 : _params$id2.length) > 0) {
            qb.orWhereIn(id, params[id]);
          }
        });
      })).map(item => this.deserialize(item));
    }
    const splittedExternalIds = externalIdColumnNames.flatMap(id => params[id] ? _lodash.default.chunk(params[id], 100).map(values => ({
      columnName: id,
      values: values
    })) : undefined).filter(Boolean);
    return (await _dbconfig.Database.knex.transaction(async trx => {
      return _lodash.default.flatten(await Promise.all(splittedExternalIds.map(async item => await trx(this.tableName).where({
        mediaType: params.mediaType
      }).whereIn(item.columnName, item.values))));
    })).map(item => this.deserialize(item));
  }
  async findByExternalId(params, mediaType) {
    const res = await _dbconfig.Database.knex(this.tableName).where({
      mediaType: mediaType
    }).andWhere(qb => {
      if (params.tmdbId) {
        qb.orWhere('tmdbId', params.tmdbId);
      }
      if (params.imdbId) {
        qb.orWhere('imdbId', params.imdbId);
      }
      if (params.tvmazeId) {
        qb.orWhere('tvmazeId', params.tvmazeId);
      }
      if (params.igdbId) {
        qb.orWhere('igdbId', params.igdbId);
      }
      if (params.openlibraryId) {
        qb.orWhere('openlibraryId', params.openlibraryId);
      }
      if (params.audibleId) {
        qb.orWhere('audibleId', params.audibleId);
      }
      if (params.goodreadsId) {
        qb.orWhere('goodreadsId', params.goodreadsId);
      }
      if (params.traktId) {
        qb.orWhere('traktId', params.traktId);
      }
      if (params.tvdbId) {
        qb.orWhere('tvdbId', params.tvdbId);
      }
    }).first();
    if (res) {
      return this.deserialize(res);
    }
  }
  async findByTitle(params) {
    if (typeof params.title !== 'string') {
      return;
    }
    const qb = _dbconfig.Database.knex(this.tableName).select('*', _dbconfig.Database.knex.raw(`LENGTH(title) - ${params.title.length} AS rank`)).where('mediaType', params.mediaType).where(qb => qb.where('title', 'LIKE', `%${params.title}%`).orWhere('originalTitle', 'LIKE', `%${params.title}%`)).orderBy('rank', 'asc');
    if (params.releaseYear) {
      qb.whereBetween('releaseDate', [new Date(params.releaseYear, 0, 1).toISOString(), new Date(params.releaseYear, 11, 31).toISOString()]);
    }
    return this.deserialize(await qb.first());
  }
  async findByExactTitle(params) {
    if (typeof params.title !== 'string') {
      return;
    }
    const qb = _dbconfig.Database.knex(this.tableName).where('mediaType', params.mediaType).where(qb => qb.where('title', 'LIKE', params.title).orWhere('originalTitle', 'LIKE', params.title));
    if (params.releaseYear) {
      qb.whereBetween('releaseDate', [new Date(params.releaseYear, 0, 1).toISOString(), new Date(params.releaseYear, 11, 31).toISOString()]);
    }
    const res = await qb.first();
    if (res) {
      return this.deserialize(res);
    }
  }
  async itemsToPossiblyUpdate() {
    return await _dbconfig.Database.knex('mediaItem').select('mediaItem.*').leftJoin('seen', 'seen.mediaItemId', 'mediaItem.id').leftJoin('listItem', 'listItem.mediaItemId', 'mediaItem.id').leftJoin('userRating', 'userRating.mediaItemId', 'mediaItem.id').where(q => q.whereNotNull('seen.id').orWhereNotNull('listItem.id').orWhereNotNull('userRating.id')).whereNot('source', 'user').whereNot('source', 'goodreads').groupBy('mediaItem.id');
  }
  async itemsToNotify(from, to) {
    const res = await _dbconfig.Database.knex(this.tableName).select('mediaItem.*').select('notificationsHistory.mediaItemId').select('notificationsHistory.id AS notificationsHistory.id').leftJoin('notificationsHistory', 'notificationsHistory.mediaItemId', 'mediaItem.id').where(qb => qb.whereBetween('mediaItem.releaseDate', [from.toISOString(), to.toISOString()]).orWhereBetween('mediaItem.releaseDate', [(0, _dateFns.subMinutes)(from, new Date().getTimezoneOffset()).toISOString(), (0, _dateFns.subMinutes)(to, new Date().getTimezoneOffset()).toISOString()])).whereNot('mediaType', 'tv').whereNull('notificationsHistory.id');
    return (0, _lodash.default)(res).uniqBy('id').filter(item => {
      const releaseDate = (0, _dateFns.parseISO)(item.releaseDate);
      return releaseDate > from && releaseDate < to;
    }).value();
  }
  async episodesToNotify(from, to) {
    const res = await _dbconfig.Database.knex('episode').select((0, _items.generateColumnNames)('episode', _tvepisode.tvEpisodeColumns)).select((0, _items.generateColumnNames)('mediaItem', _mediaItem.mediaItemColumns)).select('notificationsHistory.mediaItemId').select('notificationsHistory.id AS notificationsHistory.id').leftJoin('notificationsHistory', 'notificationsHistory.episodeId', 'episode.id').leftJoin('mediaItem', 'mediaItem.id', 'episode.tvShowId').where(qb => qb.whereBetween('episode.releaseDate', [from.toISOString(), to.toISOString()]).orWhereBetween('episode.releaseDate', [(0, _dateFns.subMinutes)(from, new Date().getTimezoneOffset()).toISOString(), (0, _dateFns.subMinutes)(to, new Date().getTimezoneOffset()).toISOString()])).where('episode.isSpecialEpisode', false).whereNull('notificationsHistory.id');
    return (0, _lodash.default)(res).uniqBy('episode.id').filter(item => {
      const releaseDate = (0, _dateFns.parseISO)(item['episode.releaseDate']);
      return releaseDate > from && releaseDate < to;
    }).map(row => (0, _lodash.default)(row).pickBy((value, column) => column.startsWith('episode.')).mapKeys((value, key) => key.substring('episode.'.length)).set('tvShow', (0, _lodash.default)(row).pickBy((value, column) => column.startsWith('mediaItem.')).mapKeys((value, key) => key.substring('mediaItem.'.length)).value()).value()).value();
  }
  async lock(mediaItemId) {
    const res = await _dbconfig.Database.knex(this.tableName).update({
      lockedAt: new Date().getTime()
    }).where('id', mediaItemId).where('lockedAt', null);
    if (res === 0) {
      throw new Error(`MediaItem ${mediaItemId} is locked`);
    }
  }
  async unlock(mediaItemId) {
    await _dbconfig.Database.knex(this.tableName).update({
      lockedAt: null
    }).where('id', mediaItemId);
  }
  async mergeSearchResultWithExistingItems(searchResult, mediaType) {
    return await Promise.all(searchResult.filter(item => externalIdColumnNames.map(columnName => item[columnName]).filter(Boolean).length > 0).map(async item => {
      return await _dbconfig.Database.knex.transaction(async trx => {
        const existingItem = await trx('mediaItem').where({
          mediaType: mediaType
        }).andWhere(qb => {
          externalIdColumnNames.map(columnName => {
            if (item[columnName]) {
              qb.orWhere(columnName, item[columnName]);
            }
          });
        }).first();
        if (existingItem) {
          return existingItem;
        }
        const [res] = await trx('mediaItem').insert({
          ...this.serialize((0, _repository.omitUndefinedValues)(this.stripValue(item))),
          posterId: item.externalPosterUrl ? (0, _utils.getImageId)() : null,
          backdropId: item.externalBackdropUrl ? (0, _utils.getImageId)() : null,
          lastTimeUpdated: Date.now()
        }).returning('*');
        return res;
      });
    }));
  }
  async unlockLockedMediaItems() {
    return await _dbconfig.Database.knex(this.tableName).update('lockedAt', null).where('lockedAt', '<=', (0, _dateFns.subDays)(new Date(), 1).getTime());
  }
}
const mediaItemRepository = exports.mediaItemRepository = new MediaItemRepository();
const externalIdColumnNames = ['openlibraryId', 'imdbId', 'tmdbId', 'igdbId', 'tvmazeId', 'audibleId', 'traktId', 'goodreadsId', 'tvdbId'];
const groupByExternalId = items => {
  return (0, _lodash.default)(externalIdColumnNames).keyBy().mapValues(externalIdColumnName => (0, _lodash.default)(items).filter(item => Boolean(item[externalIdColumnName])).groupBy(externalIdColumnName).value()).value();
};
//# sourceMappingURL=mediaItem.js.map