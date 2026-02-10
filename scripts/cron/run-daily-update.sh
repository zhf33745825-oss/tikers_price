#!/usr/bin/env sh
set -eu

APP_URL="${APP_URL:-http://127.0.0.1:3000}"
UPDATE_API_TOKEN="${UPDATE_API_TOKEN:-}"

if [ -z "$UPDATE_API_TOKEN" ]; then
  echo "UPDATE_API_TOKEN is required"
  exit 1
fi

curl -sS -X POST \
  -H "x-update-token: ${UPDATE_API_TOKEN}" \
  "${APP_URL}/api/internal/update-daily"

