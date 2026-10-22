"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CancellationToken = void 0;
class CancellationToken {
  _shouldCancel = false;
  async cancel() {
    this._shouldCancel = true;
    return new Promise(resolve => {
      this.resolve = resolve;
    });
  }
  get shouldCancel() {
    return this._shouldCancel;
  }
  complected() {
    this.resolve && this.resolve();
  }
}
exports.CancellationToken = CancellationToken;
//# sourceMappingURL=cancellationToken.js.map