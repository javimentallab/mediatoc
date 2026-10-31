"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.configMigrationLogs = exports.Config = void 0;
var _path = require("path");
var _os = require("os");
var _fsExtra = require("fs-extra");
var _package = require("../package.json");
var _configuration = require("./entity/configuration");
var _process$env$SERVER_L, _process$env$TMDB_LAN, _process$env$AUDIBLE_;
/**
 * Logger depends on LOGS_PATH, it cannot be used here.
 */
const logs = [];
const configMigrationLogs = () => logs;
exports.configMigrationLogs = configMigrationLogs;
class Config {
  static version = '1.1.3';
  static configDirectory = (0, _path.join)((0, _os.homedir)(), '.mediaocd');
  static MIGRATIONS_DIRECTORY = (0, _path.resolve)(__dirname, 'migrations');
  static NODE_ENV = process.env.NODE_ENV;
  static PUBLIC_PATH = (0, _path.join)(__dirname, '../public');
  static ASSETS_PATH = process.env.ASSETS_PATH || (0, _path.join)(this.configDirectory, 'img');
  static LOGS_PATH = process.env.LOGS_PATH || (0, _path.join)(this.configDirectory, 'logs');
  static DATABASE_PATH = process.env.DATABASE_PATH || (0, _path.join)(this.configDirectory, 'data.db');
  static DATABASE_CLIENT = process.env.DATABASE_CLIENT || 'better-sqlite3';
  static DATABASE_URL = process.env.DATABASE_URL;
  static DATABASE_VERSION = process.env.DATABASE_VERSION;
  static DATABASE_HOST = process.env.DATABASE_HOST;
  static DATABASE_PORT = Number(process.env.DATABASE_PORT) || undefined;
  static DATABASE_USER = process.env.DATABASE_USER;
  static DATABASE_PASSWORD = process.env.DATABASE_PASSWORD;
  static DATABASE_DATABASE = process.env.DATABASE_DATABASE;
  static DATABASE_SSL = process.env.DATABASE_SSL ? Boolean(process.env.DATABASE_SSL) : undefined;
  static MIGRATIONS_EXTENSION = this.NODE_ENV === 'development' || this.NODE_ENV === 'test' ? 'ts' : 'js';
  static DEMO = process.env.DEMO ? Boolean(process.env.DEMO) : false;
  static IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
  static IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
  static HOSTNAME = process.env.HOSTNAME || '127.0.0.1';
  static PORT = Number(process.env.PORT) || 7481;
  static SERVER_LANG = (_process$env$SERVER_L = process.env.SERVER_LANG) === null || _process$env$SERVER_L === void 0 ? void 0 : _process$env$SERVER_L.toLowerCase();
  static TMDB_LANG = (_process$env$TMDB_LAN = process.env.TMDB_LANG) === null || _process$env$TMDB_LAN === void 0 ? void 0 : _process$env$TMDB_LAN.toLowerCase();
  static AUDIBLE_LANG = (_process$env$AUDIBLE_ = process.env.AUDIBLE_LANG) === null || _process$env$AUDIBLE_ === void 0 ? void 0 : _process$env$AUDIBLE_.toLowerCase();
  static validate() {
    if (this.SERVER_LANG && !_configuration.serverLang.includes(this.SERVER_LANG)) {
      throw new Error(`SERVER_LANG should be one of: ${_configuration.serverLang}, received: ${this.SERVER_LANG}`);
    }
    if (this.TMDB_LANG && !_configuration.tmdbLang.includes(this.TMDB_LANG)) {
      throw new Error(`TMDB_LANG should be one of: ${_configuration.tmdbLang}, received: ${this.TMDB_LANG}`);
    }
    if (this.AUDIBLE_LANG && !_configuration.audibleLang.includes(this.AUDIBLE_LANG)) {
      throw new Error(`AUDIBLE_LANG should be one of: ${_configuration.audibleLang}, received: ${this.AUDIBLE_LANG}`);
    }
  }
  static migrate() {
    if (!(0, _fsExtra.existsSync)(this.configDirectory)) {
      logs.push(`Creating config directory at ${this.configDirectory.toString()}`);
      (0, _fsExtra.ensureDirSync)(this.configDirectory);
      migratePath({
        key: 'ASSETS_PATH',
        type: 'directory',
        oldPath: (0, _path.resolve)('img'),
        newPath: this.ASSETS_PATH
      });
      migratePath({
        key: 'LOGS_PATH',
        type: 'directory',
        oldPath: (0, _path.resolve)('logs'),
        newPath: this.LOGS_PATH
      });
      migratePath({
        key: 'DATABASE_PATH',
        type: 'file',
        oldPath: (0, _path.resolve)('data.db'),
        newPath: this.DATABASE_PATH
      });
    }
  }
}
exports.Config = Config;
const migratePath = args => {
  const {
    key,
    oldPath,
    newPath,
    type
  } = args;
  if (process.env[key]) {
    return;
  }
  if (!process.env.LOGS_PATH && (0, _fsExtra.existsSync)(oldPath) && (type === 'file' ? (0, _fsExtra.statSync)(oldPath).isFile() : (0, _fsExtra.statSync)(oldPath).isDirectory()) && !(0, _fsExtra.existsSync)(newPath)) {
    logs.push(`Moving ${type} from ${oldPath} to ${newPath}`);
    (0, _fsExtra.moveSync)(oldPath, newPath);
  }
  return newPath;
};
//# sourceMappingURL=config.js.map