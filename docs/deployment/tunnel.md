# Reaching the POS from another device (ngrok)

For showing the POS to someone, testing on a real phone or tablet, or
installing the PWA on a device that is not this machine.

```bash
./scripts/share.sh
```

That starts the stack in tunnel mode and opens the tunnel. Open the
`https://….ngrok-free.app` URL it prints:

| | |
| --- | --- |
| `/till` | the selling till |
| `/admin` | the back office |

First time only, install and authenticate ngrok:

```bash
brew install ngrok                       # or https://ngrok.com/download
ngrok config add-authtoken <your-token>  # from your ngrok dashboard
```

---

## Why a special mode is needed

Locally the browser talks to two servers: the page on `:3200` and the API on
`:4000`. The page is *told* the API address, and locally that address is
`http://localhost:4000`.

Through a tunnel that breaks. The visitor's browser is on
`https://xyz.ngrok-free.app`, and `localhost:4000` on their machine is *their*
computer — not the server. Login fails with what looks like a network error.

Tunnel mode routes the API under the frontend's own origin instead:

```
Before                          Tunnel mode
------                          -----------
browser → :3200  (page)         browser → tunnel → :3200 → page
browser → :4000  (API)                                   → /api/* → backend
```

One address, so one tunnel is enough. It also makes the session cookie
first-party, which removes CORS and third-party-cookie problems entirely —
those are the usual reason a tunnelled app can load but not log in.

### What the mode changes

`docker-compose.tunnel.yml` sets four things:

| Setting | Effect |
| --- | --- |
| `API_PROXY_TARGET=http://backend:4000` | The frontend proxies `/api` and `/health` to the API. The injected config switches to relative URLs |
| `TRUST_PROXY=true` | The API trusts `X-Forwarded-*`, so Secure cookies and audit-log client IPs stay correct behind the extra hop |
| `COOKIE_SECURE=true` | Tunnels terminate TLS, so the session cookie is HTTPS-only |
| `COOKIE_SAMESITE=lax` | One origin now, so the cookie does not need the permissive `None` |

Nothing is rebuilt — these are runtime settings, so the same image serves local
and tunnelled use.

---

## Doing it by hand

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d
ngrok http 3200
```

To go back to normal local use:

```bash
docker compose up -d
```

---

## What this is good for

**Testing the PWA properly.** Service workers and install prompts need a secure
context. `localhost` counts, but a LAN address like `192.168.1.x` does not — so
a tunnel is the only way to test installing the POS on a real phone or tablet
without setting up certificates.

**Checking the responsive layouts** on real hardware rather than a resized
browser window.

**Showing someone the POS** without deploying it.

---

## What this is not

**Not a deployment.** A free ngrok URL changes every restart, the tunnel dies
with the terminal, and all traffic goes through a third party. For a real shop,
put the stack behind Nginx, Traefik or a cloud load balancer on your own
domain — the application already supports that, and tunnel mode's settings are
the same ones a reverse proxy needs.

**Not private.** Anyone with the URL reaches the login page. It is a login
page, not an open door, but do not leave a tunnel running unattended with
production data behind it. ngrok's paid tiers add basic-auth and IP
restrictions if you need them.

---

## Troubleshooting

**"You are about to visit…" interstitial**
Free ngrok shows this once per browser. Click through. API calls already send
the header that skips it, so it never interrupts a sale mid-transaction.

**The page loads but login fails**
Almost always the stack was started without the tunnel overlay. Check:

```bash
docker compose exec frontend printenv API_PROXY_TARGET   # http://backend:4000
```

Empty means normal mode — restart with the overlay.

**The page loads but everything says offline**
The connectivity indicator polls `/health/live` through the proxy. Test it:

```bash
curl -s https://<your-url>/health/live
```

**Scanner does not work on the remote device**
Expected. The Newland FR20 is plugged into *this* workstation, not the remote
one. Manual search and manual barcode entry work on any device.

**Printing does nothing on the remote device**
Also expected — printing goes to the printer on the machine running the
browser. A remote phone has none.

## "Cannot reach the server" from another device

The page loads but every API call fails. This is almost never the network.

The frontend serves the API from its own origin at `/api` and forwards it to
the backend, so a browser on a POS terminal or phone never needs to reach port
4000 itself. That forwarding is switched on by `API_PROXY_TARGET` on the
frontend service. With it unset, two things happen together:

- `GET /api/...` returns `503 {"message":"The API proxy is not configured on this server."}`
- the browser is handed the absolute `API_URL` instead — `http://localhost:4000`,
  which on a POS terminal means *that terminal*, not the shop's machine

It therefore works perfectly on the machine running Docker and fails on every
other device, which makes it read as a connection problem.

Check it with:

```sh
curl -s -o /dev/null -w '%%{http_code}\n' -X POST localhost:3200/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}'
```

`503` means the proxy is off. `docker-compose.yml` sets `API_PROXY_TARGET` to
`http://backend:4000` by default; it is read at request time, so a restart is
enough and no rebuild is needed:

```sh
docker compose up -d frontend
```

Confirm the browser is being told to use relative URLs — `apiUrl` must be empty
in the config injected into the page:

```sh
curl -s localhost:3200/login | grep -o '__LORMA_CONFIG__[^<]*' | head -c 120
```
