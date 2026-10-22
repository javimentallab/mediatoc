"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RequestQueue = void 0;
class RequestQueue {
  queueLength = 0;
  totalTimeToWait = 0;
  lastRequestTime = 0;
  constructor(args) {
    this.timeBetweenRequests = args.timeBetweenRequests;
  }
  async request(request) {
    this.queueLength += 1;
    const placeInQueue = this.queueLength;
    const addedTimeToWait = placeInQueue === 1 ? Math.max(0, this.timeBetweenRequests - (new Date().getTime() - this.lastRequestTime)) : this.timeBetweenRequests;
    this.totalTimeToWait += addedTimeToWait;
    const timeToWait = this.totalTimeToWait;
    if (timeToWait > 0) {
      await new Promise(resolve => setTimeout(resolve, timeToWait));
    }
    this.lastRequestTime = new Date().getTime();
    const result = await request();
    this.queueLength -= 1;
    this.totalTimeToWait -= addedTimeToWait;
    return result;
  }
}
exports.RequestQueue = RequestQueue;
//# sourceMappingURL=requestQueue.js.map