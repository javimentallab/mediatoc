"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.userNonSensitiveColumns = exports.userColumns = void 0;
const userNonSensitiveColumns = exports.userNonSensitiveColumns = ['id', 'name', 'admin', 'publicReviews', 'sendNotificationWhenStatusChanges', 'sendNotificationWhenReleaseDateChanges', 'sendNotificationWhenNumberOfSeasonsChanges', 'sendNotificationForReleases', 'sendNotificationForEpisodesReleases', 'notificationPlatform', 'hideOverviewForUnseenSeasons', 'hideEpisodeTitleForUnseenEpisodes'];
const userColumns = exports.userColumns = [...userNonSensitiveColumns, 'password'];
//# sourceMappingURL=user.js.map