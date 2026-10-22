"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TMDbTv = exports.TMDbMovie = void 0;
var _urlJoin = _interopRequireDefault(require("url-join"));
var _path = _interopRequireDefault(require("path"));
var _axios = _interopRequireDefault(require("axios"));
var _metadataProvider = require("../metadataProvider");
var _globalSettings = require("../../repository/globalSettings");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const TMDB_API_KEY = '779734046efc1e6127485c54d3b29627';
const getPosterUrl = (p, size = 'original') => {
  return (0, _urlJoin.default)('https://image.tmdb.org/t/p/', size, _path.default.basename(p));
};
class TMDb extends _metadataProvider.MetadataProvider {
  name = 'tmdb';
  mapItem(response) {
    var _response$genres;
    return {
      source: this.name,
      mediaType: this.mediaType,
      title: null,
      externalBackdropUrl: response.backdrop_path ? getPosterUrl(response.backdrop_path) : null,
      externalPosterUrl: response.poster_path ? getPosterUrl(response.poster_path) : null,
      tmdbId: response.id,
      overview: response.overview || null,
      status: response.status || null,
      url: response.homepage || null,
      genres: (_response$genres = response.genres) === null || _response$genres === void 0 ? void 0 : _response$genres.reduce((generes, genre) => [...generes, genre.name], [])
    };
  }
}
class TMDbMovie extends TMDb {
  mediaType = 'movie';
  async search(query) {
    const res = await _axios.default.get('https://api.themoviedb.org/3/search/movie', {
      params: {
        api_key: TMDB_API_KEY,
        query: query,
        language: _globalSettings.GlobalConfiguration.configuration.tmdbLang
      }
    });
    return res.data.results.map(item => ({
      ...this.mapMovie(item),
      needsDetails: true
    }));
  }
  async details(mediaItem) {
    const res = await _axios.default.get(`https://api.themoviedb.org/3/movie/${mediaItem.tmdbId}`, {
      params: {
        api_key: TMDB_API_KEY,
        language: _globalSettings.GlobalConfiguration.configuration.tmdbLang
      }
    });
    const movie = this.mapMovie(res.data);
    movie.needsDetails = false;
    return movie;
  }
  async findByImdbId(imdbId) {
    var _res$data$movie_resul;
    const res = await _axios.default.get(`https://api.themoviedb.org/3/find/${imdbId}`, {
      params: {
        api_key: TMDB_API_KEY,
        external_source: 'imdb_id',
        language: _globalSettings.GlobalConfiguration.configuration.tmdbLang
      }
    });
    if (((_res$data$movie_resul = res.data.movie_results) === null || _res$data$movie_resul === void 0 ? void 0 : _res$data$movie_resul.length) === 0) {
      return;
    }
    return {
      ...this.mapMovie(res.data.movie_results[0]),
      imdbId: imdbId,
      needsDetails: true
    };
  }
  async findByTmdbId(tmdbId) {
    return this.details({
      tmdbId: tmdbId
    });
  }
  mapMovie(item) {
    const movie = this.mapItem(item);
    movie.imdbId = item.imdb_id || undefined;
    movie.originalTitle = item.original_title;
    movie.releaseDate = item.release_date || null;
    movie.title = item.title;
    movie.runtime = item.runtime;
    movie.tmdbRating = item.vote_average;
    return movie;
  }
}
exports.TMDbMovie = TMDbMovie;
class TMDbTv extends TMDb {
  mediaType = 'tv';
  async search(query) {
    const res = await _axios.default.get('https://api.themoviedb.org/3/search/tv', {
      params: {
        api_key: TMDB_API_KEY,
        query: query,
        language: _globalSettings.GlobalConfiguration.configuration.tmdbLang
      }
    });
    return res.data.results.map(item => ({
      ...this.mapTvShow(item),
      needsDetails: true
    }));
  }
  async details(mediaItem) {
    var _tvShow$seasons;
    const res = await _axios.default.get(`https://api.themoviedb.org/3/tv/${mediaItem.tmdbId}`, {
      params: {
        api_key: TMDB_API_KEY,
        append_to_response: 'external_ids',
        language: _globalSettings.GlobalConfiguration.configuration.tmdbLang
      }
    });
    const tvShow = this.mapTvShow(res.data);
    await Promise.all((_tvShow$seasons = tvShow.seasons) === null || _tvShow$seasons === void 0 ? void 0 : _tvShow$seasons.map(async season => {
      var _res$data$external_id, _res$data$episodes;
      const res = await _axios.default.get(`https://api.themoviedb.org/3/tv/${mediaItem.tmdbId}/season/${season.seasonNumber}`, {
        params: {
          api_key: TMDB_API_KEY,
          append_to_response: 'external_ids',
          language: _globalSettings.GlobalConfiguration.configuration.tmdbLang
        }
      });
      season.tvdbId = (_res$data$external_id = res.data.external_ids) === null || _res$data$external_id === void 0 ? void 0 : _res$data$external_id.tvdb_id;
      season.episodes = ((_res$data$episodes = res.data.episodes) === null || _res$data$episodes === void 0 ? void 0 : _res$data$episodes.map(item => this.mapEpisode(item))) || [];
      return season;
    }));
    tvShow.needsDetails = false;
    return tvShow;
  }
  async findByImdbId(imdbId) {
    var _res$data$tv_results;
    const res = await _axios.default.get(`https://api.themoviedb.org/3/find/${imdbId}`, {
      params: {
        api_key: TMDB_API_KEY,
        external_source: 'imdb_id',
        language: _globalSettings.GlobalConfiguration.configuration.tmdbLang
      }
    });
    if (((_res$data$tv_results = res.data.tv_results) === null || _res$data$tv_results === void 0 ? void 0 : _res$data$tv_results.length) === 0) {
      return;
    }
    return {
      ...this.mapTvShow(res.data.tv_results[0]),
      imdbId: imdbId,
      needsDetails: true
    };
  }
  async findByTvdbId(tvdbId) {
    var _res$data$tv_results2;
    const res = await _axios.default.get(`https://api.themoviedb.org/3/find/${tvdbId}`, {
      params: {
        api_key: TMDB_API_KEY,
        external_source: 'tvdb_id',
        language: _globalSettings.GlobalConfiguration.configuration.tmdbLang
      }
    });
    if (((_res$data$tv_results2 = res.data.tv_results) === null || _res$data$tv_results2 === void 0 ? void 0 : _res$data$tv_results2.length) === 0) {
      return;
    }
    return {
      ...this.mapTvShow(res.data.tv_results[0]),
      tvdbId: tvdbId,
      needsDetails: true
    };
  }
  async findByTmdbId(tmdbId) {
    return this.details({
      tmdbId: tmdbId
    });
  }
  async findByEpisodeImdbId(episodeImdbId) {
    var _res$data$tv_episode_;
    const res = await _axios.default.get(`https://api.themoviedb.org/3/find/${episodeImdbId}`, {
      params: {
        api_key: TMDB_API_KEY,
        external_source: 'imdb_id',
        language: _globalSettings.GlobalConfiguration.configuration.tmdbLang
      }
    });
    if (((_res$data$tv_episode_ = res.data.tv_episode_results) === null || _res$data$tv_episode_ === void 0 ? void 0 : _res$data$tv_episode_.length) === 0) {
      return;
    }
    const episode = this.mapEpisode(res.data.tv_episode_results[0]);
    return {
      tvShowTmdbId: res.data.tv_episode_results[0].show_id,
      episode: episode
    };
  }
  async findByEpisodeTvdbId(episodeTvdbId) {
    var _res$data$tv_episode_2;
    const res = await _axios.default.get(`https://api.themoviedb.org/3/find/${episodeTvdbId}`, {
      params: {
        api_key: TMDB_API_KEY,
        external_source: 'tvdb_id',
        language: _globalSettings.GlobalConfiguration.configuration.tmdbLang
      }
    });
    if (((_res$data$tv_episode_2 = res.data.tv_episode_results) === null || _res$data$tv_episode_2 === void 0 ? void 0 : _res$data$tv_episode_2.length) === 0) {
      return;
    }
    const episode = this.mapEpisode(res.data.tv_episode_results[0]);
    return {
      tvShowTmdbId: res.data.tv_episode_results[0].show_id,
      episode: episode
    };
  }
  mapTvShow(item) {
    var _item$external_ids, _item$external_ids2, _item$networks, _item$episode_run_tim, _item$seasons;
    const tvShow = this.mapItem(item);
    tvShow.imdbId = ((_item$external_ids = item.external_ids) === null || _item$external_ids === void 0 ? void 0 : _item$external_ids.imdb_id) || undefined;
    tvShow.tvdbId = ((_item$external_ids2 = item.external_ids) === null || _item$external_ids2 === void 0 ? void 0 : _item$external_ids2.tvdb_id) || undefined;
    tvShow.title = item.name;
    tvShow.originalTitle = item.original_name;
    tvShow.releaseDate = item.first_air_date || null;
    tvShow.numberOfSeasons = item.number_of_seasons;
    tvShow.tmdbRating = item.vote_average;
    tvShow.network = ((_item$networks = item.networks) === null || _item$networks === void 0 ? void 0 : _item$networks.length) > 0 ? item.networks[0].name : undefined;
    tvShow.runtime = ((_item$episode_run_tim = item.episode_run_time) === null || _item$episode_run_tim === void 0 ? void 0 : _item$episode_run_tim.length) > 0 ? item.episode_run_time[0] : undefined;
    tvShow.seasons = (_item$seasons = item.seasons) === null || _item$seasons === void 0 ? void 0 : _item$seasons.map(item => {
      return {
        tmdbId: item.id,
        title: item.name,
        description: item.overview || null,
        externalPosterUrl: item.poster_path ? getPosterUrl(item.poster_path) : null,
        seasonNumber: item.season_number,
        numberOfEpisodes: item.episode_count,
        releaseDate: item.air_date || null,
        isSpecialSeason: item.season_number === 0
      };
    });
    return tvShow;
  }
  mapEpisode(item) {
    return {
      title: item.name,
      description: item.overview || null,
      episodeNumber: item.episode_number,
      seasonNumber: item.season_number,
      releaseDate: item.air_date || null,
      isSpecialEpisode: item.season_number === 0,
      tmdbId: item.id
    };
  }
}
exports.TMDbTv = TMDbTv;
//# sourceMappingURL=tmdb.js.map