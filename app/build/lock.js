"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createLock = exports.LockError = void 0;
const createLock = f => {
  let locked = false;
  return async (...args) => {
    if (locked) {
      throw new LockError(`Function ${f.name ? f.name + ' ' : ''}is locked`);
    }
    locked = true;
    try {
      const res = await f(...args);
      locked = false;
      return res;
    } catch (error) {
      locked = false;
      throw error;
    }
  };
};
exports.createLock = createLock;
class LockError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}
exports.LockError = LockError;
//# sourceMappingURL=lock.js.map