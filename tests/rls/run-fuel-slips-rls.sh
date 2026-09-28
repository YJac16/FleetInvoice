#!/usr/bin/env bash
# Rebuilds the hosted-mimic local database (all migrations incl. 00052) and runs
# the fuel slip database tests (spec v2 §13). Set SKIP_BOOTSTRAP=1 to reuse an
# already-bootstrapped container.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ "${SKIP_BOOTSTRAP:-0}" != "1" ]]; then
  if docker info >/dev/null 2>&1; then
    bash "$ROOT/scripts/local-db/bootstrap.sh" >/tmp/fuel-slips-bootstrap.log 2>&1
  else
    sudo bash "$ROOT/scripts/local-db/bootstrap.sh" >/tmp/fuel-slips-bootstrap.log 2>&1
  fi || { tail -40 /tmp/fuel-slips-bootstrap.log; exit 1; }
fi

node "$ROOT/tests/rls/fuel-slips.test.mjs"
