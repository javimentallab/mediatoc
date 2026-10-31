"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.configurationRepository = exports.GlobalConfiguration = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _dbconfig = require("../dbconfig");
var _logger = require("../logger");
var _repository = require("./repository");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class ConfigurationRepository extends (0, _repository.repository)({
  tableName: 'configuration',
  primaryColumnName: 'id',
  booleanColumnNames: ['enableRegistration']
}) {
  async update(value) {
    GlobalConfiguration.update(value);
    return await _dbconfig.Database.knex.transaction(async trx => {
      const currentConfigEntry = await trx('configuration').first();
      const currentConfig = JSON.parse(currentConfigEntry.configurationJson);
      const res = _lodash.default.merge(currentConfig, value);
      await trx('configuration').update('configurationJson', res);
      return res;
    });
  }
  async get() {
    const configEntry = await _dbconfig.Database.knex('configuration').first();
    if (!configEntry || !configEntry.configurationJson) {
      return;
    }
    return JSON.parse(configEntry.configurationJson);
  }
  async create(value) {
    await _dbconfig.Database.knex.transaction(async trx => {
      await trx('configuration').delete();
      await trx('configuration').insert({
        configurationJson: JSON.stringify(value)
      });
    });
  }
}
const configurationRepository = exports.configurationRepository = new ConfigurationRepository();
class GlobalConfiguration {
  static _configuration = {
    enableRegistration: true
  };
  static listeners = [];
  static update(value) {
    const previousConfiguration = _lodash.default.cloneDeep(this._configuration);
    this._configuration = {
      ...this._configuration,
      ...value
    };
    value && this.listeners.forEach(async ({
      key,
      handler
    }) => {
      if (key in value && value[key] !== previousConfiguration[key]) {
        try {
          await handler(value[key], previousConfiguration[key]);
        } catch (error) {
          _logger.logger.error(error);
        }
      }
    });
  }
  static get() {
    return this._configuration;
  }
  static get configuration() {
    return this._configuration;
  }
  static set configuration(value) {
    this._configuration = value;
  }
  static subscribe(key, handler) {
    this.listeners.push({
      key: key,
      handler: handler
    });
  }
}
exports.GlobalConfiguration = GlobalConfiguration;
//# sourceMappingURL=globalSettings.js.map