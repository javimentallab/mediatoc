"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
async function up(knex) {
  return knex.schema.alterTable('userRating', table => {
    table.float('rating').alter({
      alterType: true
    });
  });
}
async function down(knex) {
  return knex.schema.alterTable('userRating', table => {
    table.integer('rating').alter({
      alterType: true
    });
  });
}
//# sourceMappingURL=20220121025651_ratingColumnFloat.js.map