"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ListController = void 0;
var _dbconfig = require("../dbconfig");
var _list = require("../repository/list");
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
/**
 * @openapi_tags List
 */
class ListController {
  /**
   * @openapi_operationId Add list
   */
  add = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      name,
      description,
      privacy,
      sortBy,
      sortOrder
    } = req.body;
    const list = await _list.listRepository.create({
      userId: userId,
      name,
      description,
      privacy,
      sortBy,
      sortOrder
    });
    if (list) {
      res.send(list);
    } else {
      res.sendStatus(400);
    }
  });

  /**
   * @openapi_operationId Update list
   */
  update = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      id,
      name,
      description,
      privacy,
      sortBy,
      sortOrder
    } = req.body;
    const list = await _list.listRepository.update({
      userId: userId,
      id,
      name,
      description,
      privacy,
      sortBy,
      sortOrder
    });
    if (list) {
      res.send(list);
    } else {
      res.sendStatus(400);
    }
  });

  /**
   * @openapi_operationId Get list
   */
  get = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const currentUser = Number(req.user);
    const {
      listId
    } = req.query;
    const list = await _list.listRepository.details({
      userId: currentUser,
      listId: listId
    });
    if (list) {
      res.send(list);
    } else {
      res.sendStatus(400);
    }
  });

  /**
   * @openapi_operationId Delete list
   */
  delete = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const currentUser = Number(req.user);
    const {
      listId
    } = req.query;
    const success = await _list.listRepository.delete({
      userId: currentUser,
      listId: listId
    });
    if (success) {
      res.send();
    } else {
      res.sendStatus(400);
    }
  });

  /**
   * @openapi_operationId Get List Items
   */
  getListItems = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const currentUser = Number(req.user);
    const {
      listId
    } = req.query;
    const list = await _dbconfig.Database.knex('list').where('id', listId).first();
    if (!list) {
      res.sendStatus(404);
      return;
    }
    if (list.userId !== currentUser && list.privacy === 'private') {
      res.sendStatus(403);
      return;
    }
    const items = await _list.listRepository.items({
      listId: list.id,
      userId: currentUser
    });
    res.send(items);
  });
}
exports.ListController = ListController;
//# sourceMappingURL=listController.js.map