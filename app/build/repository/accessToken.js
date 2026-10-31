"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.accessTokenRepository = void 0;
var _repository = require("./repository");
const accessTokenRepository = exports.accessTokenRepository = new ((0, _repository.repository)({
  tableName: 'accessToken',
  primaryColumnName: 'id'
}))();
//# sourceMappingURL=accessToken.js.map