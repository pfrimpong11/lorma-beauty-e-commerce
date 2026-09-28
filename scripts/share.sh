#!/usr/bin/env bash
#
# Expose the POS through an ngrok tunnel.
#
# Starts the stack in tunnel mode (the API proxied under the frontend's own
# origin) and then opens the tunnel. See docs/deployment/tunnel.md.
#
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${FRONTEND_PORT:-3200}"

if ! command -v ngrok >/dev/null 2>&1; then
  cat <<'MSG'
ngrok is not installed.

  macOS    brew install ngrok
  other    https://ngrok.com/download

Then authenticate once with the token from your ngrok dashboard:

  ngrok config add-authtoken <your-token>
MSG
  exit 1
fi

echo "Starting the stack in tunnel mode…"
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d

echo "Waiting for the POS to answer…"
for _ in $(seq 1 45); do
  if curl -sf -o /dev/null "http://localhost:${PORT}/healthz"; then break; fi
  sleep 2
done

if ! curl -sf -o /dev/null "http://localhost:${PORT}/healthz"; then
  echo "The POS did not come up. Check: docker compose logs -f frontend" >&2
  exit 1
fi

cat <<MSG

The POS is running locally on http://localhost:${PORT}

Opening the tunnel. Once ngrok prints a Forwarding URL, open it in a browser:

  <url>/till    the selling till
  <url>/admin   the back office

Sign in with the credentials for the account you want to use.
Press Ctrl-C to close the tunnel; the stack keeps running.

MSG

exec ngrok http "${PORT}"
