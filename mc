#!/usr/bin/env bash
#
# mc — control script for the Minecraft server in this repository.
#
# Paper (Java edition) with Geyser + Floodgate, so Java and Bedrock players
# share one world. Everything the server needs is pinned in VERSION and every
# jar is checksum-verified before it is trusted.
#
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$REPO_ROOT/lib/common.sh"

# ---- helpers ----------------------------------------------------------------

usage() {
  cat <<'USAGE'
mc — Paper + Geyser/Floodgate Minecraft server

Usage: mc <command> [options]

Commands
  install          Verify Java, seed config, download + checksum the jars
  start            Run the server in the foreground (Ctrl-C stops it cleanly)
  stop             Ask a running server to shut down
  restart          stop, then start
  status           Report whether the server is up, plus memory settings
  logs [-f] [n]    Print the last n lines of the server log (default 50; -f to follow)
  console <cmd>    Send a command to the running server, e.g. `mc console op Steve`
  backup           Stop-and-zip a consistent snapshot into backups/
  update [--apply] Show newer Paper/Geyser/Floodgate builds; --apply re-pins
  help             This text

Options
  --yes            Skip the confirmation prompt on `backup` and `update --apply`

Examples
  mc install
  mc start
  mc console op Steve
  mc update --apply
USAGE
}

confirm() {
  local prompt="$1"
  if [[ "${MC_ASSUME_YES:-0}" == "1" ]]; then
    return 0
  fi
  local reply
  read -r -p "$prompt [y/N] " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]]
}

# Downloads a jar to dest, skipping the transfer when the existing copy already
# matches the pinned checksum. Refuses to leave a mismatched file in place.
fetch_jar() {
  local url="$1" dest="$2" expected="$3" label="$4"

  if [[ -f "$dest" ]]; then
    local actual
    actual="$(sha256_of "$dest")"
    if [[ "$actual" == "$expected" ]]; then
      ok "$label already present and verified"
      return 0
    fi
    warn "$label checksum mismatch, re-downloading"
    rm -f "$dest"
  fi

  mkdir -p "$(dirname "$dest")"
  log "downloading $label"
  dim "$url"

  local tmp="$dest.part"
  # curl's progress meter is one line of carriage returns per update, which is
  # unreadable in a systemd journal or `docker logs`. Only show it to a terminal.
  local meter=(-sS)
  [[ -t 1 ]] && meter=(--progress-bar)
  if ! curl -fSL --retry 3 --retry-delay 2 "${meter[@]}" -o "$tmp" "$url"; then
    rm -f "$tmp"
    die "download failed for $label"
  fi

  local actual
  actual="$(sha256_of "$tmp")"
  if [[ "$actual" != "$expected" ]]; then
    rm -f "$tmp"
    err "checksum mismatch for $label"
    dim "expected $expected"
    dim "actual   $actual"
    die "refusing to install $label"
  fi

  mv -f "$tmp" "$dest"
  ok "$label installed and verified"
}

# ---- commands ---------------------------------------------------------------

cmd_install() {
  load_versions
  load_local_env
  require_cmd curl

  log "Minecraft ${MINECRAFT_VERSION} — Paper build ${PAPER_BUILD}, Java ${JAVA_MAJOR}+"
  check_java

  mkdir -p "$SERVER_DIR" "$PLUGINS_DIR"
  seed_config
  check_eula

  fetch_jar "$(paper_url)" "$PAPER_JAR" "$PAPER_SHA256" \
    "paper ${MINECRAFT_VERSION} build ${PAPER_BUILD}"
  fetch_jar "$(geyser_url)" "$GEYSER_JAR" "$GEYSER_SHA256" \
    "geyser ${GEYSER_VERSION} build ${GEYSER_BUILD}"
  fetch_jar "$(floodgate_url)" "$FLOODGATE_JAR" "$FLOODGATE_SHA256" \
    "floodgate ${FLOODGATE_VERSION} build ${FLOODGATE_BUILD}"

  echo
  ok "install complete"
  dim "Java clients:      <your-host>:25565"
  dim "Bedrock clients:   <your-host>:19132   (needs UDP 19132 open too)"
  dim "start with:        mc start"
}

cmd_start() {
  load_versions
  load_local_env
  check_java
  check_eula

  [[ -f "$PAPER_JAR" ]] || die "paper.jar missing. Run 'mc install' first."
  if [[ -f "$PLUGINS_DIR/geyser.jar" && ! -f "$PLUGINS_DIR/floodgate.jar" ]]; then
    warn "geyser is installed but floodgate is not — Bedrock players cannot join"
  fi

  local pid
  if pid="$(server_pid)"; then
    die "already running as pid $pid. Use 'mc stop' first."
  fi
  rm -f "$PID_FILE"

  local opts
  mapfile -t opts < <(jvm_flags)

  log "starting Minecraft ${MINECRAFT_VERSION} (${MIN_MEMORY}–${MAX_MEMORY})"

  # The console FIFO: opened read-write so this shell is simultaneously a reader
  # and a writer. Java takes fd 3 as stdin, so the server never sees EOF on its
  # console and `mc console` can inject commands with no pty in between.
  rm -f "$FIFO"
  mkfifo -m 600 "$FIFO"
  exec 3<>"$FIFO"

  java \
    "-Xms${MIN_MEMORY}" \
    "-Xmx${MAX_MEMORY}" \
    "${opts[@]}" \
    -jar "$PAPER_JAR" \
    --nogui <&3 &
  local java_pid=$!
  printf '%s' "$java_pid" > "$PID_FILE"

  # Ctrl-C and `systemctl stop` must save the world, not kill it. Forward a
  # console `stop` and keep waiting so the JVM shutdown hook can finish.
  forward_stop() {
    warn "shutting down (console stop)"
    printf 'stop\n' > "$FIFO" 2>/dev/null || true
  }
  trap forward_stop INT TERM

  local rc=0
  # `wait` returns 128+signo when a trapped signal interrupts it, and the child
  # is still alive — so loop until it is really gone.
  while kill -0 "$java_pid" 2>/dev/null; do
    wait "$java_pid" && rc=0 || rc=$?
    (( rc < 128 )) && break
  done
  trap - INT TERM

  rm -f "$PID_FILE" "$FIFO"
  exec 3>&- 3<&-

  if (( rc == 0 )); then
    log "server stopped"
  else
    err "server exited with status $rc — see server/logs/latest.log"
  fi
  return "$rc"
}

cmd_stop() {
  local pid
  if ! pid="$(server_pid)"; then
    warn "server is not running"
    return 0
  fi
  log "stopping server (pid $pid)"
  printf 'stop\n' > "$FIFO" 2>/dev/null || die "console fifo is gone; try 'kill $pid'"

  local waited=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    waited=$((waited + 1))
    if (( waited >= 120 )); then
      err "server did not stop within 120s"
      return 1
    fi
  done
  ok "server stopped cleanly"
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_status() {
  load_versions
  local pid major rc=0
  if pid="$(server_pid)"; then
    ok "running (pid $pid)"
  else
    warn "not running"
    rc=3
  fi
  dim "minecraft  ${MINECRAFT_VERSION}  paper build ${PAPER_BUILD}"
  dim "heap      ${MIN_MEMORY} – ${MAX_MEMORY}"
  dim "geyser    ${GEYSER_VERSION} build ${GEYSER_BUILD}"
  dim "floodgate ${FLOODGATE_VERSION} build ${FLOODGATE_BUILD}"
  dim "ports     25565/tcp (java), 19132/udp (bedrock)"
  if command -v java >/dev/null 2>&1 && major="$(java_major)"; then
    dim "java      ${major}"
  else
    dim "java      not found"
  fi
  return "$rc"
}

cmd_logs() {
  local follow=0 lines=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -f|--follow) follow=1; shift ;;
      -*)           die "unknown option for mc logs: $1" ;;
      *)
        [[ -z "$lines" ]] || die "usage: mc logs [-f] [lines]"
        lines="$1"
        shift
        ;;
    esac
  done

  local log_file="$SERVER_DIR/logs/latest.log"
  [[ -f "$log_file" ]] || die "no log yet at $log_file. Has the server ever started?"

  # Snapshot by default so `mc logs` can be used in a script; -f to stream.
  if (( follow )); then
    dim "following $log_file — Ctrl-C to stop"
    tail -n "${lines:-50}" -f "$log_file"
  else
    tail -n "${lines:-50}" "$log_file"
  fi
}

cmd_console() {
  [[ $# -gt 0 ]] || die "usage: mc console <command>"
  server_pid >/dev/null || die "server is not running"
  printf '%s\n' "$*" > "$FIFO"
  ok "sent: $*"
}

cmd_backup() {
  load_versions
  require_cmd zip
  local pid
  if pid="$(server_pid)"; then
    confirm "Server is running (pid $pid). Stop it for a consistent snapshot?" \
      || die "cancelled"
    cmd_stop
  fi

  [[ -d "$SERVER_DIR" ]] || die "server/ does not exist yet. Run 'mc install'."

  # Build an explicit list: `zip` exits non-zero on a pattern that matches
  # nothing, and worlds/ directories only exist once they have been visited.
  local -a items=()
  local item
  for item in world world_nether world_the_end playerdata; do
    [[ -e "$SERVER_DIR/$item" ]] && items+=("$item")
  done
  for item in whitelist.json ops.json banned-players.json banned-ips.json server.properties; do
    [[ -f "$SERVER_DIR/$item" ]] && items+=("$item")
  done
  while IFS= read -r -d '' dir; do
    items+=("${dir#"$SERVER_DIR/"}")
  done < <(find "$SERVER_DIR/plugins" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)

  (( ${#items[@]} > 0 )) || die "nothing worth backing up yet in server/"

  mkdir -p "$BACKUP_DIR"
  local stamp archive
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  archive="$BACKUP_DIR/server-${MINECRAFT_VERSION}-${stamp}.zip"

  log "writing $archive"
  # Selections first, -x last: zip stops parsing options at the first bare
  # argument, so an exclusion placed earlier consumes the whole file list.
  # Jars are excluded because they are re-fetchable from VERSION any time.
  ( cd "$SERVER_DIR" && zip -qr "$archive" "${items[@]}" -x '*.jar' )
  [[ -s "$archive" ]] || die "zip produced nothing at $archive"
  ok "$(du -h "$archive" | cut -f1) at $archive"
  dim "back up regularly — worlds are not in git"
}

# Resolves the newest published build for each pinned component, preferring the
# Paper STABLE channel over alpha/beta so an update never lands a server on a
# pre-release. Sets NEW_* globals.
resolve_updates() {
  local builds project meta
  builds="$(curl -fsSL --max-time 30 \
    "https://fill.papermc.io/v3/projects/paper/versions/${MINECRAFT_VERSION}/builds")"

  # sort_by/last rather than max(): jq only grew max() in 1.7, and Ubuntu 22.04
  # still ships 1.6.
  NEW_PAPER_BUILD="$(printf '%s' "$builds" | json_eval \
    '[.[] | select(.channel == "STABLE")] | sort_by(.id) | last | .id' \
    'max(b["id"] for b in d if b["channel"] == "STABLE")')"

  NEW_PAPER_SHA="$(printf '%s' "$builds" | json_eval \
    '.[] | select(.id == '"$NEW_PAPER_BUILD"') | .downloads."server:default".checksums.sha256' \
    'next(b["downloads"]["server:default"]["checksums"]["sha256"] for b in d if b["id"] == '"$NEW_PAPER_BUILD"')')"

  [[ -n "$NEW_PAPER_BUILD" && "$NEW_PAPER_BUILD" != "null" ]] \
    || die "no STABLE paper build published for ${MINECRAFT_VERSION}"
  [[ -n "$NEW_PAPER_SHA" ]] || die "could not read the checksum for paper build ${NEW_PAPER_BUILD}"

  local project meta prefix version build sha
  for project in geyser floodgate; do    [[ "$project" == "geyser" ]] && prefix="NEW_GEYSER_" || prefix="NEW_FLOODGATE_"
    meta="$(curl -fsSL --max-time 30 \
      "https://download.geysermc.org/v2/projects/${project}/versions/latest/builds/latest")"
    version="$(printf '%s' "$meta" | json_eval '.version' 'd["version"]')"
    build="$(printf '%s' "$meta" | json_eval '.build' 'd["build"]')"
    sha="$(printf '%s' "$meta" | json_eval '.downloads.spigot.sha256' \
      'd["downloads"]["spigot"]["sha256"]')"
    [[ -n "$version" && -n "$build" && -n "$sha" ]] \
      || die "could not read the latest ${project} build metadata"
    printf -v "${prefix}VERSION" '%s' "$version"
    printf -v "${prefix}BUILD" '%s' "$build"
    printf -v "${prefix}SHA256" '%s' "$sha"
  done
}

cmd_update() {
  load_versions
  load_local_env
  require_cmd curl
  local apply=0
  [[ "${1:-}" == "--apply" ]] && apply=1

  log "checking for newer builds"
  resolve_updates

  local changes=0 label
  # Compare a pinned value against what the API reports right now.
  compare() {
    local old="$1" new="$2"
    if [[ "$old" == "$new" ]]; then
      ok "$label: $old (current)"
    else
      warn "$label: $old -> $new"
      changes=$((changes + 1))
    fi
  }

  label="paper ${MINECRAFT_VERSION} build"
  compare "$PAPER_BUILD" "$NEW_PAPER_BUILD"
  label="geyser"
  compare "$GEYSER_VERSION build $GEYSER_BUILD" "$NEW_GEYSER_VERSION build $NEW_GEYSER_BUILD"
  label="floodgate"
  compare "$FLOODGATE_VERSION build $FLOODGATE_BUILD" \
    "$NEW_FLOODGATE_VERSION build $NEW_FLOODGATE_BUILD"

  (( changes == 0 )) && { ok "nothing to do"; return 0; }

  (( apply == 0 )) && {
    echo
    dim "re-pin and download with: mc update --apply"
    return 0
  }

  confirm "Apply ${changes} update(s) to VERSION and re-download?" || die "cancelled"

  set_pin() {
    local key="$1" value="$2" tmp
    tmp="$(mktemp)"
    awk -v key="$key" -v value="$value" '
      index($0, key "=") == 1 { print key "=" value; next }
      { print }
    ' "$VERSION_FILE" > "$tmp"
    mv -f "$tmp" "$VERSION_FILE"
  }
  set_pin PAPER_BUILD "$NEW_PAPER_BUILD"
  set_pin PAPER_SHA256 "$NEW_PAPER_SHA"
  set_pin GEYSER_VERSION "$NEW_GEYSER_VERSION"
  set_pin GEYSER_BUILD "$NEW_GEYSER_BUILD"
  set_pin GEYSER_SHA256 "$NEW_GEYSER_SHA256"
  set_pin FLOODGATE_VERSION "$NEW_FLOODGATE_VERSION"
  set_pin FLOODGATE_BUILD "$NEW_FLOODGATE_BUILD"
  set_pin FLOODGATE_SHA256 "$NEW_FLOODGATE_SHA256"
  ok "VERSION updated"

  # Re-read the pins so the fetches below use the new values, then let a local
  # server.env override heap sizing again.
  unset PAPER_BUILD PAPER_SHA256 GEYSER_VERSION GEYSER_BUILD GEYSER_SHA256
  unset FLOODGATE_VERSION FLOODGATE_BUILD FLOODGATE_SHA256
  load_versions
  load_local_env

  fetch_jar "$(paper_url)" "$PAPER_JAR" "$PAPER_SHA256" \
    "paper ${MINECRAFT_VERSION} build ${PAPER_BUILD}"
  fetch_jar "$(geyser_url)" "$GEYSER_JAR" "$GEYSER_SHA256" \
    "geyser ${GEYSER_VERSION} build ${GEYSER_BUILD}"
  fetch_jar "$(floodgate_url)" "$FLOODGATE_JAR" "$FLOODGATE_SHA256" \
    "floodgate ${FLOODGATE_VERSION} build ${FLOODGATE_BUILD}"
  ok "update installed — restart with 'mc restart'"
}

# ---- dispatch ---------------------------------------------------------------

main() {
  local command="${1:-help}"
  if (( $# > 0 )); then
    shift
  fi

  case "$command" in
    install) cmd_install "$@" ;;
    start)   cmd_start "$@" ;;
    stop)    cmd_stop "$@" ;;
    restart) cmd_restart "$@" ;;
    status)  cmd_status "$@" ;;   # exit 3 when stopped, so it works as a health check
    logs)    cmd_logs "$@" ;;
    console) cmd_console "$@" ;;
    backup)  cmd_backup "$@" ;;
    update)  cmd_update "$@" ;;
    help|-h|--help) usage ;;
    *) err "unknown command: $command"; echo; usage; exit 1 ;;
  esac
}

# Pull global flags out of the argument list before dispatch, so
# `mc update --apply --yes` and `mc --yes backup` both work.
args=()
for arg in "$@"; do
  case "$arg" in
    --yes|-y) assume_yes=1 ;;
    *) args+=("$arg") ;;
  esac
done
export MC_ASSUME_YES="${assume_yes:-0}"

if (( ${#args[@]} > 0 )); then
  # Called bare, not as `main ... || status=$?`: putting a function in a `||`
  # list suppresses errexit for everything inside it, which would let a failed
  # download or zip be reported as success.
  main "${args[@]}"
  exit $?
fi

usage
