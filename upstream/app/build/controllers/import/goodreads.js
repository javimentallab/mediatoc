"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.importFromGoodreadsRss = exports.GoodreadsImportController = void 0;
var _typescriptRoutesToOpenapiServer = require("typescript-routes-to-openapi-server");
var _fastXmlParser = require("fast-xml-parser");
var _axios = _interopRequireDefault(require("axios"));
var _lodash = _interopRequireDefault(require("lodash"));
var _mediaItem = require("../../repository/mediaItem");
var _seen = require("../../repository/seen");
var _userRating = require("../../repository/userRating");
var _listItemRepository = require("../../repository/listItemRepository");
var _list = require("../../repository/list");
var _progress = require("../../repository/progress");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * @openapi_tags GoodreadsImport
 */
class GoodreadsImportController {
  /**
   * @openapi_operationId import
   */
  import = (0, _typescriptRoutesToOpenapiServer.createExpressRoute)(async (req, res) => {
    const userId = Number(req.user);
    const {
      url
    } = req.body;
    const summary = await importFromGoodreadsRss(url, userId);
    res.send(summary);
  });
}
exports.GoodreadsImportController = GoodreadsImportController;
const importFromGoodreadsRss = async (url, userId) => {
  var _feed$rss;
  const res = await _axios.default.get(url);
  const parser = new _fastXmlParser.XMLParser();
  const feed = parser.parse(res.data);
  const items = feed === null || feed === void 0 || (_feed$rss = feed.rss) === null || _feed$rss === void 0 || (_feed$rss = _feed$rss.channel) === null || _feed$rss === void 0 ? void 0 : _feed$rss.item;
  const mediaItems = items === null || items === void 0 ? void 0 : items.map(item => {
    var _item$book_published, _item$book;
    return {
      title: item.title,
      mediaType: 'book',
      source: 'goodreads',
      goodreadsId: item.book_id,
      overview: item.book_description,
      externalPosterUrl: item.book_large_image_url,
      authors: [item.author_name],
      releaseDate: (_item$book_published = item.book_published) === null || _item$book_published === void 0 ? void 0 : _item$book_published.toString(),
      numberOfPages: typeof ((_item$book = item.book) === null || _item$book === void 0 ? void 0 : _item$book.num_pages) === 'number' ? item.book.num_pages : undefined
    };
  });
  const addedItems = await _mediaItem.mediaItemRepository.mergeSearchResultWithExistingItems(mediaItems, 'book');
  const mediaItemByGoodreadsIdMap = _lodash.default.keyBy(addedItems, 'goodreadsId');
  const toRead = items === null || items === void 0 ? void 0 : items.filter(item => item.user_shelves === 'to-read').map(item => ({
    mediaItemId: mediaItemByGoodreadsIdMap[item.book_id].id,
    addedAt: new Date(item.user_date_added).getTime()
  }));
  const currentlyReading = items === null || items === void 0 ? void 0 : items.filter(item => item.user_shelves === 'currently-reading').map(item => ({
    mediaItemId: mediaItemByGoodreadsIdMap[item.book_id].id,
    userId: userId,
    date: new Date(item.user_date_added).getTime(),
    progress: 0
  }));
  const read = items === null || items === void 0 ? void 0 : items.filter(item => item.user_shelves === '').map(item => ({
    mediaItemId: mediaItemByGoodreadsIdMap[item.book_id].id,
    userId: userId,
    date: item.user_read_at ? new Date(item.user_read_at).getTime() : null
  }));
  const rating = items === null || items === void 0 ? void 0 : items.filter(item => item.user_rating || item.user_review).map(item => ({
    mediaItemId: mediaItemByGoodreadsIdMap[item.book_id].id,
    userId: userId,
    rating: item.user_rating,
    review: item.user_review,
    date: new Date(item.user_date_added).getTime()
  }));
  const lists = _lodash.default.groupBy(items.filter(item => item.user_shelves !== 'to-read' && item.user_shelves !== 'currently-reading' && item.user_shelves !== '' && item.user_shelves), 'user_shelves');
  const seenUniqueBy = value => ({
    mediaItemId: value.mediaItemId,
    date: value.date
  });
  const progressUniqueBy = value => ({
    mediaItemId: value.mediaItemId
  });
  for (const [listName, listItems] of Object.entries(lists)) {
    const newListName = `Goodreads-${listName}`;
    const list = (await _list.listRepository.findOne({
      name: newListName
    })) || (await _list.listRepository.create({
      name: newListName,
      userId: userId
    }));
    for (const listItem of listItems) {
      await _listItemRepository.listItemRepository.addItem({
        listId: list.id,
        userId: userId,
        mediaItemId: mediaItemByGoodreadsIdMap[listItem.book_id].id
      });
    }
  }
  for (const listItem of toRead) {
    await _listItemRepository.listItemRepository.addItem({
      watchlist: true,
      userId: userId,
      mediaItemId: listItem.mediaItemId
    });
  }
  await _seen.seenRepository.createManyUnique(read, seenUniqueBy);
  await _progress.progressRepository.createManyUnique(currentlyReading, progressUniqueBy);
  await _userRating.userRatingRepository.createMany(rating);
  return {
    currentlyReading: currentlyReading.length,
    ratings: rating.length,
    read: read.length,
    toRead: toRead.length
  };
};
exports.importFromGoodreadsRss = importFromGoodreadsRss;
//# sourceMappingURL=goodreads.js.map