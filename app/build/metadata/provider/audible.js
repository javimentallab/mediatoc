"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Audible = void 0;
var _axios = _interopRequireDefault(require("axios"));
var _metadataProvider = require("../metadataProvider");
var _globalSettings = require("../../repository/globalSettings");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class Audible extends _metadataProvider.MetadataProvider {
  name = 'audible';
  mediaType = 'audiobook';
  languages = {
    au: 'au',
    ca: 'ca',
    de: 'de',
    fr: 'fr',
    in: 'in',
    it: 'it',
    es: 'es',
    jp: 'co.jp',
    uk: 'co.uk',
    us: 'com'
  };
  countryCode() {
    var _GlobalConfiguration$;
    return (_GlobalConfiguration$ = _globalSettings.GlobalConfiguration.configuration.audibleLang) === null || _GlobalConfiguration$ === void 0 ? void 0 : _GlobalConfiguration$.toLocaleLowerCase();
  }
  domain(countryCode) {
    if (countryCode in this.languages) {
      return this.languages[countryCode];
    }
    return this.languages['us'];
  }
  queryParams = {
    response_groups: ['contributors', 'rating', 'media', 'product_attrs'].join(','),
    image_sizes: [500, 1000, 2400].join(',')
  };
  async search(query) {
    const countryCode = this.countryCode();
    const res = await _axios.default.get(`https://api.audible.${this.domain(countryCode)}/1.0/catalog/products`, {
      params: {
        title: query,
        num_results: 50,
        ...this.queryParams
      }
    });
    if (res.status === 200) {
      return res.data.products.map(product => this.mapResponse(product, countryCode));
    }
    throw new Error(`Error: ${res.status}`);
  }
  async findByAudibleId(audibleId) {
    var _res$data;
    const countryCode = _globalSettings.GlobalConfiguration.configuration.audibleLang;
    const res = await _axios.default.get(`https://api.audible.${this.domain(countryCode)}/1.0/catalog/products/${audibleId}`, {
      params: this.queryParams
    });
    if (res.status !== 200) {
      throw new Error(`Error: ${res.status}`);
    }
    if (((_res$data = res.data) === null || _res$data === void 0 || (_res$data = _res$data.product) === null || _res$data === void 0 ? void 0 : _res$data.title) === undefined) {
      return;
    }
    return this.mapResponse(res.data.product, countryCode);
  }
  async details(arg) {
    var _res$data$product;
    const {
      audibleId
    } = arg;
    const countryCode = arg.countryCode || _globalSettings.GlobalConfiguration.configuration.audibleLang;
    const res = await _axios.default.get(`https://api.audible.${this.domain(countryCode)}/1.0/catalog/products/${audibleId}`, {
      params: this.queryParams
    });
    if (res.status !== 200) {
      throw new Error(`Error: ${res.status}`);
    }
    if (((_res$data$product = res.data.product) === null || _res$data$product === void 0 ? void 0 : _res$data$product.title) === undefined) {
      throw new Error(`No metadata from Audible for ID ${audibleId}. Url: ${res.config.url}. Response: ${JSON.stringify(res.data, null, 2)}`);
    }
    const __mapped = this.mapResponse(res.data.product, countryCode);
    const __existing = Number(arg && arg.numberOfChapters) || 0;
    if (__existing > 0) {
      __mapped.numberOfChapters = __existing;
    } else {
      try {
        const __nc = await this.fetchChapterCount(audibleId, countryCode);
        if (__nc !== undefined) __mapped.numberOfChapters = __nc;
      } catch (e) {}
    }
    return __mapped;
  }
  async fetchChapterCount(audibleId, countryCode) {
    try {
      const res = await _axios.default.get(`https://api.audible.${this.domain(countryCode)}/1.0/content/${audibleId}/metadata`, { params: { response_groups: 'chapter_info' } });
      const ci = res && res.data && res.data.content_metadata && res.data.content_metadata.chapter_info;
      const chapters = (ci && ci.chapters) || [];
      if (!chapters.length) return undefined;
      const isCredits = t => /cr[e\u00e9]dito|credit/i.test(String(t || ''));
      const n = chapters.filter(ch => !isCredits(ch.title)).length;
      return n > 0 ? n : chapters.length;
    } catch (e) { return undefined; }
  }
  mapResponse(item, countryCode) {
    var _item$authors, _item$narrators, _item$product_images;
    return {
      needsDetails: false,
      mediaType: this.mediaType,
      source: this.name,
      audibleCountryCode: countryCode,
      title: item.title,
      audibleId: item.asin,
      authors: (_item$authors = item.authors) === null || _item$authors === void 0 ? void 0 : _item$authors.map(author => author.name),
      narrators: (_item$narrators = item.narrators) === null || _item$narrators === void 0 ? void 0 : _item$narrators.map(narrator => narrator.name),
      externalPosterUrl: (_item$product_images = item.product_images) === null || _item$product_images === void 0 ? void 0 : _item$product_images[2400],
      language: item.language,
      releaseDate: item.release_date,
      runtime: item.runtime_length_min,
      overview: item.merchandising_summary
    };
  }
}
exports.Audible = Audible;
//# sourceMappingURL=audible.js.map