"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.seenColumns = exports.SeenFilters = void 0;
const seenColumns = exports.seenColumns = ['date', 'id', 'mediaItemId', 'episodeId', 'userId', 'duration'];
class SeenFilters {
  static mediaItemSeenValue = seen => {
    return Boolean(!seen.episodeId);
  };
  static episodeSeenValue = seen => {
    return Boolean(seen.episodeId);
  };
}
exports.SeenFilters = SeenFilters;
//# sourceMappingURL=seen.js.map