"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.initialize = exports.createAndStartServer = exports.createAndStartErrorServer = exports.Server = exports.Application = void 0;
var _core = require("@lingui/core");
var _chalk = _interopRequireDefault(require("chalk"));
var _path = require("path");
var _cookieParser = _interopRequireDefault(require("cookie-parser"));
var _express = _interopRequireDefault(require("express"));
var _expressSession = _interopRequireDefault(require("express-session"));
var _nanoid = require("nanoid");
var _passport = _interopRequireDefault(require("passport"));
var _config = require("./config");
var _logger = require("./logger");
var _httpLogMiddleware = require("./middlewares/httpLogMiddleware");
var _token = require("./middlewares/token");
var _globalSettings = require("./repository/globalSettings");
var _sessionKey = require("./repository/sessionKey");
var _user = require("./repository/user");
var _sessionStore = require("./sessionStore");
var _auth = require("./auth");
var _routes = require("./generated/routes/routes");
var _errorLoggerMiddleware = require("./middlewares/errorLoggerMiddleware");
var _i18n = require("./i18n/i18n");
var _dbconfig = require("./dbconfig");
var _utils = require("./utils");
var _updateMetadata = require("./updateMetadata");
var _sendNotifications = require("./sendNotifications");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class Server {
  #app;
  #server;
  #config;
  constructor(config) {
    if (config.sessionKey.trim().length === 0) {
      throw new Error('sessionKey cannot be empty');
    }
    this.#config = config;
  }
  create() {
    this.#app = (0, _express.default)();
    this.#app.use((0, _expressSession.default)({
      secret: this.#config.sessionKey,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: true,
        maxAge: 1000 * 60 * 60 * 24 * 365
      },
      store: new _sessionStore.SessionStore()
    }));
    this.#app.use(_httpLogMiddleware.httpLogMiddleware);
    this.#app.use((0, _cookieParser.default)());
    this.#app.use(_express.default.json());
    this.#app.use(_passport.default.initialize());
    this.#app.use(_passport.default.session());
    this.#app.use(_token.AccessTokenMiddleware.authorize);
    this.#app.get(/\.(?:js|css|woff2)$/, (req, res, next) => {
      res.set('Cache-Control', 'max-age=31536000');
      next();
    });
    this.#app.get(/\.(?:js|css)$/, (req, res, next) => {
      const extension = (0, _path.parse)(req.path).ext;
      const setHeaders = () => {
        if (extension === '.css') {
          res.set('Content-Type', 'text/css; charset=UTF-8');
        } else {
          res.set('Content-Type', 'application/javascript; charset=UTF-8');
        }
      };
      if (req.header('Accept-Encoding').includes('br')) {
        req.url = req.url + '.br';
        res.set('Content-Encoding', 'br');
        setHeaders();
      } else if (req.header('Accept-Encoding').includes('gz')) {
        req.url = req.url + '.gz';
        res.set('Content-Encoding', 'gzip');
        setHeaders();
      }
      next();
    });
    this.#app.use(_express.default.static(this.#config.publicPath));
    this.#app.use(_express.default.static(this.#config.assetsPath));
    this.#app.use((req, res, next) => {
      if (['/api/user', '/api/user/login', '/api/user/register', '/api/configuration', '/oauth/device/code', '/oauth/device/token'].includes(req.path)) {
        next();
      } else {
        (0, _auth.requireUserAuthentication)(req, res, next);
      }
    });
    this.#app.use(_routes.generatedRoutes);
    this.#app.use(_errorLoggerMiddleware.errorLoggerMiddleware);
    return this.#app;
  }
  async listen() {
    if (!this.#app) {
      throw new Error('Server was not create');
    }
    await new Promise((resolve, reject) => {
      this.#server = this.#app.listen(this.#config.port, this.#config.hostname, async () => {
        try {
          const address = `http://${this.#config.hostname}:${this.#config.port}`;
          _logger.logger.info(/*i18n*/_core.i18n._("MediaTracker {0} listening at {address}", {
            0: _config.Config.version,
            address: address
          }));
          this.#server.on('close', async () => {
            _logger.logger.info(/*i18n*/_core.i18n._("Server closed"));
          });
          const onCloseHandler = async signal => {
            _logger.logger.info(/*i18n*/_core.i18n._("Received signal {signal}", {
              signal: signal
            }));
            this.#server.close();
            await _dbconfig.Database.knex.destroy();

            // eslint-disable-next-line no-process-exit
            process.exit();
          };
          process.once('SIGHUP', onCloseHandler);
          process.once('SIGINT', onCloseHandler);
          process.once('SIGTERM', onCloseHandler);
          process.once('SIGKILL ', onCloseHandler);
          resolve();
          await (0, _utils.catchAndLogError)(_sendNotifications.sendNotifications);
          if (this.#config.production) {
            await (0, _utils.catchAndLogError)(_updateMetadata.updateMetadata);
            setInterval(async () => {
              await (0, _utils.catchAndLogError)(_updateMetadata.updateMetadata);
              await (0, _utils.catchAndLogError)(_sendNotifications.sendNotifications);
            }, (0, _utils.durationToMilliseconds)({
              hours: 1
            }));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  async close() {
    if (this.#server) await new Promise((resolve, reject) => this.#server.close(e => e ? reject(e) : resolve()));
  }
}
exports.Server = Server;
class Application {
  #server;
  #config;
  #sessionKey;
  constructor(config) {
    this.#config = config;
  }
  async initialize() {
    _config.Config.migrate();
    _config.Config.validate();
    (0, _i18n.setupI18n)(this.#config.serverLang);
    _logger.logger.init();
    _dbconfig.Database.init();
    await _dbconfig.Database.runMigrations();
    const configuration = await _globalSettings.configurationRepository.findOne();
    if (!configuration) {
      await _globalSettings.configurationRepository.create({
        enableRegistration: true,
        serverLang: this.#config.serverLang,
        tmdbLang: this.#config.tmdbLang,
        audibleLang: this.#config.audibleLang,
        igdbClientId: this.#config.igdbClientId,
        igdbClientSecret: this.#config.igdbClientSecret
      });
    } else {
      await _globalSettings.configurationRepository.update({
        serverLang: this.#config.serverLang || configuration.serverLang,
        tmdbLang: this.#config.tmdbLang || configuration.tmdbLang,
        audibleLang: this.#config.audibleLang || configuration.audibleLang,
        igdbClientId: this.#config.igdbClientId || configuration.igdbClientId,
        igdbClientSecret: this.#config.igdbClientSecret || configuration.igdbClientSecret
      });
    }
    if (this.#config.demo) {
      const demoUser = await _user.userRepository.findOne({
        name: 'demo'
      });
      if (!demoUser) {
        await _user.userRepository.create({
          name: 'demo',
          password: 'demo',
          admin: false
        });
      } else {
        await _user.userRepository.update({
          id: demoUser.id,
          password: 'demo',
          admin: false
        });
      }
      await _globalSettings.configurationRepository.update({
        enableRegistration: false
      });
      _logger.logger.info(_chalk.default.green.bold(/*i18n*/_core.i18n._("DEMO mode enabled")));
    }
    let sessionKey = await _sessionKey.sessionKeyRepository.findOne();
    if (!sessionKey) {
      sessionKey = {
        key: (0, _nanoid.nanoid)(1024),
        createdAt: new Date().getTime()
      };
      await _sessionKey.sessionKeyRepository.create(sessionKey);
    }
  }
}
exports.Application = Application;
const initialize = async args => {
  const {
    serverLang,
    tmdbLang,
    audibleLang,
    igdbClientId,
    igdbClientSecret,
    demo
  } = args;
  _config.Config.migrate();
  _config.Config.validate();
  _logger.logger.init();
  _dbconfig.Database.init();
  await _dbconfig.Database.runMigrations();
  _logger.logger.info(`Server timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  _logger.logger.info(`Server time: ${new Date().toLocaleString()}`);
  let configuration = await _globalSettings.configurationRepository.get();
  if (!configuration) {
    await _globalSettings.configurationRepository.create({
      enableRegistration: true,
      serverLang: serverLang || 'en',
      tmdbLang: tmdbLang || 'en',
      audibleLang: audibleLang || 'us',
      igdbClientId: igdbClientId,
      igdbClientSecret: igdbClientSecret
    });
  } else {
    await _globalSettings.configurationRepository.update({
      serverLang: serverLang || configuration.serverLang,
      tmdbLang: tmdbLang || configuration.tmdbLang,
      audibleLang: audibleLang || configuration.audibleLang,
      igdbClientId: igdbClientId || configuration.igdbClientId,
      igdbClientSecret: igdbClientSecret || configuration.igdbClientSecret
    });
  }
  configuration = await _globalSettings.configurationRepository.get();
  (0, _i18n.setupI18n)(configuration.serverLang);
  if (demo) {
    const demoUser = await _user.userRepository.findOne({
      name: 'demo'
    });
    if (!demoUser) {
      await _user.userRepository.create({
        name: 'demo',
        password: 'demo',
        admin: false
      });
    }
    await _globalSettings.configurationRepository.update({
      enableRegistration: false
    });
    _logger.logger.info(_chalk.default.green.bold(/*i18n*/_core.i18n._("DEMO mode enabled")));
  }
  let sessionKey = await _sessionKey.sessionKeyRepository.findOne();
  if (!sessionKey) {
    sessionKey = {
      key: (0, _nanoid.nanoid)(1024),
      createdAt: new Date().getTime()
    };
    await _sessionKey.sessionKeyRepository.create(sessionKey);
  }
  return {
    sessionKey: sessionKey.key
  };
};
exports.initialize = initialize;
const createAndStartErrorServer = args => {
  const {
    error,
    hostname,
    port
  } = args;
  const server = (0, _express.default)();
  server.all('*', (req, res) => {
    res.status(500);
    res.send(String.raw`
          <!DOCTYPE html>
          <html lang="en">
            <meta charset="UTF-8" />
            <title>MediaTracker</title>
            <meta
              name="viewport"
              content="width=device-width,initial-scale=1"
            />
            <style></style>
            <body>
              <div>
                <h1>500: Server error</h1>
                <p>${String(error)}</p>
              </div>
            </body>
          </html>
        `);
  });
  server.listen(port, hostname, () => {
    const address = `http://${hostname}:${port}`;
    console.log(`starting server at ${address}`);
  });
};
exports.createAndStartErrorServer = createAndStartErrorServer;
const createAndStartServer = async () => {
  let server;
  try {
    const res = await initialize({
      serverLang: _config.Config.SERVER_LANG,
      tmdbLang: _config.Config.TMDB_LANG,
      audibleLang: _config.Config.AUDIBLE_LANG,
      igdbClientId: _config.Config.IGDB_CLIENT_ID,
      igdbClientSecret: _config.Config.IGDB_CLIENT_SECRET,
      demo: _config.Config.DEMO
    });
    server = new Server({
      hostname: _config.Config.HOSTNAME,
      port: _config.Config.PORT,
      assetsPath: _config.Config.ASSETS_PATH,
      publicPath: _config.Config.PUBLIC_PATH,
      sessionKey: res.sessionKey,
      production: _config.Config.NODE_ENV === 'production'
    });
    server.create();
    await server.listen();
  } catch (error) {
    var _server;
    await ((_server = server) === null || _server === void 0 ? void 0 : _server.close());
    console.log(_chalk.default.red.bold(error.stack || error));
    createAndStartErrorServer({
      hostname: _config.Config.HOSTNAME,
      port: _config.Config.PORT,
      error: error
    });
  }
};
exports.createAndStartServer = createAndStartServer;
//# sourceMappingURL=server.js.map