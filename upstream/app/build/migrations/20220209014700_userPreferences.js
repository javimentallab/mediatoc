"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
async function up(knex) {
  return knex.schema.alterTable('notificationPlatformsCredentials', table => {
    table.dropForeign('userId');
  }).alterTable('accessToken', table => {
    table.dropForeign('userId');
  }).alterTable('seen', table => {
    table.dropForeign('mediaItemId');
    table.dropForeign('episodeId');
    table.dropForeign('userId');
  }).alterTable('userRating', table => {
    table.dropForeign('mediaItemId');
    table.dropForeign('seasonId');
    table.dropForeign('episodeId');
    table.dropForeign('userId');
  }).alterTable('watchlist', table => {
    table.dropForeign('mediaItemId');
    table.dropForeign('userId');
  }).alterTable('listItem', table => {
    table.dropForeign('episodeId');
    table.dropForeign('seasonId');
    table.dropForeign('mediaItemId');
    table.dropForeign('listId');
  }).alterTable('list', table => {
    table.dropForeign('userId');
  }).alterTable('user', table => {
    table.jsonb('clientPreferences');
  }).alterTable('list', table => {
    table.foreign('userId').references('id').inTable('user');
  }).alterTable('listItem', table => {
    table.foreign('episodeId').references('id').inTable('episode');
    table.foreign('seasonId').references('id').inTable('season');
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('listId').references('id').inTable('list');
  }).alterTable('watchlist', table => {
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('userId').references('id').inTable('user');
  }).alterTable('userRating', table => {
    table.foreign('episodeId').references('id').inTable('episode');
    table.foreign('seasonId').references('id').inTable('season');
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('userId').references('id').inTable('user');
  }).alterTable('seen', table => {
    table.foreign('episodeId').references('id').inTable('episode');
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('userId').references('id').inTable('user');
  }).alterTable('accessToken', table => {
    table.foreign('userId').references('id').inTable('user');
  }).alterTable('notificationPlatformsCredentials', table => {
    table.foreign('userId').references('id').inTable('user');
  });
}
async function down(knex) {
  return knex.schema.alterTable('notificationPlatformsCredentials', table => {
    table.dropForeign('userId');
  }).alterTable('accessToken', table => {
    table.dropForeign('userId');
  }).alterTable('seen', table => {
    table.dropForeign('mediaItemId');
    table.dropForeign('episodeId');
    table.dropForeign('userId');
  }).alterTable('userRating', table => {
    table.dropForeign('mediaItemId');
    table.dropForeign('seasonId');
    table.dropForeign('episodeId');
    table.dropForeign('userId');
  }).alterTable('watchlist', table => {
    table.dropForeign('mediaItemId');
    table.dropForeign('userId');
  }).alterTable('listItem', table => {
    table.dropForeign('episodeId');
    table.dropForeign('seasonId');
    table.dropForeign('mediaItemId');
    table.dropForeign('listId');
  }).alterTable('list', table => {
    table.dropForeign('userId');
  }).alterTable('user', table => {
    table.dropColumn('clientPreferences');
  }).alterTable('list', table => {
    table.foreign('userId').references('id').inTable('user');
  }).alterTable('listItem', table => {
    table.foreign('episodeId').references('id').inTable('episode');
    table.foreign('seasonId').references('id').inTable('season');
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('listId').references('id').inTable('list');
  }).alterTable('watchlist', table => {
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('userId').references('id').inTable('user');
  }).alterTable('userRating', table => {
    table.foreign('episodeId').references('id').inTable('episode');
    table.foreign('seasonId').references('id').inTable('season');
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('userId').references('id').inTable('user');
  }).alterTable('seen', table => {
    table.foreign('episodeId').references('id').inTable('episode');
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('userId').references('id').inTable('user');
  }).alterTable('accessToken', table => {
    table.foreign('userId').references('id').inTable('user');
  }).alterTable('notificationPlatformsCredentials', table => {
    table.foreign('userId').references('id').inTable('user');
  });
}
//# sourceMappingURL=20220209014700_userPreferences.js.map