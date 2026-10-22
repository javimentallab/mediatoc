"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OpenLibrary = void 0;
var _axios = _interopRequireDefault(require("axios"));
var _metadataProvider = require("../metadataProvider");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class OpenLibrary extends _metadataProvider.MetadataProvider {
  name = 'openlibrary';
  mediaType = 'book';
  async search(query) {
    var _result$docs;
    const res = await _axios.default.get('http://openlibrary.org/search.json', {
      params: {
        q: query,
        fields: ['key', 'type', 'title', 'first_publish_year', 'number_of_pages_median', 'lending_edition_s', 'edition_key', 'last_modified_i', 'first_sentence', 'language', 'edition_count', 'cover_i', 'author_name'].join(','),
        type: 'work',
        limit: 20
      }
    });
    const result = res.data;
    return (_result$docs = result.docs) === null || _result$docs === void 0 ? void 0 : _result$docs.map(doc => {
      var _doc$first_publish_ye;
      return {
        mediaType: this.mediaType,
        source: this.name,
        title: doc.title,
        externalPosterUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}.jpg` : undefined,
        releaseDate: (_doc$first_publish_ye = doc.first_publish_year) === null || _doc$first_publish_ye === void 0 ? void 0 : _doc$first_publish_ye.toString(),
        numberOfPages: doc.number_of_pages_median,
        authors: doc.author_name,
        openlibraryId: doc.key
      };
    });
  }
  async details(args) {
    var _res$data$description, _res$data, _res$data$covers;
    const res = await _axios.default.get(`https://openlibrary.org${args.openlibraryId}.json`);
    return {
      mediaType: this.mediaType,
      source: this.name,
      title: res.data.title,
      overview: typeof res.data.description === 'string' ? res.data.description : (_res$data$description = res.data.description) === null || _res$data$description === void 0 ? void 0 : _res$data$description.value,
      releaseDate: parseDate((_res$data = res.data) === null || _res$data === void 0 ? void 0 : _res$data.first_publish_date),
      externalPosterUrl: ((_res$data$covers = res.data.covers) === null || _res$data$covers === void 0 ? void 0 : _res$data$covers.length) > 0 ? `https://covers.openlibrary.org/b/id/${res.data.covers[0]}.jpg` : args.externalPosterUrl,
      numberOfPages: args.numberOfPages
    };
  }
}
exports.OpenLibrary = OpenLibrary;
const parseDate = dateStr => {
  if ((dateStr === null || dateStr === void 0 ? void 0 : dateStr.length) === 4 && !Number.isNaN(dateStr)) {
    return dateStr;
  }
  const timestamp = Date.parse(dateStr);
  if (!Number.isNaN(timestamp)) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }
  return undefined;
};
//# sourceMappingURL=openlibrary.js.map