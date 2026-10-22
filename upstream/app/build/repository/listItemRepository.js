"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.listItemRepository = void 0;
var _dbconfig = require("../dbconfig");
var _repository = require("./repository");
function _classPrivateMethodInitSpec(e, a) { _checkPrivateRedeclaration(e, a), a.add(e); }
function _checkPrivateRedeclaration(e, t) { if (t.has(e)) throw new TypeError("Cannot initialize the same private elements twice on an object"); }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _assertClassBrand(e, t, n) { if ("function" == typeof e ? e === t : e.has(t)) return arguments.length < 3 ? t : n; throw new TypeError("Private element is not present on this object"); }
var _ListItemRepository_brand = /*#__PURE__*/new WeakSet();
class ListItemRepository extends (0, _repository.repository)({
  tableName: 'listItem',
  primaryColumnName: 'id'
}) {
  constructor(..._args) {
    super(..._args);
    _classPrivateMethodInitSpec(this, _ListItemRepository_brand);
    _defineProperty(this, "addItem", _assertClassBrand(_ListItemRepository_brand, this, _addOrRemoveListItemFactory).call(this, async (trx, args) => {
      const {
        mediaItemId,
        seasonId,
        episodeId,
        listId
      } = args;
      if (mediaItemId && seasonId) {
        const season = await trx('season').where('tvShowId', mediaItemId).where('id', seasonId).first();
        if (!season) {
          return false;
        }
      }
      if (mediaItemId && episodeId) {
        const episode = await trx('episode').where('tvShowId', mediaItemId).where('id', episodeId).first();
        if (!episode) {
          return false;
        }
      }
      const existingItems = await trx('listItem').where({
        listId: listId,
        mediaItemId: mediaItemId,
        seasonId: episodeId == undefined ? seasonId || null : null,
        episodeId: episodeId || null
      });
      if (existingItems.length > 0) {
        return false;
      }
      await trx('listItem').insert({
        listId: listId,
        mediaItemId: mediaItemId,
        seasonId: episodeId == undefined ? seasonId || null : null,
        episodeId: episodeId || null,
        addedAt: new Date().getTime()
      });
      return true;
    }));
    _defineProperty(this, "removeItem", _assertClassBrand(_ListItemRepository_brand, this, _addOrRemoveListItemFactory).call(this, async (trx, args) => {
      const {
        mediaItemId,
        seasonId,
        episodeId,
        listId
      } = args;
      const listItem = await trx('listItem').where({
        mediaItemId: mediaItemId,
        seasonId: seasonId || null,
        episodeId: episodeId || null,
        listId: listId
      }).first();
      if (listItem) {
        await trx('listItem').delete().where('id', listItem.id);
      }
      return true;
    }));
  }
  async addManyItems(args) {
    const {
      userId,
      listId,
      listItems
    } = args;
    return await _dbconfig.Database.knex.transaction(async trx => {
      const list = await trx('list').where({
        id: listId,
        userId: userId
      }).first();
      if (!list || list.userId !== userId && list.privacy === 'private') {
        return false;
      }
      const existingListItems = await trx('listItem').where({
        listId: listId
      });
      const serializeListItem = listItem => {
        return JSON.stringify([listItem.mediaItemId, listItem.seasonId, listItem.episodeId]);
      };
      const existingListItemsSet = new Set(existingListItems.map(serializeListItem));
      const itemsToAdd = listItems.filter(listItem => !existingListItemsSet.has(serializeListItem(listItem))).map(listItem => ({
        listId: listId,
        addedAt: new Date().getTime(),
        mediaItemId: listItem.mediaItemId,
        seasonId: listItem.seasonId,
        episodeId: listItem.episodeId
      }));
      if (itemsToAdd.length > 0) {
        await trx.batchInsert('listItem', itemsToAdd, 30);
      }
      return true;
    });
  }
}
function _addOrRemoveListItemFactory(fn) {
  return async args => {
    const {
      userId,
      listId,
      watchlist,
      mediaItemId,
      seasonId,
      episodeId
    } = {
      listId: undefined,
      watchlist: undefined,
      ...args
    };
    if (listId != undefined && watchlist != undefined || listId == undefined && watchlist == undefined) {
      throw new Error('only one of listId and addToWatchlist arguments should be provided');
    }
    return await _dbconfig.Database.knex.transaction(async trx => {
      const list = await trx('list').where(listId != undefined ? {
        id: listId
      } : {
        isWatchlist: true,
        userId: userId
      }).first();
      if (!list || list.userId !== userId && list.privacy === 'private') {
        return false;
      }
      return fn(trx, {
        mediaItemId,
        seasonId,
        episodeId,
        userId,
        listId: list.id
      });
    });
  };
}
const listItemRepository = exports.listItemRepository = new ListItemRepository();
//# sourceMappingURL=listItemRepository.js.map