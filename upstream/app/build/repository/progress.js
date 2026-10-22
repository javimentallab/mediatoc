"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.progressRepository = void 0;
var _repository = require("./repository");
var _progress = require("../entity/progress");
class ProgressRepository extends (0, _repository.repository)({
  tableName: 'progress',
  columnNames: _progress.progressColumns,
  primaryColumnName: 'id'
}) {}
const progressRepository = exports.progressRepository = new ProgressRepository();
//# sourceMappingURL=progress.js.map