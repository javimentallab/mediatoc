"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deleteMissingItems = void 0;
exports.down = down;
exports.fixItemsWithInvalidMediaItemId = void 0;
exports.up = up;
var _dateFns = require("date-fns");
var _slug = require("../slug");
async function up(knex) {
  await fixItemsWithInvalidMediaItemId(knex);
  await knex.schema.alterTable('image', table => {
    table.dropForeign('mediaItemId');
    table.dropForeign('seasonId');
  }).alterTable('notificationsHistory', table => {
    table.dropForeign('mediaItemId');
    table.dropForeign('episodeId');
  }).alterTable('notificationPlatformsCredentials', table => {
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
  }).alterTable('episode', table => {
    table.dropForeign('tvShowId');
    table.dropForeign('seasonId');
  }).alterTable('season', table => {
    table.dropForeign('tvShowId');
  });
  await knex.schema.alterTable('mediaItem', table => {
    table.string('slug');
    table.index('slug');
    table.unique(['mediaType', 'slug']);
  });
  const mediaItems = await knex('mediaItem');
  for (const mediaItem of mediaItems) {
    const releaseYear = mediaItem.releaseDate ? (0, _dateFns.parseISO)(mediaItem.releaseDate).getFullYear() : undefined;
    const slug = (0, _slug.toSlug)(releaseYear ? `${mediaItem.title}-${releaseYear}` : mediaItem.title);
    const slugExists = await knex('mediaItem').where('slug', slug).first();
    await knex('mediaItem').update({
      slug: slugExists ? (0, _slug.toSlug)(`${slug}-${(0, _slug.randomSlugId)()}`) : slug
    }).where('id', mediaItem.id);
  }
  await knex.schema.alterTable('mediaItem', table => {
    table.string('slug').notNullable().alter({
      alterNullable: true
    });
  });
  await knex.schema.alterTable('season', table => {
    table.foreign('tvShowId').references('id').inTable('mediaItem');
  }).alterTable('episode', table => {
    table.foreign('tvShowId').references('id').inTable('mediaItem');
    table.foreign('seasonId').references('id').inTable('season');
  }).alterTable('image', table => {
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('seasonId').references('id').inTable('season');
  }).alterTable('notificationsHistory', table => {
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('episodeId').references('id').inTable('episode');
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
  await knex.schema.alterTable('image', table => {
    table.dropForeign('mediaItemId');
    table.dropForeign('seasonId');
  }).alterTable('notificationsHistory', table => {
    table.dropForeign('mediaItemId');
    table.dropForeign('episodeId');
  }).alterTable('notificationPlatformsCredentials', table => {
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
  }).alterTable('episode', table => {
    table.dropForeign('tvShowId');
    table.dropForeign('seasonId');
  }).alterTable('season', table => {
    table.dropForeign('tvShowId');
  });
  await knex.schema.alterTable('mediaItem', table => {
    table.dropUnique(['mediaType', 'slug']);
    table.dropIndex('slug');
    table.dropColumn('slug');
  });
  await knex.schema.alterTable('season', table => {
    table.foreign('tvShowId').references('id').inTable('mediaItem');
  }).alterTable('episode', table => {
    table.foreign('tvShowId').references('id').inTable('mediaItem');
    table.foreign('seasonId').references('id').inTable('season');
  }).alterTable('image', table => {
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('seasonId').references('id').inTable('season');
  }).alterTable('notificationsHistory', table => {
    table.foreign('mediaItemId').references('id').inTable('mediaItem');
    table.foreign('episodeId').references('id').inTable('episode');
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
const fixEpisodesWithInvalidMediaItemId = async knex => {
  const episodesWithInvalidMediaItemId = await knex('episode').leftJoin('mediaItem', 'mediaItem.id', 'episode.tvShowId').where('mediaItem.id', null).select('episode.*');
  const mediaItemMapping = new Map();
  const danglingEpisodes = new Array();
  for (const episodeWithInvalidMediaItemId of episodesWithInvalidMediaItemId) {
    const matchingEpisode = await knex('episode').leftJoin('mediaItem', 'mediaItem.id', 'episode.tvShowId').where('episode.tmdbId', episodeWithInvalidMediaItemId.tmdbId).whereNotNull('mediaItem.id').first();
    if (matchingEpisode) {
      mediaItemMapping.set(episodeWithInvalidMediaItemId.tvShowId, matchingEpisode.tvShowId);
      await updateOrDeleteUserRating(knex, {
        mediaItemId: episodeWithInvalidMediaItemId.tvShowId,
        episodeId: episodeWithInvalidMediaItemId.id
      }, {
        mediaItemId: matchingEpisode.tvShowId,
        episodeId: matchingEpisode.id
      });
      await knex('notificationsHistory').where({
        mediaItemId: episodeWithInvalidMediaItemId.tvShowId,
        episodeId: episodeWithInvalidMediaItemId.id
      }).update({
        mediaItemId: matchingEpisode.tvShowId,
        episodeId: matchingEpisode.id
      });
      await knex('seen').where({
        mediaItemId: episodeWithInvalidMediaItemId.tvShowId,
        episodeId: episodeWithInvalidMediaItemId.id
      }).update({
        mediaItemId: matchingEpisode.tvShowId,
        episodeId: matchingEpisode.id
      });
      await knex('episode').where('id', episodeWithInvalidMediaItemId.id).delete();
    } else {
      danglingEpisodes.push(episodeWithInvalidMediaItemId);
    }
  }
  for (const episodeWithInvalidMediaItemId of danglingEpisodes) {
    if (mediaItemMapping.has(episodeWithInvalidMediaItemId.tvShowId)) {
      await knex('episode').where('id', episodeWithInvalidMediaItemId.id).update('tvShowId', mediaItemMapping.has(episodeWithInvalidMediaItemId.tvShowId));
    } else {
      await knex('userRating').where({
        mediaItemId: episodeWithInvalidMediaItemId.tvShowId,
        episodeId: episodeWithInvalidMediaItemId.id
      }).delete();
      await knex('notificationsHistory').where({
        mediaItemId: episodeWithInvalidMediaItemId.tvShowId,
        episodeId: episodeWithInvalidMediaItemId.id
      }).delete();
      await knex('seen').where({
        mediaItemId: episodeWithInvalidMediaItemId.tvShowId,
        episodeId: episodeWithInvalidMediaItemId.id
      }).delete();
      await knex('episode').where('id', episodeWithInvalidMediaItemId.id).delete();
    }
  }
  await fixWatchlistWithInvalidMediaItemId(knex, mediaItemMapping);
  await fixUserRatingWithInvalidMediaItemId(knex, mediaItemMapping);
};
const fixWatchlistWithInvalidMediaItemId = async (knex, mediaItemMapping) => {
  const watchlistItemsWithInvalidMediaItemId = await knex('watchlist').leftJoin('mediaItem', 'mediaItem.id', 'watchlist.mediaItemId').where('mediaItem.id', null).select('watchlist.*');
  for (const watchlist of watchlistItemsWithInvalidMediaItemId) {
    if (mediaItemMapping.has(watchlist.mediaItemId)) {
      if (await knex('watchlist').where('mediaItemId', mediaItemMapping.has(watchlist.mediaItemId)).first()) {
        await knex('watchlist').where('id', watchlist.id).delete();
      } else {
        await knex('watchlist').where('id', watchlist.id).update('mediaItemId', mediaItemMapping.has(watchlist.mediaItemId));
      }
    }
  }
};
const updateOrDeleteUserRating = async (knex, from, to) => {
  if (await knex('userRating').where('mediaItemId', to.mediaItemId).where('seasonId', to.seasonId || null).where('episodeId', to.seasonId || null).first()) {
    await knex('userRating').where('mediaItemId', from.mediaItemId).where('seasonId', from.seasonId || null).where('episodeId', from.seasonId || null).delete();
  } else {
    await knex('userRating').where('mediaItemId', from.mediaItemId).where('seasonId', from.seasonId || null).where('episodeId', from.seasonId || null).update({
      mediaItemId: to.mediaItemId,
      ...(to.seasonId ? {
        seasonId: to.seasonId
      } : {}),
      ...(to.episodeId ? {
        episodeId: to.episodeId
      } : {})
    });
  }
};
const fixUserRatingWithInvalidMediaItemId = async (knex, mediaItemMapping) => {
  const userRatingWithInvalidMediaItemId = await knex('userRating').leftJoin('mediaItem', 'mediaItem.id', 'userRating.mediaItemId').where('mediaItem.id', null).where('userRating.seasonId', null).where('userRating.episodeId', null).select('userRating.*');
  for (const rating of userRatingWithInvalidMediaItemId) {
    if (mediaItemMapping.has(rating.mediaItemId)) {
      await updateOrDeleteUserRating(knex, {
        mediaItemId: rating.mediaItemId
      }, {
        mediaItemId: mediaItemMapping.get(rating.mediaItemId)
      });
    }
  }
};
const fixSeasonsWithInvalidMediaItemId = async knex => {
  const seasonsWithInvalidMediaItemId = await knex('season').leftJoin('mediaItem', 'mediaItem.id', 'season.tvShowId').where('mediaItem.id', null).select('season.*');
  const mediaItemMapping = new Map();
  const danglingSeasons = new Array();
  for (const seasonWithInvalidMediaItemId of seasonsWithInvalidMediaItemId) {
    const matchingSeason = await knex('season').leftJoin('mediaItem', 'mediaItem.id', 'season.tvShowId').where('season.tmdbId', seasonWithInvalidMediaItemId.tmdbId).whereNotNull('mediaItem.id').first();
    if (matchingSeason) {
      mediaItemMapping.set(seasonWithInvalidMediaItemId.tvShowId, matchingSeason.tvShowId);
      await updateOrDeleteUserRating(knex, {
        mediaItemId: seasonWithInvalidMediaItemId.tvShowId,
        seasonId: seasonWithInvalidMediaItemId.id
      }, {
        mediaItemId: matchingSeason.tvShowId,
        seasonId: matchingSeason.id
      });
      await knex('image').where({
        mediaItemId: seasonWithInvalidMediaItemId.tvShowId,
        seasonId: seasonWithInvalidMediaItemId.id
      }).update({
        mediaItemId: matchingSeason.tvShowId,
        seasonId: matchingSeason.id
      });
      await knex('season').where('id', seasonWithInvalidMediaItemId.id).delete();
    } else {
      danglingSeasons.push(seasonWithInvalidMediaItemId);
    }
  }
  for (const seasonWithInvalidMediaItemId of danglingSeasons) {
    if (mediaItemMapping.has(seasonWithInvalidMediaItemId.tvShowId)) {
      await knex('season').where('id', seasonWithInvalidMediaItemId.id).update('tvShowId', mediaItemMapping.has(seasonWithInvalidMediaItemId.tvShowId));
    } else {
      await knex('userRating').where({
        mediaItemId: seasonWithInvalidMediaItemId.tvShowId,
        seasonId: seasonWithInvalidMediaItemId.id
      }).delete();
      await knex('image').where({
        mediaItemId: seasonWithInvalidMediaItemId.tvShowId,
        seasonId: seasonWithInvalidMediaItemId.id
      }).delete();
      await knex('season').where('id', seasonWithInvalidMediaItemId.id).delete();
    }
  }
  await fixWatchlistWithInvalidMediaItemId(knex, mediaItemMapping);
  await fixUserRatingWithInvalidMediaItemId(knex, mediaItemMapping);
};
const deleteMissingItems = async knex => {
  await knex('episode').leftJoin('mediaItem', 'tvShowId', 'mediaItem.id').where('mediaItem.id', null);
  await knex('season').leftJoin('mediaItem', 'tvShowId', 'mediaItem.id').where('mediaItem.id', null);
  await knex('image').leftJoin('mediaItem', 'mediaItemId', 'mediaItem.id').where('mediaItem.id', null);
  await knex('notificationsHistory').leftJoin('mediaItem', 'mediaItemId', 'mediaItem.id').where('mediaItem.id', null);
  await knex('seen').leftJoin('mediaItem', 'mediaItemId', 'mediaItem.id').where('mediaItem.id', null);
  await knex('userRating').leftJoin('mediaItem', 'mediaItemId', 'mediaItem.id').where('mediaItem.id', null);
};
exports.deleteMissingItems = deleteMissingItems;
const fixItemsWithInvalidMediaItemId = async knex => {
  await fixEpisodesWithInvalidMediaItemId(knex);
  await fixSeasonsWithInvalidMediaItemId(knex);
  await deleteMissingItems(knex);
};
exports.fixItemsWithInvalidMediaItemId = fixItemsWithInvalidMediaItemId;
//# sourceMappingURL=20220312002700_mediaItemSlug.js.map