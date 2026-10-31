"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LogsController = void 0;
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _auth = require("../auth");
var _getLogs = require("../logger/getLogs");
/**
 * @openapi_tags Logs
 */
class LogsController {
  /**
   * @openapi_operationId get
   */
  add = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(_auth.onlyForAdmin, async (req, res) => {
    const {
      count,
      from,
      error,
      warn,
      http,
      debug,
      info
    } = req.query;
    const logs = await (0, _getLogs.getLogs)({
      levels: {
        error,
        warn,
        http,
        debug,
        info
      },
      count,
      from
    });
    res.send(logs);
  });
}
exports.LogsController = LogsController;
//# sourceMappingURL=logs.js.map