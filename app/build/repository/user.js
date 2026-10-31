"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.userRepository = void 0;
var _argon = _interopRequireDefault(require("argon2"));
var _lodash = _interopRequireDefault(require("lodash"));
var _dbconfig = require("../dbconfig");
var _user = require("../entity/user");
var _repository = require("./repository");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class UserRepository extends (0, _repository.repository)({
  tableName: 'user',
  columnNames: _user.userColumns,
  primaryColumnName: 'id',
  booleanColumnNames: ['admin', 'publicReviews', 'sendNotificationForEpisodesReleases', 'sendNotificationForReleases', 'sendNotificationWhenNumberOfSeasonsChanges', 'sendNotificationWhenReleaseDateChanges', 'sendNotificationWhenStatusChanges', 'hideEpisodeTitleForUnseenEpisodes', 'hideOverviewForUnseenSeasons']
}) {
  async find(where) {
    const res = await _dbconfig.Database.knex(this.tableName).where(where).select(_user.userNonSensitiveColumns);
    if (res) {
      return res.map(value => this.deserialize(value));
    }
  }
  async findOne(where) {
    const res = await _dbconfig.Database.knex(this.tableName).where(where).select(_user.userNonSensitiveColumns).first();
    if (res) {
      return this.deserialize(res);
    }
  }
  async findUsersWithMediaItemOnWatchlist(args) {
    const {
      mediaItemId,
      sendNotificationForReleases,
      sendNotificationForEpisodesReleases
    } = args;
    const qb = _dbconfig.Database.knex(this.tableName).innerJoin('list', qb => qb.on('list.userId', 'user.id').onVal('list.isWatchlist', true)).leftJoin('listItem', 'listItem.listId', 'list.id').where('listItem.mediaItemId', mediaItemId).select(_user.userNonSensitiveColumns.map(column => this.tableName + '.' + column));
    if (sendNotificationForReleases) {
      qb.where('sendNotificationForReleases', true);
    }
    if (sendNotificationForEpisodesReleases) {
      qb.where('sendNotificationForEpisodesReleases', true);
    }
    return await qb;
  }
  async usersWithMediaItemOnWatchlist(mediaItemId) {
    return await _dbconfig.Database.knex(this.tableName).innerJoin('list', qb => qb.on('list.userId', 'user.id').onVal('list.isWatchlist', true)).leftJoin('listItem', 'listItem.listId', 'list.id').where('listItem.mediaItemId', mediaItemId).select(_user.userNonSensitiveColumns.map(column => this.tableName + '.' + column));
  }
  async findOneWithPassword(where) {
    return await _dbconfig.Database.knex(this.tableName).where(where).first();
  }
  async create(user) {
    user.password = await _argon.default.hash(user.password);
    const res = await _dbconfig.Database.knex.transaction(async trx => {
      const [res] = await trx('user').insert(_lodash.default.pick(user, this.columnNames), 'id');
      const currentDate = new Date().getTime();
      await trx('list').insert({
        name: 'Watchlist',
        userId: res.id,
        privacy: 'private',
        allowComments: false,
        displayNumbers: false,
        createdAt: currentDate,
        updatedAt: currentDate,
        isWatchlist: true,
        sortBy: 'recently-watched',
        sortOrder: 'desc'
      });
      return res;
    });
    return res.id;
  }
  async update(user) {
    const result = _lodash.default.cloneDeep(user);
    if (result.password) {
      result.password = await _argon.default.hash(result.password);
    }
    return await super.update(result);
  }
  async verifyPassword(user, password) {
    return await _argon.default.verify(user.password, password);
  }
}
const userRepository = exports.userRepository = new UserRepository();
//# sourceMappingURL=user.js.map