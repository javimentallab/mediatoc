"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getUserLists = exports.ListsController = void 0;
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _dbconfig = require("../dbconfig");
/**
 * @openapi_tags Lists
 */
class ListsController {
  /**
   * @openapi_operationId Get user's lists
   */
  getLists = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const {
      userId,
      mediaItemId,
      seasonId,
      episodeId
    } = req.query;
    const currentUserId = Number(req.user);
    const user = await _dbconfig.Database.knex('user').select('id', 'name').where('id', userId).first();
    if (!user) {
      res.sendStatus(400);
      return;
    }
    const lists = await getUserLists({
      userId: user.id,
      currentUserId: currentUserId,
      mediaItemId: mediaItemId,
      seasonId: seasonId,
      episodeId: episodeId
    });
    res.send(lists);
  });
}
exports.ListsController = ListsController;
const getUserLists = async args => {
  const {
    userId,
    currentUserId,
    mediaItemId,
    seasonId,
    episodeId
  } = args;
  const qb = _dbconfig.Database.knex('list').select('list.*', 'itemsCount', 'user.id as user.id', 'user.name as user.name').where('userId', userId).where(currentUserId === userId ? {} : {
    privacy: 'public'
  }).leftJoin(qb => qb.select('listId').count('listId', {
    as: 'itemsCount'
  }).from('listItem').groupBy('listId').as('count'), 'count.listId', 'list.id').leftJoin('user', 'list.userId', 'user.id');
  if (episodeId || seasonId || mediaItemId) {
    qb.innerJoin(qb => qb.select('listId').from('listItem').where(episodeId ? {
      episodeId: episodeId
    } : seasonId ? {
      seasonId: seasonId,
      episodeId: null
    } : {
      mediaItemId: mediaItemId,
      seasonId: null,
      episodeId: null
    }).groupBy('listId').as('listItem'), 'listItem.listId', 'list.id');
  }
  const res = await qb;
  return res.map((row, index) => ({
    id: row.id,
    name: row.name,
    privacy: row.privacy,
    sortBy: row.sortBy,
    sortOrder: row.sortOrder,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    itemsCount: row.itemsCount,
    allowComments: Boolean(row.allowComments),
    displayNumbers: Boolean(row.displayNumbers),
    isWatchlist: Boolean(row.isWatchlist),
    user: {
      id: row['user.id'],
      name: row['user.name']
    }
  }));
};
exports.getUserLists = getUserLists;
//# sourceMappingURL=listsController.js.map