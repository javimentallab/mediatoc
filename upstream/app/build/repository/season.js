"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.tvSeasonRepository = void 0;
var _tvseason = require("../entity/tvseason");
var _repository = require("./repository");
class TvSeasonRepository extends (0, _repository.repository)({
  tableName: 'season',
  columnNames: _tvseason.tvSeasonColumns,
  primaryColumnName: 'id',
  booleanColumnNames: ['isSpecialSeason']
}) {}
const tvSeasonRepository = exports.tvSeasonRepository = new TvSeasonRepository();
//# sourceMappingURL=season.js.map