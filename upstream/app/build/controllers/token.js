"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TokenController = void 0;
var _nanoid = require("nanoid");
var _crypto = require("crypto");
var _accessToken = require("../repository/accessToken");
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
const nanoidToken = (0, _nanoid.customRandom)(_nanoid.urlAlphabet, 30, _nanoid.random);

/**
 * @openapi_tags Token
 */
class TokenController {
  /**
   * @description Add token
   * @openapi_operationId add
   */
  add = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      description
    } = req.query;
    if (description.trim().length === 0) {
      res.sendStatus(400);
      return;
    }
    const result = await _accessToken.accessTokenRepository.findOne({
      userId: userId,
      description: description
    });
    if (result) {
      res.sendStatus(400);
      return;
    }
    const token = nanoidToken();
    const tokenHash = (0, _crypto.createHash)('sha256').update(token, 'utf-8').digest('hex');
    await _accessToken.accessTokenRepository.create({
      description: description,
      token: tokenHash,
      userId: userId
    });
    res.send({
      token: token
    });
  });

  /**
   * @description Delete token
   * @openapi_operationId delete
   */
  delete = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      description
    } = req.query;
    await _accessToken.accessTokenRepository.delete({
      description: description,
      userId: userId
    });
    res.send();
  });

  /**
   * @description Get all tokens
   * @openapi_operationId get
   */
  get = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const tokens = await _accessToken.accessTokenRepository.find({
      userId: userId
    });
    res.send(tokens.map(token => token.description));
  });
}
exports.TokenController = TokenController;
//# sourceMappingURL=token.js.map