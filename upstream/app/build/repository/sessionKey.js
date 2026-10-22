"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.sessionKeyRepository = void 0;
var _repository = require("./repository");
const sessionKeyRepository = exports.sessionKeyRepository = new ((0, _repository.repository)({
  tableName: 'sessionKey',
  primaryColumnName: 'id'
}))();
//# sourceMappingURL=sessionKey.js.map