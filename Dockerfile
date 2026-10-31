# MediaOCD. The app is in app/ (server in app/build, web client in app/public) and is
# copied as is: no build step, no third-party image besides the official Node one.
# Bump Node by changing tag + digest here
# (curl -s https://hub.docker.com/v2/repositories/library/node/tags/<tag> -> .digest).
FROM node:22.23.4-alpine3.23@sha256:206878a60dc7014193f418ab9259b6110c15fbd514b3044a267be706509944e4

# abc user (uid/gid 1000, remapped by PUID/PGID in docker/entrypoint.sh). --non-unique:
# node:alpine already has `node` on 1000. curl is used by the app (execFile) and shadow
# by the entrypoint. sharp bundles its own libvips (@img/sharp-libvips-linuxmusl-x64).
RUN apk add --no-cache curl shadow && \
    groupadd --non-unique --gid 1000 abc && \
    useradd --non-unique --create-home --uid 1000 --gid abc abc

ENV PORT=7481 PUID=1000 PGID=1000 \
    DATABASE_PATH=/storage/data.db ASSETS_PATH=/assets LOGS_PATH=/logs \
    NODE_ENV=production
VOLUME ["/storage", "/assets", "/logs"]
WORKDIR /app
EXPOSE 7481

# OS packages with fixes available (Trivy HIGH/CRITICAL on the Alpine base).
RUN apk update && apk upgrade --no-cache --available && rm -rf /var/cache/apk/*

# Dependencies: exactly the tree in app/package-lock.json. better-sqlite3's install script
# fetches the musl prebuilt for this Node; the temporary toolchain is only the fallback.
# npm/npx/corepack are deleted in this same layer: nothing after it runs them, and the
# copy bundled in the node image carries its own HIGH CVEs that would fail Trivy.
# To change a dependency: edit app/package.json, build, then
#   docker cp mediaocd:/app/package-lock.json app/
COPY app/package.json app/package-lock.json /app/
RUN cd /app && \
    apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm install --legacy-peer-deps --no-audit --no-fund 2>&1 | tail -25 && \
    apk del .build-deps && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack && \
    rm -rf /root/.npm /root/.cache /var/cache/apk/*

# express's nested path-to-regexp forced to 0.1.13 (CVE-2026-4867, ReDoS): npm overrides
# don't reach it, so the 0.1.13 tarball replaces the nested copy, and express's own
# package.json declares it so audits match what is on disk.
RUN cd /tmp && \
    wget -q https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-0.1.13.tgz && \
    mkdir -p ptr && tar xzf path-to-regexp-0.1.13.tgz -C ptr && \
    rm -rf /app/node_modules/express/node_modules/path-to-regexp && \
    mv ptr/package /app/node_modules/express/node_modules/path-to-regexp && \
    rm -rf /tmp/ptr /tmp/path-to-regexp-0.1.13.tgz && \
    node -e " \
      const fs = require('fs'), p = '/app/node_modules/express/package.json'; \
      const j = JSON.parse(fs.readFileSync(p, 'utf8')); \
      j.dependencies['path-to-regexp'] = '0.1.13'; \
      fs.writeFileSync(p, JSON.stringify(j, null, 2)); \
      console.log('path-to-regexp (express nested) -> ' + require('/app/node_modules/express/node_modules/path-to-regexp/package.json').version); \
    "

# Smoke test: LOAD the packages most likely to break (native sharp/libvips on musl,
# better-sqlite3, argon2, nanoid that must stay CJS), not just read their package.json.
RUN cd /app && for p in axios fast-xml-parser form-data lodash ajv nanoid sharp proxy-addr; do \
      echo "$p: $(node -p "require('$p/package.json').version")"; \
    done && node -e " \
      const sharp = require('sharp'); \
      const n = require('nanoid'); \
      if (typeof sharp !== 'function') throw new Error('sharp does not export a function'); \
      for (const f of ['nanoid', 'customAlphabet', 'customRandom', 'random']) { \
        if (typeof n[f] !== 'function') throw new Error('nanoid: missing export ' + f); \
      } \
      if (typeof n.urlAlphabet !== 'string') throw new Error('nanoid: missing urlAlphabet'); \
      const db = new (require('better-sqlite3'))(':memory:'); \
      if (db.prepare('select 1 as x').get().x !== 1) throw new Error('better-sqlite3: bad query result'); \
      if (typeof require('argon2').hash !== 'function') throw new Error('argon2: missing hash'); \
      console.log('smoke: node ' + process.version + ' / sharp ' + sharp.versions.sharp + ' + better-sqlite3 + argon2 + nanoid CJS OK'); \
      sharp({ create: { width: 4, height: 4, channels: 3, background: '#f00' } }).resize(2).jpeg().toBuffer() \
        .then((b) => { if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('sharp: bad JPEG'); console.log('smoke: sharp resize+jpeg OK'); }); \
    "

# The app itself, then the pre-compressed copies the server sends to clients that accept
# br/gzip (Cloudflare always does): without them those clients would get stale files.
COPY docker /docker
COPY app/build /app/build
COPY app/public /app/public
RUN cd /app/public && node -e " \
      const fs = require('fs'), zlib = require('zlib'); \
      for (const f of fs.readdirSync('.').filter(f => /\.(js|css)$/.test(f))) { \
        const d = fs.readFileSync(f); \
        fs.writeFileSync(f + '.gz', zlib.gzipSync(d, { level: 9 })); \
        fs.writeFileSync(f + '.br', zlib.brotliCompressSync(d)); \
        console.log('compressed ' + f); \
      } \
      new Function(fs.readFileSync(fs.readdirSync('.').find(f => /^main_.*\.js$/.test(f)), 'utf8')); \
      console.log('web client parses OK'); \
    "

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -q -O /dev/null "http://$(hostname):7481/api/configuration" || exit 1
ENTRYPOINT ["sh", "/docker/entrypoint.sh"]
