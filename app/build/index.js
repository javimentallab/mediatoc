#!/usr/bin/env node
/* eslint-disable node/shebang */
"use strict";

var _core = require("@lingui/core");
require("source-map-support/register");
var _chalk = _interopRequireDefault(require("chalk"));
var _globalSettings = require("./repository/globalSettings");
var _updateMetadata = require("./updateMetadata");
var _mediaItem = require("./repository/mediaItem");
var _cancellationToken = require("./cancellationToken");
var _logger = require("./logger");
var _server = require("./server");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
let updateMetadataCancellationToken;
_globalSettings.GlobalConfiguration.subscribe('tmdbLang', async (value, previousValue) => {
  if (!previousValue) {
    return;
  }
  _logger.logger.info(_chalk.default.bold.green(/*i18n*/_core.i18n._("TMDB language changed to: \"{value}\", updating metadata for all items", {
    value: value
  })));
  if (updateMetadataCancellationToken) {
    await updateMetadataCancellationToken.cancel();
  }
  updateMetadataCancellationToken = new _cancellationToken.CancellationToken();
  const mediaItems = await _mediaItem.mediaItemRepository.find({
    source: 'tmdb'
  });
  await (0, _updateMetadata.updateMediaItems)({
    mediaItems: mediaItems,
    cancellationToken: updateMetadataCancellationToken,
    forceUpdate: true
  });
});
(0, _server.createAndStartServer)();
//# sourceMappingURL=index.js.map