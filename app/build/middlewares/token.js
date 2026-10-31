"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AccessTokenMiddleware = void 0;
var _crypto = require("crypto");
var _accessToken = require("../repository/accessToken");
class AccessTokenMiddleware {
  static async authorize(req, res, next) {
    let token;

    // Check for token in Authorization header
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    }

    // If not found in Authorization header, check Access-Token header
    if (!token) {
      token = req.header('Access-Token');
    }

    // If still not found, check query parameter
    if (!token && typeof req.query.token === 'string') {
      token = req.query.token;
    }
    if (!token) {
      next();
      return;
    }
    const hashedToken = (0, _crypto.createHash)('sha256').update(token, 'utf-8').digest('hex');
    const accessToken = await _accessToken.accessTokenRepository.findOne({
      token: hashedToken
    });
    if (!accessToken) {
      next();
      return;
    }
    req.user = accessToken.userId;
    next();
  }
}
exports.AccessTokenMiddleware = AccessTokenMiddleware;
//# sourceMappingURL=token.js.map