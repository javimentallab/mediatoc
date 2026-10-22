"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.errorLoggerMiddleware = void 0;
var _logger = require("../logger");
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
const errorLoggerMiddleware = (err, req, res, next) => {
  if (err instanceof _typescriptRoutesToOpenapiServer.ValidationError) {
    _logger.logger.error({
      message: `ValidationError`,
      error: err.message,
      body: req.body,
      method: req.method,
      url: req.url,
      type: 'validationError'
    });
    res.status(400).send(String(err));
  } else {
    _logger.logger.error({
      message: err.message,
      stack: err.stack
    });
    res.status(500).send(String(err));
  }
};
exports.errorLoggerMiddleware = errorLoggerMiddleware;
//# sourceMappingURL=errorLoggerMiddleware.js.map