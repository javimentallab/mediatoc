"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.tvEpisodeRepository = void 0;
var _tvepisode = require("../entity/tvepisode");
var _repository = require("./repository");
class EpisodeRepository extends (0, _repository.repository)({
  tableName: 'episode',
  columnNames: _tvepisode.tvEpisodeColumns,
  primaryColumnName: 'id',
  booleanColumnNames: ['isSpecialEpisode']
}) {
  async create(value) {
    return await super.create({
      ...value,
      seasonAndEpisodeNumber: value.seasonNumber * 1000 + value.episodeNumber
    });
  }
  async createMany(values) {
    return await super.createMany(values.map(value => ({
      ...value,
      seasonAndEpisodeNumber: value.seasonNumber * 1000 + value.episodeNumber
    })));
  }
}
const tvEpisodeRepository = exports.tvEpisodeRepository = new EpisodeRepository();
//# sourceMappingURL=episode.js.map