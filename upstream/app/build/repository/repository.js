"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.repository = exports.omitUndefinedValues = void 0;
var _lodash = _interopRequireDefault(require("lodash"));
var _dbconfig = require("../dbconfig");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const omitUndefinedValues = value => _lodash.default.pickBy(value, v => v !== undefined);
exports.omitUndefinedValues = omitUndefinedValues;
const BATCH_SIZE = 30;
const repository = args => {
  const {
    primaryColumnName,
    tableName,
    columnNames,
    booleanColumnNames,
    uniqueBy
  } = args;
  return class Repository {
    tableName = tableName;
    columnNames = columnNames;
    primaryColumnName = primaryColumnName;
    booleanColumnNames = booleanColumnNames;
    uniqueBy = uniqueBy;
    serialize(value) {
      if (!this.booleanColumnNames) {
        return value;
      }
      return {
        ...value,
        ...(0, _lodash.default)(this.booleanColumnNames).keyBy().mapValues(key => value[key] !== undefined ? value[key] ? 1 : 0 : undefined).value()
      };
    }
    deserialize(value) {
      if (!this.booleanColumnNames) {
        return value;
      }
      return {
        ...value,
        ...(0, _lodash.default)(this.booleanColumnNames).keyBy().mapValues(key => value[key] !== undefined ? Boolean(value[key]) : undefined).value()
      };
    }
    stripValue(value) {
      if (!this.columnNames) {
        return value;
      }
      return _lodash.default.pick(value, this.columnNames);
    }
    async count(where) {
      const res = await _dbconfig.Database.knex(this.tableName).where(omitUndefinedValues(where) || {}).count('* as count').first();
      return Number(res.count);
    }
    async find(where) {
      const res = await _dbconfig.Database.knex(this.tableName).where(omitUndefinedValues(where) || {});
      if (res) {
        return res.map(value => this.deserialize(value));
      }
    }
    async findOne(where) {
      const res = await _dbconfig.Database.knex(this.tableName).where(omitUndefinedValues(where) || {}).first();
      if (res) {
        return this.deserialize(res);
      }
    }
    async delete(where) {
      return _dbconfig.Database.knex(this.tableName).delete().where(omitUndefinedValues(where) || {});
    }
    async deleteManyById(ids) {
      return _dbconfig.Database.knex(this.tableName).delete().whereIn(primaryColumnName.toString(), ids);
    }
    async create(value) {
      if (this.uniqueBy) {
        return this.createUnique(value, this.uniqueBy);
      }
      const res = await _dbconfig.Database.knex(this.tableName).insert(this.serialize(omitUndefinedValues(this.stripValue(value)))).returning(this.primaryColumnName);
      if ((res === null || res === void 0 ? void 0 : res.length) > 0) {
        return res[0][this.primaryColumnName];
      }
    }
    async createUnique(value, uniqueBy) {
      return await _dbconfig.Database.knex.transaction(async trx => {
        const existingItem = await trx(this.tableName).where(omitUndefinedValues(uniqueBy(value))).first();
        if (!existingItem) {
          const res = await trx(this.tableName).insert(this.serialize(omitUndefinedValues(this.stripValue(value)))).returning(this.primaryColumnName);
          if ((res === null || res === void 0 ? void 0 : res.length) > 0) {
            return res[0][this.primaryColumnName];
          }
        }
      });
    }
    async createMany(values) {
      if (values.length === 0) {
        return;
      }
      if (this.uniqueBy) {
        return this.createManyUnique(values, uniqueBy);
      }
      const res = await _dbconfig.Database.knex.batchInsert(this.tableName, values.map(value => this.serialize(omitUndefinedValues(this.stripValue(value)))), BATCH_SIZE).returning(this.primaryColumnName);
      res.forEach((value, index) => values[index][this.primaryColumnName] = value[this.primaryColumnName]);
      return res.map(value => value[this.primaryColumnName]);
    }
    async createManyUnique(values, uniqueBy, limitQuery) {
      const serialize = item => JSON.stringify(uniqueBy(item));
      return await _dbconfig.Database.knex.transaction(async trx => {
        const fetchAllItems = async () => {
          return await trx(this.tableName).where(limitQuery ? limitQuery : {});
        };
        const fetchMatchingItems = async () => {
          const existingItems = [];
          for (const value of values) {
            const res = await trx(this.tableName).where(uniqueBy(value));
            res.forEach(item => existingItems.push(item));
          }
          return existingItems;
        };
        const existingItems = values.length < 100 ? await fetchMatchingItems() : await fetchAllItems();
        const uniqueExistingItems = new Set(existingItems.map(item => serialize(item)));
        const newItems = (0, _lodash.default)(values).filter(item => !uniqueExistingItems.has(serialize(item))).map(item => ({
          item: item,
          serializedItem: serialize(item)
        })).uniqBy('serializedItem').map(value => value.item).value();
        if (newItems.length > 0) {
          const res = await _dbconfig.Database.knex.batchInsert(this.tableName, newItems.map(value => this.serialize(omitUndefinedValues(this.stripValue(value)))), BATCH_SIZE).returning(this.primaryColumnName).transacting(trx);
          res.forEach((value, index) => newItems[index][this.primaryColumnName] = value[this.primaryColumnName]);
          return res.map(value => value[this.primaryColumnName]);
        }
      });
    }
    async update(value) {
      const qb = _dbconfig.Database.knex(this.tableName).update(this.serialize(omitUndefinedValues(this.stripValue(value))));
      if (value[primaryColumnName]) {
        qb.where(primaryColumnName, value[primaryColumnName]);
      }
      await qb;
      return value;
    }
    async updateWhere(params) {
      const {
        value,
        where
      } = params;
      await _dbconfig.Database.knex(this.tableName).update(this.serialize(omitUndefinedValues(this.stripValue(value)))).where(where);
    }
    async updateOrCreate(params) {
      const {
        value,
        where
      } = params;
      await _dbconfig.Database.knex.transaction(async trx => {
        const existingItem = await trx(this.tableName).where(omitUndefinedValues(where)).first();
        if (existingItem) {
          await trx(this.tableName).update(this.serialize(omitUndefinedValues(this.stripValue(value)))).where(primaryColumnName, existingItem[primaryColumnName]);
        } else {
          await trx(this.tableName).insert(this.serialize(omitUndefinedValues(this.stripValue(value))));
        }
      });
    }
  };
};
exports.repository = repository;
//# sourceMappingURL=repository.js.map