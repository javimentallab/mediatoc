"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.seenRepository = void 0;
var _seen = require("../entity/seen");
var _episode = require("./episode");
var _repository = require("./repository");
var _dbconfig = require("../dbconfig");
class SeenRepository extends (0, _repository.repository)({
  tableName: 'seen',
  columnNames: _seen.seenColumns,
  primaryColumnName: 'id'
}) {
  async deleteForTvSeason(params) {
    const {
      seasonId,
      userId
    } = params;
    await _dbconfig.Database.knex.transaction(async trx => {
      const episodes = await _dbconfig.Database.knex(_episode.tvEpisodeRepository.tableName).where('seasonId', seasonId).transacting(trx);
      await _dbconfig.Database.knex(this.tableName).delete().where({
        userId: userId
      }).whereIn('episodeId', episodes.map(episode => episode.id)).transacting(trx);
    });
  }
}
const seenRepository = exports.seenRepository = new SeenRepository();
//# sourceMappingURL=seen.js.map