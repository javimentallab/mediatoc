"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.formatNotification = void 0;
var _utils = require("../utils");
const formatNotification = fn => {
  return {
    plainText: fn({
      bold: message => message,
      url: (message, url) => message,
      italic: message => message,
      mediaItemUrl: mediaItem => mediaItem.title
    }),
    markdown: fn({
      bold: message => `**${message}**`,
      url: (message, url) => `[${message}](${url})`,
      italic: message => `*${message}*`,
      mediaItemUrl: mediaItem => `**[${mediaItem.title}](${(0, _utils.generateExternalUrl)(mediaItem)})**`
    }),
    html: fn({
      bold: message => `<b>${message}</b>`,
      url: (message, url) => `<a href="${url}">${message}</a>`,
      italic: message => `<em>${message}</em>`,
      mediaItemUrl: mediaItem => `<b><a href="${(0, _utils.generateExternalUrl)(mediaItem)}">${mediaItem.title}</a></b>`
    }),
    BBCode: fn({
      bold: message => `[b]${message}[/b]`,
      url: (message, url) => `[url=${url}]${message}[/url]`,
      italic: message => `[i]${message}[/i]`,
      mediaItemUrl: mediaItem => `[b][url=${(0, _utils.generateExternalUrl)(mediaItem)}]${mediaItem.title}[/url][/b]`
    })
  };
};
exports.formatNotification = formatNotification;
//# sourceMappingURL=notificationFormatter.js.map