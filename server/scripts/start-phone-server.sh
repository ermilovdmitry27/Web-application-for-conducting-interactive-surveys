#!/usr/bin/env bash

set -euo pipefail

PORT=4000

if command -v lsof >/dev/null 2>&1; then
  existing_pid="$(lsof -ti TCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
else
  existing_pid=""
fi

if [ -n "${existing_pid}" ]; then
  existing_cmd="$(ps -p "${existing_pid}" -o args= 2>/dev/null || true)"

  if printf '%s' "${existing_cmd}" | grep -Fq "node server/index.js"; then
    kill "${existing_pid}"
    sleep 1
  else
    printf 'Port %s is already in use by another process:\n%s\n' "${PORT}" "${existing_cmd}" >&2
    exit 1
  fi
fi

exec node server/index.js
