"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.sessionRepository = void 0;
var _repository = require("./repository");
const sessionRepository = exports.sessionRepository = new ((0, _repository.repository)({
  tableName: 'session',
  primaryColumnName: 'sid'
}))();
//# sourceMappingURL=session.js.map