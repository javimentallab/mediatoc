"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.updateMetadata = exports.updateMediaItems = exports.updateMediaItem = void 0;
var _core = require("@lingui/core");
var _lodash = _interopRequireDefault(require("lodash"));
var _chalk = _interopRequireDefault(require("chalk"));
var _dateFns = require("date-fns");
var _tvseason = require("./entity/tvseason");
var _metadataProviders = require("./metadata/metadataProviders");
var _mediaItem = require("./repository/mediaItem");
var _utils = require("./utils");
var _notifications = require("./notifications/notifications");
var _user = require("./repository/user");
var _lock = require("./lock");
var _logger = require("./logger");
var _dbconfig = require("./dbconfig");
var _notificationFormatter = require("./notifications/notificationFormatter");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const getItemsToDelete = (oldMediaItem, updatedMediaItem) => {
  var _oldMediaItem$seasons, _updatedMediaItem$sea, _oldMediaItem$seasons2;
  const oldSeasonsMap = _lodash.default.keyBy(oldMediaItem.seasons, season => season.seasonNumber);
  const newSeasonsMap = _lodash.default.keyBy(updatedMediaItem.seasons, season => season.seasonNumber);
  const oldSeasons = (_oldMediaItem$seasons = oldMediaItem.seasons) === null || _oldMediaItem$seasons === void 0 ? void 0 : _oldMediaItem$seasons.map(season => season.seasonNumber);
  const newSeasons = (_updatedMediaItem$sea = updatedMediaItem.seasons) === null || _updatedMediaItem$sea === void 0 ? void 0 : _updatedMediaItem$sea.map(season => season.seasonNumber);
  const seasonNumbersToDelete = _lodash.default.difference(oldSeasons, newSeasons);
  const seasonToDelete = seasonNumbersToDelete.map(seasonNumber => oldSeasonsMap[seasonNumber]);
  const episodesToDelete = (_oldMediaItem$seasons2 = oldMediaItem.seasons) === null || _oldMediaItem$seasons2 === void 0 ? void 0 : _oldMediaItem$seasons2.flatMap(season => {
    var _oldSeasonsMap$season, _season$episodes, _newSeasonsMap$season;
    const episodesMap = _lodash.default.keyBy((_oldSeasonsMap$season = oldSeasonsMap[season.seasonNumber]) === null || _oldSeasonsMap$season === void 0 ? void 0 : _oldSeasonsMap$season.episodes, episode => episode.episodeNumber);
    const oldEpisodes = season === null || season === void 0 || (_season$episodes = season.episodes) === null || _season$episodes === void 0 ? void 0 : _season$episodes.map(episode => episode.episodeNumber);
    const newEpisodes = (_newSeasonsMap$season = newSeasonsMap[season.seasonNumber]) === null || _newSeasonsMap$season === void 0 || (_newSeasonsMap$season = _newSeasonsMap$season.episodes) === null || _newSeasonsMap$season === void 0 ? void 0 : _newSeasonsMap$season.map(episode => episode.episodeNumber);
    const episodesNumbersToDelete = _lodash.default.difference(oldEpisodes, newEpisodes);
    return episodesNumbersToDelete.map(episodeNumber => episodesMap[episodeNumber]);
  });
  return [episodesToDelete, seasonToDelete];
};
const merge = (oldMediaItem, newMediaItem) => {
  var _newMediaItem$seasons;
  const seasonsMap = _lodash.default.keyBy(oldMediaItem.seasons, season => season.seasonNumber);
  const mediaItemId = oldMediaItem.id;
  return {
    ...newMediaItem,
    lastTimeUpdated: new Date().getTime(),
    id: mediaItemId,
    seasons: (_newMediaItem$seasons = newMediaItem.seasons) === null || _newMediaItem$seasons === void 0 ? void 0 : _newMediaItem$seasons.map(season => {
      var _seasonsMap$season$se, _seasonsMap$season$se2, _season$episodes2;
      const seasonId = (_seasonsMap$season$se = seasonsMap[season.seasonNumber]) === null || _seasonsMap$season$se === void 0 ? void 0 : _seasonsMap$season$se.id;
      const episodesMap = _lodash.default.keyBy((_seasonsMap$season$se2 = seasonsMap[season.seasonNumber]) === null || _seasonsMap$season$se2 === void 0 ? void 0 : _seasonsMap$season$se2.episodes, episode => episode.episodeNumber);
      return {
        ...season,
        id: seasonId,
        tvShowId: mediaItemId,
        episodes: (_season$episodes2 = season.episodes) === null || _season$episodes2 === void 0 ? void 0 : _season$episodes2.map(episode => {
          var _episodesMap$episode$;
          return {
            ...episode,
            id: (_episodesMap$episode$ = episodesMap[episode.episodeNumber]) === null || _episodesMap$episode$ === void 0 ? void 0 : _episodesMap$episode$.id,
            tvShowId: mediaItemId,
            seasonId: seasonId
          };
        })
      };
    })
  };
};
const downloadNewAssets = async (oldMediaItem, newMediaItem) => {
  var _newMediaItem$seasons2;
  if (newMediaItem.externalPosterUrl && newMediaItem.externalPosterUrl !== oldMediaItem.externalPosterUrl) {
    await (0, _utils.updateAsset)({
      type: 'poster',
      mediaItem: oldMediaItem
    });
  }
  if (newMediaItem.externalBackdropUrl && newMediaItem.externalBackdropUrl !== oldMediaItem.externalBackdropUrl) {
    await (0, _utils.updateAsset)({
      type: 'backdrop',
      mediaItem: oldMediaItem
    });
  }
  const newSeasonsMap = _lodash.default.keyBy(newMediaItem.seasons, season => season.seasonNumber);
  await Promise.all(((_newMediaItem$seasons2 = newMediaItem.seasons) === null || _newMediaItem$seasons2 === void 0 || (_newMediaItem$seasons2 = _newMediaItem$seasons2.filter(season => season.externalPosterUrl)) === null || _newMediaItem$seasons2 === void 0 ? void 0 : _newMediaItem$seasons2.filter(season => {
    var _newSeasonsMap$season2;
    return season.id && season.externalPosterUrl !== ((_newSeasonsMap$season2 = newSeasonsMap[season.id]) === null || _newSeasonsMap$season2 === void 0 ? void 0 : _newSeasonsMap$season2.externalPosterUrl);
  }).map(season => (0, _utils.updateAsset)({
    type: 'poster',
    season: season
  }))) || []);
};
const sendNotifications = async (oldMediaItem, newMediaItem) => {
  const users = await _user.userRepository.usersWithMediaItemOnWatchlist(oldMediaItem.id);
  const send = async args => {
    await Promise.all(users.filter(args.filter).map(user => _notifications.Notifications.send({
      userId: user.id,
      message: args.message
    })));
  };
  if (newMediaItem.status !== oldMediaItem.status && !(!newMediaItem.status && !oldMediaItem.status)) {
    const status = newMediaItem.status;
    await send({
      message: (0, _notificationFormatter.formatNotification)(f => /*i18n*/_core.i18n._("Status changed for {0}: \"{status}\"", {
        0: f.mediaItemUrl(newMediaItem),
        status: status
      })),
      filter: user => user.sendNotificationWhenStatusChanges
    });
  }
  if (newMediaItem.releaseDate !== oldMediaItem.releaseDate && (0, _dateFns.parseISO)(newMediaItem.releaseDate) > new Date()) {
    const releaseDate = newMediaItem.releaseDate;
    await send({
      message: (0, _notificationFormatter.formatNotification)(f => /*i18n*/_core.i18n._("Release date changed for {0}: \"{releaseDate}\"", {
        0: f.mediaItemUrl(newMediaItem),
        releaseDate: releaseDate
      })),
      filter: user => user.sendNotificationWhenReleaseDateChanges
    });
  }
  if (newMediaItem.mediaType === 'tv' && oldMediaItem.seasons && newMediaItem.seasons) {
    const oldMediaItemNonSpecialSeasons = oldMediaItem.seasons.filter(_tvseason.TvSeasonFilters.nonSpecialSeason).sort(_tvseason.TvSeasonFilters.seasonNumber);
    const newMediaItemNonSpecialSeasons = newMediaItem.seasons.filter(_tvseason.TvSeasonFilters.nonSpecialSeason).sort(_tvseason.TvSeasonFilters.seasonNumber);
    if (newMediaItemNonSpecialSeasons.length < oldMediaItemNonSpecialSeasons.length) {
      const removedSeason = oldMediaItemNonSpecialSeasons[oldMediaItemNonSpecialSeasons.length + newMediaItemNonSpecialSeasons.length - oldMediaItemNonSpecialSeasons.length - 1];
      const seasonNumber = removedSeason.seasonNumber;
      await send({
        message: (0, _notificationFormatter.formatNotification)(f => /*i18n*/_core.i18n._("Season {seasonNumber} of {0} has been canceled", {
          0: f.mediaItemUrl(newMediaItem),
          seasonNumber: seasonNumber
        })),
        filter: user => user.sendNotificationWhenNumberOfSeasonsChanges
      });
    } else if (newMediaItemNonSpecialSeasons.length > oldMediaItemNonSpecialSeasons.length) {
      const newSeason = newMediaItemNonSpecialSeasons[oldMediaItemNonSpecialSeasons.length + newMediaItemNonSpecialSeasons.length - oldMediaItemNonSpecialSeasons.length - 1];
      if (newSeason.releaseDate) {
        if ((0, _dateFns.parseISO)(newSeason.releaseDate) > new Date()) {
          const releaseDate = (0, _dateFns.parseISO)(newSeason.releaseDate).toLocaleDateString();
          await send({
            message: (0, _notificationFormatter.formatNotification)(f => /*i18n*/_core.i18n._("New season of {0} will be released at {releaseDate}", {
              0: f.mediaItemUrl(newMediaItem),
              releaseDate: releaseDate
            })),
            filter: user => user.sendNotificationWhenNumberOfSeasonsChanges
          });
        }
      } else {
        await send({
          message: (0, _notificationFormatter.formatNotification)(f => /*i18n*/_core.i18n._("{0} got a new season", {
            0: f.mediaItemUrl(newMediaItem)
          })),
          filter: user => user.sendNotificationWhenNumberOfSeasonsChanges
        });
      }
    } else if (oldMediaItemNonSpecialSeasons.length > 0) {
      const oldMediaItemLastSeason = oldMediaItemNonSpecialSeasons[oldMediaItemNonSpecialSeasons.length - 1];
      const newMediaItemLastSeason = newMediaItemNonSpecialSeasons[newMediaItemNonSpecialSeasons.length - 1];
      if (oldMediaItemLastSeason.releaseDate !== newMediaItemLastSeason.releaseDate && (0, _dateFns.parseISO)(newMediaItemLastSeason.releaseDate) > new Date()) {
        const seasonNumber = newMediaItemLastSeason.seasonNumber;
        const releaseDate = (0, _dateFns.parseISO)(newMediaItemLastSeason.releaseDate).toLocaleDateString();
        await send({
          message: (0, _notificationFormatter.formatNotification)(f => /*i18n*/_core.i18n._("Season {seasonNumber} of {0} will be released at {releaseDate}", {
            0: f.mediaItemUrl(newMediaItem),
            seasonNumber: seasonNumber,
            releaseDate: releaseDate
          })),
          filter: user => user.sendNotificationWhenNumberOfSeasonsChanges
        });
      }
    }
  }
};
const updateMediaItem = async oldMediaItem => {
  const title = oldMediaItem.title;
  if (oldMediaItem.lastTimeUpdated) {
    const date = _chalk.default.blue(new Date(oldMediaItem.lastTimeUpdated).toLocaleString());
    _logger.logger.info(/*i18n*/_core.i18n._("Updating: {title} (last updated at: {date})", {
      title: title,
      date: date
    }));
  } else {
    _logger.logger.info(/*i18n*/_core.i18n._("Updating: {title}", {
      title: title
    }));
  }
  if (!oldMediaItem) {
    return;
  }
  await _mediaItem.mediaItemRepository.lock(oldMediaItem.id);
  try {
    const metadataProvider = _metadataProviders.metadataProviders.get(oldMediaItem.mediaType, oldMediaItem.source);
    if (!metadataProvider) {
      throw new Error(`No metadata provider "${oldMediaItem.source}" for media type ${oldMediaItem.mediaType}`);
    }
    const newMediaItem = await metadataProvider.details(oldMediaItem);
    if (!newMediaItem) {
      throw new Error('No metadata');
    }
    const updatedMediaItem = newMediaItem.mediaType === 'tv' ? await margeTvShow(oldMediaItem, newMediaItem) : {
      ...newMediaItem,
      lastTimeUpdated: new Date().getTime(),
      id: oldMediaItem.id
    };
    if (updatedMediaItem) {
      await _mediaItem.mediaItemRepository.update(updatedMediaItem);
      await downloadNewAssets(oldMediaItem, updatedMediaItem);
      if (!oldMediaItem.needsDetails) {
        await sendNotifications(oldMediaItem, updatedMediaItem);
      }
      /*mediaocd:wl-recheck-on-metadata*/
      if (updatedMediaItem.mediaType === 'tv') {
        try {
          const _wlReturning = ['Returning Series', 'In Production', 'Planned'];
          if (_wlReturning.indexOf(updatedMediaItem.status) < 0) {
            const _wlKnex = _dbconfig.Database.knex;
            const _wlRows = await _wlKnex('listItem')
              .join('list', 'list.id', 'listItem.listId')
              .where('list.isWatchlist', true)
              .where('listItem.mediaItemId', updatedMediaItem.id)
              .whereNull('listItem.seasonId')
              .whereNull('listItem.episodeId')
              .select('list.userId as userId');
            if (_wlRows.length > 0) {
              const _wlHelper = require('./controllers/seen')._removeFromWatchlistIfComplete;
              if (typeof _wlHelper === 'function') {
                for (const _wlRow of _wlRows) {
                  await _wlHelper(_wlRow.userId, { id: updatedMediaItem.id, mediaType: 'tv' });
                }
              }
            }
          }
        } catch (_) { /* fire-and-forget: nunca romper el refresco */ }
      }
    }
    await _mediaItem.mediaItemRepository.unlock(oldMediaItem.id);
    return updatedMediaItem;
  } catch (error) {
    await _mediaItem.mediaItemRepository.unlock(oldMediaItem.id);
    throw error;
  }
};
exports.updateMediaItem = updateMediaItem;
const shouldUpdate = mediaItem => {
  const timePassed = new Date().getTime() - mediaItem.lastTimeUpdated;
  if (mediaItem.mediaType !== 'tv' && mediaItem.releaseDate && (0, _dateFns.parseISO)(mediaItem.releaseDate) < new Date() && (0, _dateFns.parseISO)(mediaItem.releaseDate) < new Date(mediaItem.lastTimeUpdated)) {
    return timePassed >= (0, _utils.durationToMilliseconds)({
      days: 30
    });
  }
  return timePassed >= (0, _utils.durationToMilliseconds)({
    hours: 24
  });
};
const margeTvShow = async (oldMediaItem, newMediaItem) => {
  const oldMediaItemWithSeason = {
    ...oldMediaItem,
    seasons: await _mediaItem.mediaItemRepository.seasonsWithEpisodes(oldMediaItem)
  };
  const updatedMediaItem = merge(oldMediaItemWithSeason, newMediaItem);
  const [episodesToDelete, seasonsToDelete] = getItemsToDelete(oldMediaItemWithSeason, updatedMediaItem);
  if (episodesToDelete.length > 0) {
    _logger.logger.info(`Local database has episodes not present in the external source. Attempting to remove local episodes: ${episodesToDelete.map(episode => `${episode.seasonNumber}x${episode.episodeNumber} "${episode.title}"`).join(', ')}`);
  }
  if (seasonsToDelete.length > 0) {
    _logger.logger.info(`Local database has seasons not present in the external source. Attempting to remove local seasons: ${seasonsToDelete.map(season => `${season.seasonNumber} "${season.title}"`).join(', ')}`);
  }
  if (episodesToDelete.length > 0 || seasonsToDelete.length > 0) {
    const episodesIdToDelete = [...episodesToDelete.map(episode => episode.id), ...seasonsToDelete.flatMap(season => {
      var _season$episodes3;
      return (_season$episodes3 = season.episodes) === null || _season$episodes3 === void 0 ? void 0 : _season$episodes3.map(episode => episode.id);
    })].filter(Boolean);
    const seasonsIdsToDelete = seasonsToDelete.map(season => season.id);
    if (episodesIdToDelete.length > 0 || seasonsIdsToDelete.length > 0) {
      try {
        await _dbconfig.Database.knex.transaction(async trx => {
          if (episodesIdToDelete.length > 0) {
            const seen = await trx('seen').whereIn('episodeId', episodesIdToDelete);
            if (seen.length > 0) {
              throw `failed to delete local episodes, there are seen entries with those episodes`;
            }
            const progress = await trx('progress').whereIn('episodeId', episodesIdToDelete);
            if (progress.length > 0) {
              throw `failed to delete local episodes, there are progress entries with those episodes`;
            }
            const listItems = await trx('listItem').whereIn('episodeId', episodesIdToDelete);
            if (listItems.length > 0) {
              throw `failed to delete local episodes, there are listItems with those episodes`;
            }
            const userRating = await trx('userRating').whereIn('episodeId', episodesIdToDelete);
            if (userRating.length > 0) {
              throw `failed to delete local episodes, there are userRating with those episodes`;
            }
            await trx('seen').whereIn('episodeId', episodesIdToDelete).delete();
            await trx('progress').whereIn('episodeId', episodesIdToDelete).delete();
            await trx('listItem').whereIn('episodeId', episodesIdToDelete).delete();
            await trx('userRating').whereIn('episodeId', episodesIdToDelete).delete();
            await trx('notificationsHistory').whereIn('episodeId', episodesIdToDelete).delete();
            await trx('episode').whereIn('id', episodesIdToDelete).delete();
          }
          if (seasonsIdsToDelete.length > 0) {
            const listItems = await trx('listItem').whereIn('seasonId', seasonsIdsToDelete);
            if (listItems.length > 0) {
              throw `failed to delete local seasons, there are listItems with those seasons`;
            }
            const userRating = await trx('userRating').whereIn('seasonId', seasonsIdsToDelete);
            if (userRating.length > 0) {
              throw `failed to delete local seasons, there are userRating with those seasons`;
            }
            await trx('listItem').whereIn('seasonId', seasonsIdsToDelete).delete();
            await trx('userRating').whereIn('seasonId', seasonsIdsToDelete).delete();
            await trx('season').whereIn('id', seasonsIdsToDelete).delete();
          }
          return true;
        });
        _logger.logger.info(`deleted local episodes and seasons`);
      } catch (error) { // silence-episode-dupes
        if (!String(error.message || '').includes('UNIQUE constraint failed: episode.tmdbId')) _logger.logger.error(error);
        return {
          ...newMediaItem,
          id: oldMediaItemWithSeason.id,
          lastTimeUpdated: new Date().getTime(),
          seasons: oldMediaItemWithSeason.seasons
        };
      }
    }
  }
  return updatedMediaItem;
};
const updateMediaItems = async args => {
  const {
    mediaItems,
    cancellationToken,
    forceUpdate
  } = args;
  _logger.logger.info(_chalk.default.bold.green(/*i18n*/_core.i18n._("{0, plural, one {Updating metadata for # item} other {Updating metadata for # items}}", {
    0: mediaItems.length
  })));
  let numberOfUpdatedItems = 0;
  let numberOfFailures = 0;
  for (const mediaItem of mediaItems) {
    if (cancellationToken !== null && cancellationToken !== void 0 && cancellationToken.shouldCancel) {
      _logger.logger.info(_chalk.default.bold('Updating metadata canceled'));
      break;
    }
    const skip = forceUpdate ? false : !shouldUpdate(mediaItem);
    if (skip) {
      continue;
    }
    try {
      await updateMediaItem(mediaItem);
      numberOfUpdatedItems++;
    } catch (error) {
      if (!String(error.message || '').includes('UNIQUE constraint failed: episode.tmdbId')) _logger.logger.error(_chalk.default.red(error.toString()));
      numberOfFailures++;
      // rotate-failed-to-back
      try { await require('/app/build/dbconfig').Database.knex('mediaItem').where('id', mediaItem.id).update({ lastTimeUpdated: new Date().getTime() }); } catch (_) {}
    }
  }
  if (numberOfUpdatedItems === 0 && numberOfFailures === 0) {
    _logger.logger.info(_chalk.default.bold.green(/*i18n*/_core.i18n._("Everything up to date")));
  } else {
    const count = numberOfUpdatedItems;
    _logger.logger.info(_chalk.default.bold.green(/*i18n*/_core.i18n._("{count, plural, one {Updated 1 item} other {Updated # items}}", {
      count: count
    })));
    if (numberOfFailures > 0) {
      const count = numberOfFailures;
      _logger.logger.error(_chalk.default.bold.red(/*i18n*/_core.i18n._("{count, plural, one {Failed to update 1 item} other {Failed to update # items}}", {
        count: count
      })));
    }
  }
  cancellationToken === null || cancellationToken === void 0 || cancellationToken.complected();
};
exports.updateMediaItems = updateMediaItems;
const updateMetadata = exports.updateMetadata = (0, _lock.createLock)(async () => {
  await _mediaItem.mediaItemRepository.unlockLockedMediaItems();
  const allItems = await _mediaItem.mediaItemRepository.itemsToPossiblyUpdate(); // throttled-batch
  const mediaItems = allItems.sort((a, b) => (Number(a.lastTimeUpdated) || 0) - (Number(b.lastTimeUpdated) || 0)).slice(0, 10); // rotate-oldest-first
  await updateMediaItems({
    mediaItems: mediaItems
  });
});
//# sourceMappingURL=updateMetadata.js.map