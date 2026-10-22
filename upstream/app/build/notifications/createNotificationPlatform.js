"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createNotificationPlatform = void 0;
const createNotificationPlatform = args => {
  return {
    name: args.name,
    credentialNames: 'credentialNames' in args ? args.credentialNames : undefined,
    credentialName: 'credentialName' in args ? args.credentialName : undefined,
    sendFunction: args.sendFunction
  };
};
exports.createNotificationPlatform = createNotificationPlatform;
//# sourceMappingURL=createNotificationPlatform.js.map