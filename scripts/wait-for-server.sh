#!/usr/bin/env bash
set -euo pipefail

URL="${BASE_URL:-http://localhost:3000}/usuarios"
TIMEOUT="${SERVER_TIMEOUT_SECONDS:-120}"

echo "Waiting for ServeRest at $URL (timeout ${TIMEOUT}s)..."
for ((elapsed = 0; elapsed < TIMEOUT; elapsed += 2)); do
  if curl --silent --fail "$URL" > /dev/null; then
    echo "ServeRest is ready after ${elapsed}s"
    exit 0
  fi
  sleep 2
done

echo "ServeRest did not become ready within ${TIMEOUT}s" >&2
exit 1
