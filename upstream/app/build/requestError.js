"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toRequestErrorObject = void 0;
const toRequestErrorObject = message => {
  return {
    errorMessage: message,
    MediaTrackerError: true
  };
};
exports.toRequestErrorObject = toRequestErrorObject;
//# sourceMappingURL=requestError.js.map