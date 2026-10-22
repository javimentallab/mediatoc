"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
var _mediaItemSlug = require("./20220312002700_mediaItemSlug");
async function up(knex) {
  await (0, _mediaItemSlug.fixItemsWithInvalidMediaItemId)(knex);
  await knex('seen').update('date', null).where('date', 0);
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
async function down(knex) {}
//# sourceMappingURL=20220404141200_seenDateToNull.js.map