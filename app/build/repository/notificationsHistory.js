"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.notificationsHistoryRepository = void 0;
var _notificationsHistory = require("../entity/notificationsHistory");
var _repository = require("./repository");
const notificationsHistoryRepository = exports.notificationsHistoryRepository = new ((0, _repository.repository)({
  tableName: 'notificationsHistory',
  columnNames: _notificationsHistory.notificationsHistoryColumns,
  primaryColumnName: 'id'
}))();
//# sourceMappingURL=notificationsHistory.js.map