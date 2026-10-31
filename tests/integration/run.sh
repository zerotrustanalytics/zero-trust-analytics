#!/usr/bin/env bash
# End-to-end tests against a real self-hosted server: for each test, start
# server/index.js on $ZTA_IT_PORT (default 3989) with a throwaway libSQL file, run the test script
# (it gets the repo path and the DB file), stop the server.
#
#   tests/integration/run.sh            # all tests
#   tests/integration/run.sh oidc       # one test
#
# Needs: npm ci in netlify/functions and server.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PORT_="${ZTA_IT_PORT:-3989}"
TMP="$(mktemp -d)"
trap 'kill "${SERVER_PID:-}" 2>/dev/null; rm -rf "$TMP"' EXIT

# Extra environment for a test's server (plain case, so macOS's bash 3.2 works too).
OIDC="AUTH_MODE=oidc GATEKEEP_ISSUER=http://localhost:3997 GATEKEEP_CLIENT_ID=zta"
env_for() {
  case $1 in
    # Multi-user mode: in AUTH_MODE=none everyone is on the unlimited plan, so
    # retention never expires anything and the purge tests would prove nothing.
    ingest) echo "$OIDC" ;;
    purge-enforce) echo "$OIDC RETENTION_PURGE=enforce" ;;
    oidc) echo "$OIDC ADMIN_SECRET=adm1n" ;;
    *) echo "" ;;
  esac
}

run_one() {
  local name=$1 db="$TMP/$1.db"
  rm -f "$db" "$db"-*
  # Server and test process get the same settings (the test imports the
  # storage library, which validates config on load).
  local vars=("PORT=$PORT_" NEXTJS_PORT=$((PORT_ - 1)) SELF_HOSTED=true AUTH_MODE=none NODE_ENV=production
    "TURSO_DATABASE_URL=file:$db" TURSO_AUTH_TOKEN=
    HASH_SECRET=testhashsecret0123456789abcdef0123
    JWT_SECRET=testjwtsecret0123456789abcdef0123456789)
  # shellcheck disable=SC2206
  vars+=($(env_for "$name"))
  env "${vars[@]}" node "$REPO/server/index.js" > "$TMP/$name.server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do curl -sf -o /dev/null "localhost:$PORT_/api/health" && break; sleep 0.5; done

  echo "=== $name"
  env "${vars[@]}" node "$HERE/$name.test.mjs" "$REPO" "$db"
  local rc=$?
  kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null
  if [ $rc -ne 0 ]; then
    echo "--- server log ($name)"; tail -40 "$TMP/$name.server.log"
  fi
  return $rc
}

# Refuse to run against some other server already on the port.
if curl -s -o /dev/null "localhost:$PORT_/api/health"; then
  echo "port $PORT_ is already in use; set ZTA_IT_PORT to a free port" >&2; exit 2
fi

names=("$@")
if [ ${#names[@]} -eq 0 ]; then names=(contact errors ingest link erase purge-enforce oidc); fi

failed=()
for n in "${names[@]}"; do
  run_one "$n" || failed+=("$n")
done

echo
if [ ${#failed[@]} -eq 0 ]; then echo "integration: all ${#names[@]} passed"; else echo "integration: FAILED ${failed[*]}"; exit 1; fi
