"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
var _dateFns = require("date-fns");
async function up(knex) {
  const books = await knex('mediaItem').where({
    source: 'openlibrary'
  });
  for (const book of books) {
    if (book.releaseDate && !(0, _dateFns.isValid)((0, _dateFns.parseISO)(book.releaseDate))) {
      await knex('mediaItem').update({
        releaseDate: parseDate(book.releaseDate)
      }).where({
        id: book.id
      });
    }
  }
}
async function down(knex) {
  return;
}
const parseDate = dateStr => {
  if (dateStr.length === 4 && !Number.isNaN(dateStr)) {
    return dateStr;
  }
  const timestamp = Date.parse(dateStr);
  if (!Number.isNaN(timestamp)) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }
  return undefined;
};
//# sourceMappingURL=20221227000000_openlibarayDateFormat.js.map