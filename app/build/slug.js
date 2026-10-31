"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.toSlug = exports.randomSlugId = void 0;
var _nanoid = require("nanoid");
const toSlug = str => {
  return str.toLowerCase().replaceAll(/[^a-z0-9\s-]/g, '').replaceAll(/\s+/g, '-').replaceAll(/-+/g, '-').replaceAll(/-$/g, '').replaceAll(/^-/g, '') || '-';
};
exports.toSlug = toSlug;
const randomSlugId = exports.randomSlugId = (0, _nanoid.customAlphabet)('1234567890abcdefghijklmnopqrstuvwxyz', 20);
//# sourceMappingURL=slug.js.map