# Custom domain setup

By default MediaOCD is reachable on the host at `http://localhost:7481`.
To put it behind a public domain (e.g. `mediaocd.example.com`) you need three things,
none of which can be fully automated:

1. A Cloudflare tunnel routing the public hostname to the container.
2. (Optional, for YouTube linking) A Google Cloud OAuth redirect URI authorised for the new domain.
3. The matching `GOOGLE_REDIRECT_URI` env var in your `docker-compose.yml`.

## 1. Cloudflare tunnel

Assuming you already use a Cloudflare Zero Trust tunnel (a `cloudflared` sidecar
with a `--token` argument):

1. Open the **Zero Trust dashboard** → *Networks* → *Tunnels* → pick the tunnel
   that runs your `cloudflared` sidecar.
2. *Public hostname* → *Add a public hostname*.
3. Subdomain: e.g. `mediaocd`. Domain: `example.com`.
4. Type: `HTTP`. URL: `http://mediaocd:7481` (use the container name from your compose).
5. Save.

DNS propagates within a minute. Confirm with:

```sh
curl -sI https://mediaocd.example.com/api/configuration
# expect: HTTP/2 200
```

## 2. Google OAuth (only if you use the YouTube linking feature)

If you don't link YouTube accounts, skip this section.

1. Go to **Google Cloud Console** → *APIs & Services* → *Credentials* → click
   your OAuth 2.0 Client ID.
2. Under *Authorized redirect URIs*, click *Add URI* and paste:
   ```
   https://mediaocd.example.com/api/youtube/oauth/callback
   ```
3. Save.

You can keep the old URI authorised in parallel during cutover so existing links
keep working.

## 3. Compose env var

Edit your `docker-compose.yml` and update:

```yaml
mediaocd:
  environment:
    GOOGLE_REDIRECT_URI: "https://mediaocd.example.com/api/youtube/oauth/callback"
```

Restart:

```sh
docker compose up -d mediaocd
```

## 4. Validate

- Browser: `https://mediaocd.example.com` should load the app.
- YouTube linking: from `/settings/application-tokens`, hit the *Link
  YouTube account* button → the OAuth flow should redirect via the new
  domain and complete without a `redirect_uri_mismatch` error.

## Reverting

If anything breaks: re-add the old hostname in CF, restore the old
`GOOGLE_REDIRECT_URI`, restart.
