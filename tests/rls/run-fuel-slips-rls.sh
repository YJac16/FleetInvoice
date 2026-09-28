#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/scripts/local-db/bootstrap.sh"
node "$ROOT/tests/rls/fuel-slips.test.mjs"
