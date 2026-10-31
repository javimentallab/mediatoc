"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.down = down;
exports.up = up;
async function up(knex) {
  const users = await knex('user');
  for (const user of users) {
    const lists = await knex('list').where('userId', user.id).orderBy('rank', 'asc');
    for (const list of lists.map((list, index) => ({
      ...list,
      rank: index
    }))) {
      await knex('list').update('rank', list.rank).where('id', list.id);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
async function down(knex) {}
//# sourceMappingURL=20230422000000_updateListRanks.js.map