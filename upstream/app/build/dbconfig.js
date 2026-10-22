"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Database = void 0;
var _core = require("@lingui/core");
var _knex = _interopRequireDefault(require("knex"));
var _config = require("./config");
var _logger = require("./logger");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class Database {
  static #knex;
  static init() {
    this.#knex = (0, _knex.default)({
      client: _config.Config.DATABASE_CLIENT,
      version: _config.Config.DATABASE_VERSION,
      connection: {
        connectionString: _config.Config.DATABASE_URL,
        host: _config.Config.DATABASE_HOST,
        port: _config.Config.DATABASE_PORT,
        user: _config.Config.DATABASE_USER,
        password: _config.Config.DATABASE_PASSWORD,
        database: _config.Config.DATABASE_DATABASE,
        ssl: _config.Config.DATABASE_SSL ? {
          rejectUnauthorized: false
        } : undefined,
        filename: _config.Config.DATABASE_PATH
      },
      useNullAsDefault: true,
      migrations: {
        extension: _config.Config.MIGRATIONS_EXTENSION
      }
    });
  }
  static async runMigrations(verbose = true) {
    const [batchNo, log] = await Database.knex.migrate.latest({
      directory: _config.Config.MIGRATIONS_DIRECTORY
    });
    if (log.length > 0) {
      const name = batchNo;
      const count = log.length;
      if (verbose) {
        _logger.logger.info(/*i18n*/_core.i18n._("Running migrations"));
        _logger.logger.info(/*i18n*/_core.i18n._("Batch {name} run: {count, plural, one {# migration} other {# migrations}}", {
          name: name,
          count: count
        }));
        log.map(value => _logger.logger.info(value));
      }
    }
  }
  static get knex() {
    return this.#knex;
  }
}
exports.Database = Database;
//# sourceMappingURL=dbconfig.js.map