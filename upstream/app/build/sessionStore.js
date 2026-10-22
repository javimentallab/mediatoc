"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SessionStore = void 0;
var _expressSession = require("express-session");
var _session = require("./repository/session");
class SessionStore extends _expressSession.Store {
  async destroy(sid, callback) {
    await _session.sessionRepository.delete({
      sid: sid
    });
    callback();
  }
  async get(sid, callback) {
    const session = await _session.sessionRepository.findOne({
      sid: sid
    });
    if (session) {
      callback(null, JSON.parse(session.session));
    } else {
      callback(null, null);
    }
  }
  async set(sid, session, callback) {
    await _session.sessionRepository.updateOrCreate({
      where: {
        sid: sid
      },
      value: {
        sid: sid,
        session: JSON.stringify(session)
      }
    });
    callback(null);
  }
  async all(callback) {
    const sessions = await _session.sessionRepository.find();
    callback(null, sessions.map(session => JSON.parse(session.session)));
  }
  async clear(callback) {
    await _session.sessionRepository.delete();
    callback(null);
  }
  async length(callback) {
    const count = await _session.sessionRepository.count();
    callback(null, count);
  }
}
exports.SessionStore = SessionStore;
//# sourceMappingURL=sessionStore.js.map