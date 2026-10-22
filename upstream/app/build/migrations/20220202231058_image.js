"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
var _core = require("@lingui/core");
var _chalk = _interopRequireDefault(require("chalk"));
var _fsExtra = require("fs-extra");
var _nanoid = require("nanoid");
var _path = _interopRequireDefault(require("path"));
var _config = require("../config");
var _logger = require("../logger");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const nanoid = (0, _nanoid.customAlphabet)('1234567890abcdef', 32);
const moveAsset = (type, itemType, id, posterId) => {
  const posterPath = _path.default.resolve(_config.Config.ASSETS_PATH, type, itemType, 'original', `${id}.webp`);
  if ((0, _fsExtra.existsSync)(posterPath)) {
    (0, _fsExtra.moveSync)(posterPath, _path.default.resolve(_config.Config.ASSETS_PATH, 'original', `${posterId}.webp`));
  }
  const posterSmallPath = _path.default.resolve(_config.Config.ASSETS_PATH, type, itemType, 'small', `${id}.webp`);
  if ((0, _fsExtra.existsSync)(posterSmallPath)) {
    (0, _fsExtra.moveSync)(posterSmallPath, _path.default.resolve(_config.Config.ASSETS_PATH, 'small', `${posterId}.webp`));
  }
};
async function up(knex) {
  await knex.schema.createTable('image', table => {
    table.string('id').unique().primary();
    table.integer('mediaItemId').notNullable().references('id').inTable('mediaItem');
    table.integer('seasonId').references('id').inTable('season');
    table.string('type').notNullable();
    table.index('mediaItemId');
    table.index('seasonId');
    table.index('type');
  });
  const mediaItemsWithPosters = await knex('mediaItem').whereNotNull('poster');
  for (const mediaItem of mediaItemsWithPosters) {
    const posterId = nanoid();
    await knex('image').insert({
      id: posterId,
      mediaItemId: mediaItem.id,
      type: 'poster'
    });
    moveAsset('poster', 'media_item', mediaItem.id, posterId);
  }
  const mediaItemsWithBackdrops = await knex('mediaItem').whereNotNull('backdrop');
  for (const mediaItem of mediaItemsWithBackdrops) {
    const posterId = nanoid();
    await knex('image').insert({
      id: posterId,
      mediaItemId: mediaItem.id,
      type: 'backdrop'
    });
    moveAsset('backdrop', 'media_item', mediaItem.id, posterId);
  }
  const seasonsWithPoster = await knex('season').whereNotNull('poster');
  for (const season of seasonsWithPoster) {
    const posterId = nanoid();
    await knex('image').insert({
      id: posterId,
      mediaItemId: season.tvShowId,
      seasonId: season.id,
      type: 'poster'
    });
    moveAsset('poster', 'season', season.id, posterId);
  }
  try {
    if ((0, _fsExtra.existsSync)(_path.default.resolve(_config.Config.ASSETS_PATH, 'backdrop'))) {
      (0, _fsExtra.rmSync)(_path.default.resolve(_config.Config.ASSETS_PATH, 'backdrop'), {
        recursive: true,
        force: true
      });
    }
    if ((0, _fsExtra.existsSync)(_path.default.resolve(_config.Config.ASSETS_PATH, 'poster'))) {
      (0, _fsExtra.rmSync)(_path.default.resolve(_config.Config.ASSETS_PATH, 'poster'), {
        recursive: true,
        force: true
      });
    }
  } catch (error) {
    _logger.logger.error(_chalk.default.bold.red(/*i18n*/_core.i18n._("Failed to delete unused assets files")));
  }
}
async function down(knex) {
  return knex.schema.dropTable('image');
}
//# sourceMappingURL=20220202231058_image.js.map