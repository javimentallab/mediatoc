"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TraktTvImportController = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _trakttv = require("../../export/trakttv");
var _findByExternalId = require("../../metadata/findByExternalId");
var _list = require("../../repository/list");
var _listItemRepository = require("../../repository/listItemRepository");
var _mediaItem = require("../../repository/mediaItem");
var _seen = require("../../repository/seen");
var _userRating = require("../../repository/userRating");
var _updateMetadata = require("../../updateMetadata");
var _utils = require("../../utils");
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * @openapi_tags TraktTvImport
 */
class TraktTvImportController {
  importState = new Map();
  updateState(args) {
    const currentState = this.importState.get(args.userId);
    const newState = {
      state: args.state,
      progress: args.progress,
      error: args.error,
      exportSummary: args.exportSummary || currentState.exportSummary,
      importSummary: args.importSummary || currentState.importSummary,
      notImportedItems: args.notImportedItems || currentState.notImportedItems,
      deviceCode: args.deviceCode || currentState.deviceCode
    };
    this.importState.set(args.userId, {
      ...newState,
      clients: currentState.clients
    });
    currentState.clients.forEach(client => {
      client.write(`data: ${JSON.stringify(newState)}\n\n`);
    });
  }
  addClient(args) {
    const currentState = this.importState.get(args.userId);
    if (!currentState) {
      throw new Error(`No import state for userId ${args.userId}`);
    }
    this.importState.set(args.userId, {
      ...currentState,
      clients: [...currentState.clients, args.client]
    });
  }
  initState(args) {
    this.importState.set(args.userId, {
      state: 'uninitialized',
      clients: []
    });
  }

  /**
   * @openapi_operationId state
   */
  state = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    if (!this.importState.has(userId)) {
      this.initState({
        userId
      });
    }
    const importState = this.importState.get(userId);
    res.send({
      state: importState.state,
      progress: importState.progress,
      exportSummary: importState.exportSummary,
      importSummary: importState.importSummary,
      notImportedItems: importState.notImportedItems,
      error: importState.error
    });
  });

  /**
   * @openapi_operationId state-stream
   */
  stateStream = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    if (!this.importState.has(userId)) {
      this.initState({
        userId
      });
    }
    const importState = this.importState.get(userId);
    const state = {
      state: importState.state,
      progress: importState.progress,
      exportSummary: importState.exportSummary,
      importSummary: importState.importSummary,
      notImportedItems: importState.notImportedItems,
      error: importState.error
    };
    if (req.accepts('text/event-stream')) {
      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream'
      });
      res.write(`data: ${JSON.stringify(state)}\n\n`);
      this.addClient({
        userId: userId,
        client: res
      });
    } else {
      res.send(state);
    }
  });

  /**
   * @openapi_operationId deviceToken
   */
  getUserCode = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    var _importState$deviceCo;
    const userId = Number(req.user);
    if (!this.importState.has(userId)) {
      this.initState({
        userId: userId
      });
    }
    const importState = this.importState.get(userId);
    if (importState.state === 'uninitialized' || ((_importState$deviceCo = importState.deviceCode) === null || _importState$deviceCo === void 0 ? void 0 : _importState$deviceCo.expiresAt) <= new Date() && !importState.exportSummary) {
      const traktTvImport = new _trakttv.TraktTvExport();
      const deviceCode = await traktTvImport.authenticate(async userCode => {
        try {
          var _this$importState$get;
          if (userCode !== ((_this$importState$get = this.importState.get(userId)) === null || _this$importState$get === void 0 || (_this$importState$get = _this$importState$get.deviceCode) === null || _this$importState$get === void 0 ? void 0 : _this$importState$get.userCode)) {
            return;
          }
          this.updateState({
            userId: userId,
            state: 'exporting'
          });
          const exportedData = await traktTvImport.export();
          this.updateState({
            userId: userId,
            state: 'updating-metadata',
            exportSummary: getExportedSummery(exportedData),
            progress: undefined
          });
          const {
            movieMetadata,
            tvShowMetadata
          } = await updateMetadataForTraktTvImport(exportedData, progress => {
            this.updateState({
              userId: userId,
              state: 'updating-metadata',
              progress: progress
            });
          });
          this.updateState({
            userId: userId,
            state: 'importing',
            notImportedItems: getNotImportedItems(exportedData, movieMetadata, tvShowMetadata),
            progress: 0
          });
          const incrementImportingStep = () => {
            let step = 0;
            const numberOfSteps = 8;
            return () => {
              step++;
              this.updateState({
                userId: userId,
                state: 'importing',
                progress: step / numberOfSteps
              });
            };
          };
          const watchlistMovies = exportedData.watchlist.filter(traktTvMovieFilter).map(movieMetadata).filter(Boolean).map(({
            mediaItem
          }) => ({
            mediaItemId: mediaItem.id
          }));
          const watchlistTvShows = exportedData.watchlist.filter(traktTvShowFilter).map(tvShowMetadata).filter(Boolean).map(({
            mediaItem
          }) => ({
            mediaItemId: mediaItem.id
          }));
          const watchlistSeasons = exportedData.watchlist.filter(traktTvSeasonFilter).map(tvShowMetadata).filter(Boolean).map(withSeason).filter(Boolean).map(({
            mediaItem,
            season
          }) => ({
            mediaItemId: mediaItem.id,
            seasonId: season.id
          }));
          const watchlistEpisodes = exportedData.watchlist.filter(traktTvEpisodeFilter).map(tvShowMetadata).filter(Boolean).map(withEpisode).filter(Boolean).map(({
            mediaItem,
            episode
          }) => ({
            mediaItemId: mediaItem.id,
            episodeId: episode.id
          }));
          const seenMovies = exportedData.history.filter(traktTvMovieFilter).map(movieMetadata).filter(Boolean).map(({
            mediaItem,
            item
          }) => ({
            userId: userId,
            mediaItemId: mediaItem.id,
            date: new Date(item.watched_at).getTime()
          }));
          const seenEpisodes = exportedData.history.filter(traktTvEpisodeFilter).map(tvShowMetadata).filter(Boolean).map(withEpisode).filter(Boolean).map(({
            mediaItem,
            item,
            episode
          }) => ({
            userId: userId,
            mediaItemId: mediaItem.id,
            date: new Date(item.watched_at).getTime(),
            episodeId: episode.id
          })).filter(Boolean);
          const ratedMovies = exportedData.rating.filter(traktTvMovieFilter).map(movieMetadata).filter(Boolean).map(({
            mediaItem,
            item
          }) => ({
            userId: userId,
            mediaItemId: mediaItem.id,
            rating: item.rating / 2,
            date: new Date(item.rated_at).getTime()
          }));
          const ratedTvShows = exportedData.rating.filter(item => item.show && !item.season && !item.episode).map(tvShowMetadata).filter(Boolean).map(({
            mediaItem,
            item
          }) => ({
            userId: userId,
            mediaItemId: mediaItem.id,
            rating: item.rating / 2,
            date: new Date(item.rated_at).getTime()
          }));
          const ratedSeasons = exportedData.rating.filter(traktTvSeasonFilter).map(tvShowMetadata).filter(Boolean).map(withSeason).filter(Boolean).map(({
            mediaItem,
            item,
            season
          }) => ({
            userId: userId,
            mediaItemId: mediaItem.id,
            rating: item.rating / 2,
            date: new Date(item.rated_at).getTime(),
            seasonId: season.id
          })).filter(Boolean);
          const ratedEpisodes = exportedData.rating.filter(traktTvEpisodeFilter).map(tvShowMetadata).filter(Boolean).map(withEpisode).filter(Boolean).map(({
            mediaItem,
            item,
            episode
          }) => ({
            userId: userId,
            mediaItemId: mediaItem.id,
            rating: item.rating / 2,
            date: new Date(item.rated_at).getTime(),
            episodeId: episode.id
          })).filter(Boolean);
          for (const item of [...watchlistMovies, ...watchlistTvShows, ...watchlistSeasons, ...watchlistEpisodes]) {
            await _listItemRepository.listItemRepository.addItem({
              userId: userId,
              watchlist: true,
              mediaItemId: item.mediaItemId,
              seasonId: item.seasonId || undefined,
              episodeId: item.episodeId || undefined
            });
          }
          const lists = exportedData.lists.map(traktList => {
            const listItems = exportedData.listsItems.get(traktList.ids.slug) || [];
            return {
              name: traktList.name,
              traktId: traktList.ids.trakt,
              traktSlug: traktList.ids.slug,
              description: traktList.description,
              privacy: traktList.privacy,
              sortBy: traktList.sort_by,
              sortOrder: traktList.sort_how,
              movies: listItems.filter(traktTvMovieFilter).map(movieMetadata).filter(Boolean).map(({
                mediaItem
              }) => ({
                mediaItemId: mediaItem.id
              })),
              shows: listItems.filter(traktTvShowFilter).map(tvShowMetadata).filter(Boolean).map(({
                mediaItem
              }) => ({
                mediaItemId: mediaItem.id
              })),
              seasons: listItems.filter(traktTvSeasonFilter).map(tvShowMetadata).filter(Boolean).map(withSeason).filter(Boolean).map(({
                mediaItem,
                season
              }) => ({
                mediaItemId: mediaItem.id,
                seasonId: season.id
              })),
              episodes: listItems.filter(traktTvEpisodeFilter).map(tvShowMetadata).filter(Boolean).map(withEpisode).filter(Boolean).map(({
                mediaItem,
                episode
              }) => ({
                mediaItemId: mediaItem.id,
                episodeId: episode.id
              }))
            };
          });
          incrementImportingStep();
          for (const list of lists) {
            const localListName = `TraktTv-${list.name}`;
            const localList = (await _list.listRepository.findOne({
              traktId: list.traktId
            })) || (await _list.listRepository.findOne({
              name: localListName
            })) || (await _list.listRepository.create({
              name: localListName,
              traktId: list.traktId,
              userId: userId,
              description: list.description,
              privacy: list.privacy,
              sortBy: list.sortBy,
              sortOrder: list.sortOrder
            }));
            await _listItemRepository.listItemRepository.addManyItems({
              listId: localList.id,
              userId: userId,
              listItems: [...list.movies, ...list.shows, ...list.seasons, ...list.episodes]
            });
          }
          const uniqBy = seen => {
            return {
              userId: seen.userId,
              mediaItemId: seen.mediaItemId,
              episodeId: seen.episodeId || null,
              date: seen.date || null
            };
          };
          incrementImportingStep();
          await _seen.seenRepository.createManyUnique(seenMovies, uniqBy, {
            userId: userId
          });
          incrementImportingStep();
          await _seen.seenRepository.createManyUnique(seenEpisodes, uniqBy, {
            userId: userId
          });
          incrementImportingStep();
          await _userRating.userRatingRepository.createMany(ratedMovies);
          incrementImportingStep();
          await _userRating.userRatingRepository.createMany(ratedTvShows);
          incrementImportingStep();
          await _userRating.userRatingRepository.createMany(ratedSeasons);
          incrementImportingStep();
          await _userRating.userRatingRepository.createMany(ratedEpisodes);
          this.updateState({
            userId: userId,
            state: 'imported',
            importSummary: {
              watchlist: {
                movies: watchlistMovies.length,
                shows: watchlistTvShows.length,
                seasons: watchlistSeasons.length,
                episodes: watchlistEpisodes.length
              },
              seen: {
                movies: seenMovies.length,
                episodes: seenEpisodes.length
              },
              ratings: {
                movies: ratedMovies.length,
                shows: ratedTvShows.length,
                seasons: ratedSeasons.length,
                episodes: ratedEpisodes.length
              },
              lists: lists.map(list => ({
                listName: list.name,
                listId: list.traktSlug,
                movies: list.movies.length,
                shows: list.shows.length,
                seasons: list.seasons.length,
                episodes: list.episodes.length
              }))
            }
          });
        } catch (error) {
          this.updateState({
            userId: userId,
            state: 'error',
            error: String(error)
          });
        }
      });
      this.updateState({
        userId: userId,
        state: 'waiting-for-authentication',
        deviceCode: deviceCode
      });
      res.send({
        userCode: deviceCode.userCode,
        verificationUrl: deviceCode.verificationUrl
      });
    } else {
      res.send({
        userCode: importState.deviceCode.userCode,
        verificationUrl: importState.deviceCode.verificationUrl
      });
    }
  });

  /**
   * @openapi_operationId startOver
   */
  startOver = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const importState = this.importState.get(userId);
    if (importState) {
      if ((0, _utils.inArray)(importState.state, ['exporting', 'importing', 'updating-metadata', 'uninitialized'])) {
        res.sendStatus(400);
        return;
      }
      this.importState.set(userId, {
        state: 'uninitialized',
        clients: importState.clients
      });
    }
    res.send();
  });
}
exports.TraktTvImportController = TraktTvImportController;
const findEpisodeOrSeason = args => {
  var _mediaItem$seasons, _season$episodes;
  const {
    mediaItem,
    seasonNumber,
    episodeNumber
  } = args;
  const season = mediaItem === null || mediaItem === void 0 || (_mediaItem$seasons = mediaItem.seasons) === null || _mediaItem$seasons === void 0 ? void 0 : _mediaItem$seasons.find(season => season.seasonNumber === seasonNumber);
  const episode = episodeNumber ? season === null || season === void 0 || (_season$episodes = season.episodes) === null || _season$episodes === void 0 ? void 0 : _season$episodes.find(episode => episode.episodeNumber === episodeNumber) : undefined;
  return {
    season: season,
    episode: episode
  };
};
const getMediaItemsByTmdbIds = async (ids, mediaType) => {
  const existingItems = await _mediaItem.mediaItemRepository.findByExternalIds({
    tmdbId: ids.map(item => item.tmdb).filter(Boolean),
    imdbId: ids.map(item => item.imdb).filter(Boolean),
    tvdbId: ids.map(item => item.tvdb).filter(Boolean),
    traktId: ids.map(item => item.trakt).filter(Boolean),
    mediaType: mediaType
  });
  const existingItemsMapByTmdbId = _lodash.default.keyBy(existingItems, mediaItem => mediaItem.tmdbId);
  const missingItems = (0, _lodash.default)(ids).filter(item => !existingItemsMapByTmdbId[item.tmdb]).uniqBy(item => item.trakt).value();
  await Promise.all(existingItems.filter(item => item.mediaType === 'tv').map(async item => {
    item.seasons = await _mediaItem.mediaItemRepository.seasonsWithEpisodes(item);
  }).map(errorHandler));
  return {
    existingItems: existingItems,
    missingItems: missingItems
  };
};
const errorHandler = async promise => {
  try {
    return await promise;
  } catch (error) {
    return null;
  }
};
const updateMetadataForTraktTvImport = async (exportedData, onProgress) => {
  const listItems = _lodash.default.flatten(Array.from(exportedData.listsItems.values()));
  const movies = await getMediaItemsByTmdbIds(_lodash.default.uniq([...exportedData.watchlist, ...exportedData.history, ...exportedData.rating, ...listItems].filter(item => item.type === 'movie').map(item => item.movie.ids)), 'movie');
  const tvShows = await getMediaItemsByTmdbIds(_lodash.default.uniq([...exportedData.watchlist, ...exportedData.history, ...exportedData.rating, ...listItems].filter(item => item.type === 'show' || item.type === 'season' || item.type === 'episode').map(item => item.show.ids)), 'tv');
  const tvShowsToUpdate = tvShows.existingItems.filter(item => item.needsDetails);
  const total = movies.missingItems.length + tvShows.missingItems.length + tvShowsToUpdate.length;
  let currentItem = 0;
  const updateProgress = () => {
    currentItem++;
    onProgress(currentItem / total);
  };
  const foundMovies = new Array();
  for (const item of movies.missingItems) {
    try {
      foundMovies.push(await (0, _findByExternalId.findMediaItemByExternalIdInExternalSources)({
        id: {
          traktId: item.trakt,
          imdbId: item.imdb,
          tmdbId: item.tmdb,
          tvdbId: item.tvdb
        },
        mediaType: 'movie'
      }));
      updateProgress();
    } catch (error) {
      //
    }
  }
  const foundTvShows = new Array();
  for (const item of tvShows.missingItems) {
    try {
      foundTvShows.push(await (0, _findByExternalId.findMediaItemByExternalIdInExternalSources)({
        id: {
          traktId: item.trakt,
          imdbId: item.imdb,
          tmdbId: item.tmdb,
          tvdbId: item.tvdb
        },
        mediaType: 'tv'
      }));
      updateProgress();
    } catch (error) {
      //
    }
  }
  const updatedTvShows = new Array();
  for (const mediaItem of tvShowsToUpdate) {
    try {
      updatedTvShows.push(await (0, _updateMetadata.updateMediaItem)(mediaItem));
      updateProgress();
    } catch (error) {
      //
    }
  }
  const mediaItemsMap = _lodash.default.keyBy([...movies.existingItems, ...foundMovies.filter(Boolean), ..._lodash.default.uniqBy([...updatedTvShows, ...tvShows.existingItems], item => item.id), ...foundTvShows.filter(Boolean)], mediaItem => mediaItem.tmdbId);
  return createMetadataFunctions(mediaItemsMap);
};
const withEpisode = ({
  mediaItem,
  item
}) => {
  var _item$episode, _item$episode2;
  const res = findEpisodeOrSeason({
    mediaItem: mediaItem,
    seasonNumber: (_item$episode = item.episode) === null || _item$episode === void 0 ? void 0 : _item$episode.season,
    episodeNumber: (_item$episode2 = item.episode) === null || _item$episode2 === void 0 ? void 0 : _item$episode2.number
  });
  if (!(res !== null && res !== void 0 && res.episode)) {
    return;
  }
  return {
    mediaItem,
    item,
    episode: res.episode
  };
};
const withSeason = ({
  mediaItem,
  item
}) => {
  var _item$season;
  const res = findEpisodeOrSeason({
    mediaItem: mediaItem,
    seasonNumber: (_item$season = item.season) === null || _item$season === void 0 ? void 0 : _item$season.number
  });
  if (!(res !== null && res !== void 0 && res.season)) {
    return;
  }
  return {
    mediaItem,
    item,
    season: res.season
  };
};
const traktTvMovieFilter = item => item.movie;
const traktTvShowFilter = item => item.show && !item.season && !item.episode;
const traktTvSeasonFilter = item => item.show && item.season && !item.episode;
const traktTvEpisodeFilter = item => item.show && !item.season && item.episode;
const getExportedSummery = exportedData => {
  return {
    watchlist: {
      movies: exportedData.watchlist.filter(traktTvMovieFilter).length,
      shows: exportedData.watchlist.filter(traktTvShowFilter).length,
      seasons: exportedData.watchlist.filter(traktTvSeasonFilter).length,
      episodes: exportedData.watchlist.filter(traktTvEpisodeFilter).length
    },
    seen: {
      movies: exportedData.history.filter(traktTvMovieFilter).length,
      episodes: exportedData.history.filter(traktTvEpisodeFilter).length
    },
    ratings: {
      movies: exportedData.rating.filter(traktTvMovieFilter).length,
      shows: exportedData.rating.filter(item => item.show && !item.season && !item.episode).length,
      seasons: exportedData.rating.filter(traktTvSeasonFilter).length,
      episodes: exportedData.rating.filter(traktTvEpisodeFilter).length
    },
    lists: exportedData.lists.map(list => {
      var _listItems$filter, _listItems$filter2, _listItems$filter3, _listItems$filter4;
      const listItems = exportedData.listsItems.get(list.ids.slug);
      return {
        listName: list.name,
        listId: list.ids.slug,
        movies: (listItems === null || listItems === void 0 || (_listItems$filter = listItems.filter(traktTvMovieFilter)) === null || _listItems$filter === void 0 ? void 0 : _listItems$filter.length) || 0,
        shows: (listItems === null || listItems === void 0 || (_listItems$filter2 = listItems.filter(traktTvShowFilter)) === null || _listItems$filter2 === void 0 ? void 0 : _listItems$filter2.length) || 0,
        seasons: (listItems === null || listItems === void 0 || (_listItems$filter3 = listItems.filter(traktTvSeasonFilter)) === null || _listItems$filter3 === void 0 ? void 0 : _listItems$filter3.length) || 0,
        episodes: (listItems === null || listItems === void 0 || (_listItems$filter4 = listItems.filter(traktTvEpisodeFilter)) === null || _listItems$filter4 === void 0 ? void 0 : _listItems$filter4.length) || 0
      };
    })
  };
};
const createMetadataFunctions = mediaItemsMap => {
  const movieMetadata = item => {
    var _item$movie;
    const res = mediaItemsMap[(_item$movie = item.movie) === null || _item$movie === void 0 || (_item$movie = _item$movie.ids) === null || _item$movie === void 0 ? void 0 : _item$movie.tmdb];
    if (res) {
      return {
        mediaItem: res,
        item
      };
    }
  };
  const tvShowMetadata = item => {
    var _item$show;
    const res = mediaItemsMap[(_item$show = item.show) === null || _item$show === void 0 || (_item$show = _item$show.ids) === null || _item$show === void 0 ? void 0 : _item$show.tmdb];
    if (res) {
      return {
        mediaItem: res,
        item
      };
    }
  };
  return {
    movieMetadata,
    tvShowMetadata
  };
};
const getNotImportedItems = (exportedData, movieMetadata, tvShowMetadata) => {
  const not = f => {
    return args => !f(args);
  };
  const filterSeasonsWithoutMetadata = item => {
    if (!traktTvSeasonFilter(item)) {
      return false;
    }
    const show = tvShowMetadata(item);
    if (!show) {
      return true;
    }
    return !withSeason(show);
  };
  const filterEpisodesWithoutMetadata = item => {
    if (!traktTvEpisodeFilter(item)) {
      return false;
    }
    const show = tvShowMetadata(item);
    if (!show) {
      return true;
    }
    return !withEpisode(show);
  };
  const mapMovie = item => ({
    title: item.movie.title,
    year: item.movie.year,
    traktTvLink: `https://trakt.tv/movies/${item.movie.ids.slug}`
  });
  const mapTvShow = item => ({
    title: item.show.title,
    year: item.show.year,
    traktTvLink: `https://trakt.tv/shows/${item.show.ids.slug}`
  });
  const mapSeason = item => {
    var _item$season2;
    return {
      show: {
        title: item.show.title,
        year: item.show.year
      },
      season: {
        seasonNumber: (_item$season2 = item.season) === null || _item$season2 === void 0 ? void 0 : _item$season2.number
      },
      traktTvLink: `https://trakt.tv/shows/${item.show.ids.slug}/seasons/${item.season.number}`
    };
  };
  const mapEpisode = item => {
    return {
      show: {
        title: item.show.title,
        year: item.show.year
      },
      episode: {
        episodeNumber: item.episode.number,
        seasonNumber: item.episode.season
      },
      traktTvLink: `https://trakt.tv/shows/${item.show.ids.slug}/seasons/${item.episode.season}/episodes/${item.episode.number}`
    };
  };
  return {
    watchlist: {
      movies: exportedData.watchlist.filter(traktTvMovieFilter).filter(not(movieMetadata)).map(mapMovie),
      shows: exportedData.watchlist.filter(traktTvShowFilter).filter(not(tvShowMetadata)).map(mapTvShow),
      seasons: exportedData.watchlist.filter(filterSeasonsWithoutMetadata).map(mapSeason),
      episodes: exportedData.watchlist.filter(filterEpisodesWithoutMetadata).map(mapEpisode)
    },
    seen: {
      movies: exportedData.history.filter(traktTvMovieFilter).filter(not(movieMetadata)).map(mapMovie),
      episodes: exportedData.history.filter(filterEpisodesWithoutMetadata).map(mapEpisode)
    },
    ratings: {
      movies: exportedData.rating.filter(traktTvMovieFilter).filter(not(movieMetadata)).map(mapMovie),
      shows: exportedData.rating.filter(item => item.show && !item.season && !item.episode).filter(not(tvShowMetadata)).map(mapTvShow),
      seasons: exportedData.rating.filter(filterSeasonsWithoutMetadata).map(mapSeason),
      episodes: exportedData.rating.filter(filterEpisodesWithoutMetadata).map(mapEpisode)
    },
    lists: exportedData.lists.map(list => {
      var _listItems$filter5, _listItems$filter6, _listItems$filter7, _listItems$filter8;
      const listItems = exportedData.listsItems.get(list.ids.slug);
      return {
        listName: list.name,
        listId: list.ids.slug,
        movies: listItems === null || listItems === void 0 || (_listItems$filter5 = listItems.filter(traktTvMovieFilter)) === null || _listItems$filter5 === void 0 ? void 0 : _listItems$filter5.filter(not(movieMetadata)).map(mapMovie),
        shows: listItems === null || listItems === void 0 || (_listItems$filter6 = listItems.filter(traktTvShowFilter)) === null || _listItems$filter6 === void 0 ? void 0 : _listItems$filter6.filter(not(tvShowMetadata)).map(mapTvShow),
        seasons: listItems === null || listItems === void 0 || (_listItems$filter7 = listItems.filter(filterSeasonsWithoutMetadata)) === null || _listItems$filter7 === void 0 ? void 0 : _listItems$filter7.map(mapSeason),
        episodes: listItems === null || listItems === void 0 || (_listItems$filter8 = listItems.filter(filterEpisodesWithoutMetadata)) === null || _listItems$filter8 === void 0 ? void 0 : _listItems$filter8.map(mapEpisode)
      };
    }).filter(list => {
      var _list$movies, _list$shows, _list$seasons, _list$episodes;
      return ((_list$movies = list.movies) === null || _list$movies === void 0 ? void 0 : _list$movies.length) > 0 || ((_list$shows = list.shows) === null || _list$shows === void 0 ? void 0 : _list$shows.length) > 0 || ((_list$seasons = list.seasons) === null || _list$seasons === void 0 ? void 0 : _list$seasons.length) > 0 || ((_list$episodes = list.episodes) === null || _list$episodes === void 0 ? void 0 : _list$episodes.length) > 0;
    })
  };
};
//# sourceMappingURL=traktTv.js.map