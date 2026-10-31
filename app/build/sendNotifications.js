"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.sendNotifications = void 0;
var _core = require("@lingui/core");
var _lodash = _interopRequireDefault(require("lodash"));
var _chalk = _interopRequireDefault(require("chalk"));
var _dateFns = require("date-fns");
var _mediaItem = require("./repository/mediaItem");
var _notificationsHistory = require("./repository/notificationsHistory");
var _user = require("./repository/user");
var _notifications = require("./notifications/notifications");
var _notificationPlatformsCredentials = require("./repository/notificationPlatformsCredentials");
var _lock = require("./lock");
var _logger = require("./logger");
var _notificationFormatter = require("./notifications/notificationFormatter");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const notificationForPastItems = async () => {
  const releasedItems = await _mediaItem.mediaItemRepository.itemsToNotify((0, _dateFns.subHours)(new Date(), 24), new Date());
  for (const mediaItem of releasedItems) {
    await sendNotificationForMediaItem(mediaItem);
  }
};
const notificationForFutureItems = async () => {
  const releasedItems = await _mediaItem.mediaItemRepository.itemsToNotify(new Date(), (0, _dateFns.addHours)(new Date(), 1));
  for (const mediaItem of releasedItems) {
    const releaseDate = (0, _dateFns.parseISO)(mediaItem.releaseDate);
    addFutureNotification(async () => (await checkIfNotificationHasBeenSent(mediaItem)) && (await sendNotificationForMediaItem(mediaItem)), releaseDate);
    _logger.logger.debug(`Scheduled notification for release date of "${mediaItem.title}" at ${releaseDate.toUTCString()}`);
  }
};
const notificationForPastEpisodes = async () => {
  const releasedEpisodes = await _mediaItem.mediaItemRepository.episodesToNotify((0, _dateFns.subHours)(new Date(), 24), new Date());
  const grouped = _lodash.default.groupBy(releasedEpisodes, episode => episode.tvShowId);
  for (const episodes of Object.values(grouped)) {
    if (episodes.length === 0) {
      continue;
    }
    await sendNotificationForEpisodes(episodes);
  }
};
const notificationForFutureEpisodes = async () => {
  const futureEpisodes = await _mediaItem.mediaItemRepository.episodesToNotify(new Date(), (0, _dateFns.addHours)(new Date(), 1));
  const groupedByTvShowAndDate = (0, _lodash.default)(futureEpisodes).groupBy(episode => episode.releaseDate).mapValues(value => _lodash.default.groupBy(value, episode => episode.tvShowId)).value();
  for (const groupedByReleaseDate of Object.values(groupedByTvShowAndDate)) {
    for (const groupedByTvShow of Object.values(groupedByReleaseDate)) {
      if (groupedByTvShow.length === 0) {
        continue;
      }
      const episode = groupedByTvShow[0];
      const releaseDate = (0, _dateFns.parseISO)(episode.releaseDate);
      addFutureNotification(async () => sendNotificationForEpisodes(await Promise.all(groupedByTvShow.filter(checkIfNotificationHasBeenSent))), releaseDate);
      _logger.logger.debug(`Scheduled notification for release date of episode "${episode.tvShow.title}" at ${releaseDate.toUTCString()}`);
    }
  }
};
const checkIfNotificationHasBeenSent = async arg => {
  return (await _notificationsHistory.notificationsHistoryRepository.findOne('tvShowId' in arg ? {
    mediaItemId: arg.tvShowId,
    episodeId: arg.id
  } : {
    mediaItemId: arg.id
  })) != null;
};
const sendNotificationForEpisodes = async episodes => {
  if (episodes.length === 0) {
    return;
  }
  const tvShow = episodes[0].tvShow;
  const usersToNotify = await _user.userRepository.findUsersWithMediaItemOnWatchlist({
    mediaItemId: tvShow.id,
    sendNotificationForEpisodesReleases: true
  });
  const title = tvShow.title;
  {
    const count = usersToNotify.length;
    _logger.logger.info(/*i18n*/_core.i18n._("{count, plural, one {Sending notification for new episodes of {title} to # user} other {Sending notification for new episodes of {title} to # users}}", {
      count: count,
      title: title
    }));
  }
  const count = episodes.length;
  const notificationMessage = (0, _notificationFormatter.formatNotification)(f => /*i18n*/_core.i18n._("{count, plural, one {# episode of {0} has been released} other {# episodes of {1} has been released}}", {
    0: f.mediaItemUrl(tvShow),
    1: f.mediaItemUrl(tvShow),
    count: count
  }));
  await sendNotificationForItem({
    mediaItem: tvShow,
    episodes: episodes,
    notificationMessage: notificationMessage,
    users: usersToNotify
  });
};
const sendNotificationForMediaItem = async mediaItem => {
  const title = mediaItem.title;
  const usersToNotify = await _user.userRepository.findUsersWithMediaItemOnWatchlist({
    mediaItemId: mediaItem.id,
    sendNotificationForReleases: true
  });
  const count = usersToNotify.length;
  _logger.logger.info(/*i18n*/_core.i18n._("{count, plural, one {Sending notification for {title} to # user} other {Sending notification for {title} to # users}}", {
    count: count,
    title: title
  }));
  await sendNotificationForItem({
    mediaItem: mediaItem,
    notificationMessage: (0, _notificationFormatter.formatNotification)(f => /*i18n*/_core.i18n._("{0} has been released", {
      0: f.mediaItemUrl(mediaItem)
    })),
    users: usersToNotify
  });
};
const sendNotificationForItem = async args => {
  const {
    mediaItem,
    episodes,
    users,
    notificationMessage
  } = args;
  for (const user of users) {
    const platform = user.notificationPlatform;
    const credentials = await _notificationPlatformsCredentials.notificationPlatformsCredentialsRepository.get(user.id);
    await _notifications.Notifications.sendNotification(platform, {
      message: notificationMessage,
      credentials: credentials[platform]
    });
  }
  if (episodes) {
    await _notificationsHistory.notificationsHistoryRepository.createMany(episodes.map(episode => ({
      mediaItemId: mediaItem.id,
      episodeId: episode.id,
      sendDate: new Date().getTime()
    })));
  } else {
    await _notificationsHistory.notificationsHistoryRepository.create({
      mediaItemId: mediaItem.id,
      sendDate: new Date().getTime()
    });
  }
};
const errorHandler = async fn => {
  try {
    await fn();
  } catch (error) {
    _logger.logger.error(_chalk.default.bold.red(/*i18n*/_core.i18n._("Error sending notifications: {error}", {
      error: error
    })));
  }
};
const addFutureNotification = (fn, date) => {
  setTimeout(() => errorHandler(fn), date.getTime() - new Date().getTime());
};
const sendNotifications = exports.sendNotifications = (0, _lock.createLock)(async () => {
  await errorHandler(async () => {
    await notificationForPastItems();
    await notificationForFutureItems();
    await notificationForPastEpisodes();
    await notificationForFutureEpisodes();
  });
});
//# sourceMappingURL=sendNotifications.js.map