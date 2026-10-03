#!/usr/bin/env bash
#
# Container entrypoint. Downloads the pinned jars on first boot, then replaces
# itself with `mc start` so the JVM is a direct child of PID 1 and receives
# `docker stop` signals properly.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "${1:-start}" == "start" && $# -le 1 ]]; then
  # --yes so a fresh container does not block on the install prompt. `mc install`
  # still refuses to continue if eula.txt is false, which is the prompt that
  # actually matters.
  if [[ ! -f "$MC_SERVER_DIR/paper.jar" ]]; then
    MC_ASSUME_YES=1 ./mc install
  fi
  exec ./mc start
fi

exec "$@"