// mediaocd: download-asset-ua
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.updateAsset = exports.inArray = exports.getImageId = exports.generateExternalUrl = exports.durationToMilliseconds = exports.downloadAsset = exports.catchAndLogError = void 0;
var _axios = _interopRequireDefault(require("axios"));
var _dateFns = require("date-fns");
var _fsExtra = require("fs-extra");
var _nanoid = require("nanoid");
var _path = _interopRequireDefault(require("path"));
var _sharp = _interopRequireDefault(require("sharp"));
var _config = require("./config");
var _dbconfig = require("./dbconfig");
var _logger = require("./logger");
var _audible = require("./metadata/provider/audible");
var _globalSettings = require("./repository/globalSettings");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const durationToMilliseconds = duration => (0, _dateFns.add)(0, duration).getTime();
exports.durationToMilliseconds = durationToMilliseconds;
const downloadAsset = async args => {
  const {
    imageId,
    url
  } = args;
  _logger.logger.debug(`downloading image ${imageId} from ${url}`);
  const imagePath = _path.default.resolve(_config.Config.ASSETS_PATH, 'original', `${imageId}.webp`);
  const imageSmallPath = _path.default.resolve(_config.Config.ASSETS_PATH, 'small', `${imageId}.webp`);
  const response = await _axios.default.get(url, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'MediaOCD/1.0 (+https://github.com/javimentallab/mediaocd; image-fetch)',
      'Accept': 'image/webp,image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5'
    },
    timeout: 30000,
    maxRedirects: 5
  });
  await (0, _fsExtra.ensureDir)(_path.default.dirname(imagePath));
  await (0, _sharp.default)(response.data).resize({
    width: 800
  }).webp({
    quality: 80
  }).toFile(imagePath);
  await (0, _fsExtra.ensureDir)(_path.default.dirname(imageSmallPath));
  await (0, _sharp.default)(response.data).resize({
    width: 400
  }).webp({
    quality: 80
  }).toFile(imageSmallPath);
};
exports.downloadAsset = downloadAsset;
const updateAsset = async args => {
  const {
    mediaItem,
    season,
    type
  } = args;
  const oldPosterId = season ? type === 'poster' && season.posterId : type === 'poster' && mediaItem && !season ? mediaItem.posterId : type === 'backdrop' && mediaItem && !season ? mediaItem.backdropId : undefined;
  const newImageId = getImageId();
  if (type === 'poster' && season) {
    await _dbconfig.Database.knex('season').update('posterId', newImageId).where('id', season.id);
  } else if (type === 'poster' && mediaItem && !season) {
    await _dbconfig.Database.knex('mediaItem').update('posterId', newImageId).where('id', mediaItem.id);
  } else if (type === 'backdrop' && mediaItem && !season) {
    await _dbconfig.Database.knex('mediaItem').update('backdropId', newImageId).where('id', mediaItem.id);
  }
  if (oldPosterId) {
    const imagePath = `/img/original/${oldPosterId}`;
    if (await (0, _fsExtra.pathExists)(imagePath)) {
      await (0, _fsExtra.rm)(imagePath);
    }
    const smallImagePath = `/img/small/${oldPosterId}`;
    if (await (0, _fsExtra.pathExists)(smallImagePath)) {
      await (0, _fsExtra.rm)(smallImagePath);
    }
  }
};
exports.updateAsset = updateAsset;
const catchAndLogError = async fn => {
  try {
    await fn();
  } catch (error) {
    _logger.logger.error(error);
  }
};
exports.catchAndLogError = catchAndLogError;
const inArray = (value, values) => {
  return values.includes(value);
};
exports.inArray = inArray;
const generateExternalUrl = mediaItem => {
  if (mediaItem.mediaType === 'tv' || mediaItem.mediaType === 'movie') {
    if (mediaItem.imdbId) {
      return `https://www.imdb.com/title/${mediaItem.imdbId}`;
    }
    if (mediaItem.tmdbId) {
      return `https://www.themoviedb.org/${mediaItem.mediaType}/${mediaItem.tmdbId}`;
    }
  }
  if (mediaItem.mediaType === 'video_game') {
    if (mediaItem.igdbId) {
      return `https://www.igdb.com/games/${mediaItem.title.toLowerCase().replaceAll(' ', '-')}`;
    }
  }
  if (mediaItem.mediaType === 'book') {
    if (mediaItem.openlibraryId) {
      return `https://openlibrary.org${mediaItem.openlibraryId}`;
    }
  }
  if (mediaItem.mediaType === 'audiobook') {
    if (mediaItem.audibleId) {
      var _GlobalConfiguration$;
      const audibleDomain = new _audible.Audible().domain(mediaItem.audibleCountryCode || ((_GlobalConfiguration$ = _globalSettings.GlobalConfiguration.configuration.audibleLang) === null || _GlobalConfiguration$ === void 0 ? void 0 : _GlobalConfiguration$.toLocaleLowerCase()));
      return `https://audible.${audibleDomain}/pd/${mediaItem.audibleId}?overrideBaseCountry=true&ipRedirectOverride=true`;
    }
  }
};
exports.generateExternalUrl = generateExternalUrl;
const getImageId = exports.getImageId = (0, _nanoid.customAlphabet)('1234567890abcdef', 32);
//# sourceMappingURL=utils.js.map